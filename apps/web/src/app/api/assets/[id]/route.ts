import { assetPatchSchema, isRecord, type Update } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { purgeAsset } from '@/lib/server/asset-ops';
import { toAssetView } from '@/lib/server/assets';
import { assertInWorkspace } from '@/lib/server/uploads';

export const GET = route({}, async ({ sb, caller, params }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  const [view, versions, license, generation, children] = await Promise.all([
    toAssetView(asset, { original: true }),
    sb.from('asset_versions').select('id, version, note, size_bytes, created_at').eq('asset_id', asset.id).order('version', { ascending: false }).limit(20),
    asset.license_id ? sb.from('licenses').select('*').eq('id', asset.license_id).maybeSingle() : Promise.resolve({ data: null }),
    asset.generation_id ? sb.from('generations').select('id, capability, model, provider, prompt, params, cost_actual_usd, cost_estimate_usd, created_at').eq('id', asset.generation_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('assets').select('id, name, type, created_at').eq('parent_asset_id', asset.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
  ]);
  const meta = isRecord(asset.meta) ? asset.meta : {};
  return {
    asset: view,
    transcript: asset.transcript,
    transcriptLanguage: asset.transcript_language,
    segments: asset.transcript_segments,
    meta: {
      codec: meta.codec ?? null,
      audioCodec: meta.audioCodec ?? null,
      bitrate: meta.bitrate ?? null,
      hasAudio: meta.hasAudio ?? null,
      analysis: meta.analysis ?? null,
      score: meta.score ?? null,
      scenes: meta.scenes ?? null,
      beats: meta.beats ?? null,
      bpm: meta.bpm ?? null,
      loudnessLufs: meta.loudnessLufs ?? null,
      silences: meta.silences ?? null,
      licenseIssues: meta.licenseIssues ?? null,
      sourceUrl: meta.sourceUrl ?? null,
      reframes: meta.reframes ?? null,
    },
    versions: versions.data ?? [],
    license: license.data,
    generation: generation.data,
    derived: children.data ?? [],
  };
});

export const PATCH = route({ body: assetPatchSchema }, async ({ sb, caller, params, body }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  await Promise.all([assertInWorkspace(sb, caller, 'projects', body.projectId), assertInWorkspace(sb, caller, 'folders', body.folderId)]);
  if (body.licenseId) {
    const { data } = await sb.from('licenses').select('id').eq('id', body.licenseId).eq('workspace_id', caller.workspaceId).maybeSingle();
    if (!data) throw badRequest('That license does not exist.');
  }
  const patch: Update<'assets'> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.tags !== undefined) patch.tags = [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (body.isFavorite !== undefined) patch.is_favorite = body.isFavorite;
  if (body.projectId !== undefined) patch.project_id = body.projectId;
  if (body.folderId !== undefined) patch.folder_id = body.folderId;
  if (body.licenseId !== undefined) patch.license_id = body.licenseId;
  if (body.role !== undefined) patch.meta = { ...(isRecord(asset.meta) ? asset.meta : {}), role: body.role } as never;
  const row = check(await sb.from('assets').update(patch).eq('id', asset.id).select('*').single(), 'Could not save');
  return toAssetView(row);
});

/** Moves to the trash; `?permanent=1` deletes a trashed file for good. */
export const DELETE = route({ query: z.object({ permanent: z.coerce.boolean().optional() }) }, async ({ sb, caller, params, query }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  if (query.permanent) {
    if (!asset.deleted_at) throw badRequest('Move the file to the trash first.');
    await purgeAsset(sb, asset);
    return { ok: true, deleted: 'permanent' };
  }
  check(await sb.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', asset.id), 'Could not move to trash');
  return { ok: true, deleted: 'trash' };
});
