import 'server-only';
import { randomUUID } from 'node:crypto';
import { asJson, carriedCredits, displayName, isRecord, sniffMatches, storageKeys, validateUpload, type AssetRow, type UploadCreate } from '@adforge/core';
import { enqueueJob, features, storage, type ServiceClient, type UploadTicket } from '@adforge/core/server';
import { badRequest, check, type Caller } from './api';

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function assertInWorkspace(sb: ServiceClient, caller: Caller, table: 'projects' | 'folders', id: string | null | undefined) {
  if (!id) return;
  const { data } = await sb.from(table).select('id').eq('id', id).eq('workspace_id', caller.workspaceId).maybeSingle();
  if (!data) throw badRequest(`That ${table === 'projects' ? 'project' : 'folder'} does not exist.`);
}

/** Creates the asset row and a direct-to-storage upload ticket (TUS, S3 multipart or single PUT). */
export async function createUpload(sb: ServiceClient, caller: Caller, input: UploadCreate): Promise<{ asset: AssetRow; ticket: UploadTicket }> {
  const v = validateUpload({ name: input.name, size: input.size, type: input.type }, { maxBytes: features().maxUploadBytes });
  if (!v.ok) throw badRequest(v.error);
  if (input.head && input.head.length >= 24 && !sniffMatches(v.mime, hexToBytes(input.head))) {
    throw badRequest('The file contents do not match its type. It may be renamed or damaged.');
  }
  await Promise.all([assertInWorkspace(sb, caller, 'projects', input.projectId), assertInWorkspace(sb, caller, 'folders', input.folderId)]);
  // A file made from another keeps its license and any credits it owes.
  let parent: { license_id: string | null; meta: unknown } | null = null;
  if (input.parentAssetId) {
    const { data } = await sb.from('assets').select('license_id, meta').eq('id', input.parentAssetId).eq('workspace_id', caller.workspaceId).maybeSingle();
    if (!data) throw badRequest('The original file no longer exists.');
    parent = data;
  }
  const credits = parent ? carriedCredits(parent.meta) : [];
  const id = randomUUID();
  const driver = storage();
  const key = storageKeys.original(caller.workspaceId, id, v.ext);
  const ticket = await driver.createUpload(key, v.mime, input.size);
  const asset = check(
    await sb
      .from('assets')
      .insert({
        id,
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        name: displayName(input.name),
        type: v.assetType,
        mime_type: v.mime,
        size_bytes: input.size,
        status: 'uploading',
        source: input.source,
        storage_driver: driver.name,
        storage_key: key,
        project_id: input.projectId ?? null,
        folder_id: input.folderId ?? null,
        parent_asset_id: input.parentAssetId ?? null,
        license_id: parent?.license_id ?? null,
        ...(credits.length ? { meta: asJson({ credits }) } : {}),
        is_ai_generated: input.isAiGenerated ?? false,
        upload_state: asJson({ kind: ticket.kind, uploadId: ticket.kind === 's3' ? ticket.uploadId : undefined, originalName: input.name, startedAt: new Date().toISOString() }),
      })
      .select('*')
      .single(),
    'Could not start the upload',
  );
  return { asset, ticket };
}

export function uploadState(asset: AssetRow): { kind?: string; uploadId?: string; originalName?: string } {
  return isRecord(asset.upload_state) ? (asset.upload_state as { kind?: string; uploadId?: string; originalName?: string }) : {};
}

/** Verifies the stored object, then hands the asset to the worker for thumbnails, proxies and analysis. */
export async function completeUpload(sb: ServiceClient, caller: Caller, asset: AssetRow, parts?: { PartNumber: number; ETag: string }[]): Promise<AssetRow> {
  if (asset.status !== 'uploading') return asset;
  const driver = storage(asset.storage_driver);
  const state = uploadState(asset);
  if (state.kind === 's3') {
    if (!state.uploadId || !parts?.length) throw badRequest('Missing upload parts.');
    await driver.completeUpload(asset.storage_key, state.uploadId, parts);
  }
  const info = await driver.head(asset.storage_key);
  if (!info) throw badRequest('The file did not reach storage. Try uploading again.');
  const head = await driver.readHead(asset.storage_key, 64);
  if (!sniffMatches(asset.mime_type, new Uint8Array(head))) {
    await driver.deleteObjects([asset.storage_key]).catch(() => undefined);
    check(await sb.from('assets').update({ status: 'failed', processing_error: 'The file contents do not match its type.', upload_state: null }).eq('id', asset.id), 'Could not update the asset');
    throw badRequest('The file contents do not match its type. It may be renamed or damaged.');
  }
  const updated = check(
    await sb.from('assets').update({ status: 'processing', size_bytes: info.size, upload_state: null, processing_error: null }).eq('id', asset.id).select('*').single(),
    'Could not finish the upload',
  );
  await enqueueJob(sb, { type: 'media.process', payload: { assetId: asset.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `media.process:${asset.id}:v${asset.version}` });
  await sb.from('activity').insert({ workspace_id: caller.workspaceId, actor_id: caller.userId, verb: 'asset.uploaded', object_type: 'asset', object_id: asset.id, data: { name: asset.name, type: asset.type } });
  return updated;
}
