import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asJson, BUILTIN_SFX_BY_ID, builtinSfxPath, isRecord, licenseState, storageKeys, type AssetMeta, type AssetRow, type LicenseInput, type MusicRow, type Row, type SfxRow } from '@adforge/core';
import { enqueueJob, storage, type ServiceClient } from '@adforge/core/server';
import { type Caller, check, notFound, owned } from './api';
import { assetsByIds, toAssetViews } from './assets';
import type { LicenseView, MusicView, SfxView } from '../types';

type LicenseRow = Row<'licenses'>;

export function toLicenseView(l: LicenseRow): LicenseView {
  return {
    id: l.id,
    kind: l.kind as LicenseView['kind'],
    commercialUse: l.commercial_use,
    source: l.source,
    provider: l.provider,
    termsUrl: l.terms_url,
    notes: l.notes,
    expiresAt: l.expires_at,
    proofAssetId: l.proof_asset_id,
    state: licenseState(l),
    createdAt: l.created_at,
  };
}

async function licensesByIds(sb: ServiceClient, workspaceId: string, ids: (string | null | undefined)[]): Promise<Map<string, LicenseRow>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = check(await sb.from('licenses').select('*').eq('workspace_id', workspaceId).in('id', unique), 'Could not load licenses');
  return new Map(rows.map((l) => [l.id, l]));
}

const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const beatList = (v: unknown) => (Array.isArray(v) ? v.filter((b): b is number => typeof b === 'number' && Number.isFinite(b)) : []);

/** The file's own license wins: it is what exports check. */
export async function toMusicViews(sb: ServiceClient, workspaceId: string, rows: MusicRow[]): Promise<MusicView[]> {
  if (!rows.length) return [];
  const assetIds = rows.map((r) => r.asset_id).filter((x): x is string => !!x);
  const assets = await assetsByIds(sb, workspaceId, assetIds);
  const [views, tracks] = await Promise.all([
    toAssetViews(assets),
    assetIds.length ? sb.from('audio_tracks').select('asset_id, bpm, beats, musical_key, loudness_lufs').eq('workspace_id', workspaceId).in('asset_id', assetIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const assetRow = new Map(assets.map((a) => [a.id, a]));
  const viewById = new Map(views.map((v) => [v.id, v]));
  const trackBy = new Map((tracks.data ?? []).map((t) => [t.asset_id, t]));
  const licenses = await licensesByIds(sb, workspaceId, rows.map((r) => (r.asset_id ? assetRow.get(r.asset_id)?.license_id : null) ?? r.license_id));
  return rows.map((r) => {
    const a = r.asset_id ? assetRow.get(r.asset_id) : undefined;
    const meta = (a && isRecord(a.meta) ? a.meta : {}) as AssetMeta;
    const t = r.asset_id ? trackBy.get(r.asset_id) : undefined;
    const lic = licenses.get(a?.license_id ?? r.license_id ?? '') ?? null;
    const beats = beatList(t?.beats).length ? beatList(t?.beats) : beatList(meta.beats);
    return {
      id: r.id,
      title: r.title,
      genre: r.genre,
      mood: r.mood,
      bpm: num(r.bpm) ?? num(t?.bpm) ?? num(meta.bpm),
      musicalKey: r.musical_key ?? t?.musical_key ?? null,
      durationS: num(a?.duration_s) ?? num(r.duration_s),
      instrumental: r.instrumental,
      lyrics: r.lyrics,
      isAudioLogo: r.is_audio_logo,
      beats,
      loudnessLufs: num(t?.loudness_lufs) ?? num(meta.loudnessLufs),
      generated: !!r.generation_id || a?.source === 'generated',
      asset: (a && !a.deleted_at && viewById.get(a.id)) || null,
      license: lic ? toLicenseView(lic) : null,
      licenseState: licenseState(lic),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/** Built-in effects in the same shape as the workspace's own. */
export function builtinSfxViews(): SfxView[] {
  return Object.values(BUILTIN_SFX_BY_ID).map((s) => ({
    id: `builtin:${s.id}`,
    name: s.name,
    category: s.category,
    tags: s.tags,
    durationS: s.durationS,
    builtinId: s.id,
    url: builtinSfxPath(s.id),
    asset: null,
    licenseState: 'cleared',
    generated: false,
    createdAt: null,
  }));
}

export async function toSfxViews(sb: ServiceClient, workspaceId: string, rows: SfxRow[]): Promise<SfxView[]> {
  if (!rows.length) return [];
  const assets = await assetsByIds(sb, workspaceId, rows.map((r) => r.asset_id).filter((x): x is string => !!x));
  const views = new Map((await toAssetViews(assets)).map((v) => [v.id, v]));
  const assetRow = new Map(assets.map((a) => [a.id, a]));
  const licenses = await licensesByIds(sb, workspaceId, rows.map((r) => (r.asset_id ? assetRow.get(r.asset_id)?.license_id : null) ?? r.license_id));
  return rows.map((r) => {
    const a = r.asset_id ? assetRow.get(r.asset_id) : undefined;
    const view = a && !a.deleted_at ? (views.get(a.id) ?? null) : null;
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      tags: r.tags ?? [],
      durationS: num(a?.duration_s) ?? num(r.duration_s),
      builtinId: null,
      url: view?.url ?? null,
      asset: view,
      licenseState: licenseState(licenses.get(a?.license_id ?? r.license_id ?? '') ?? null),
      generated: !!r.generation_id,
      createdAt: r.created_at,
    };
  });
}

/** Records the rights someone has to a file, ready to attach. */
export async function createLicense(sb: ServiceClient, caller: Caller, input: LicenseInput): Promise<LicenseRow> {
  if (input.proofAssetId) await owned(sb, 'assets', input.proofAssetId, caller, 'The proof file');
  return check(
    await sb
      .from('licenses')
      .insert({
        workspace_id: caller.workspaceId,
        kind: input.kind,
        commercial_use: input.commercialUse,
        source: input.source ?? null,
        terms_url: input.termsUrl ?? null,
        notes: input.notes ?? null,
        expires_at: input.expiresAt ?? null,
        proof_asset_id: input.proofAssetId ?? null,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not save the license',
  );
}

/** Marks an audio file's role so the editor ducks and mixes it correctly. */
export async function setAudioRole(sb: ServiceClient, caller: Caller, asset: AssetRow, kind: 'music' | 'sfx', licenseId: string | null) {
  const meta = { ...(isRecord(asset.meta) ? asset.meta : {}), role: kind } as AssetMeta;
  check(await sb.from('assets').update({ meta: asJson(meta), ...(licenseId ? { license_id: licenseId } : {}) }).eq('id', asset.id), 'Could not update the file');
  check(
    await sb.from('audio_tracks').upsert({ workspace_id: caller.workspaceId, asset_id: asset.id, kind, ...(licenseId ? { license_id: licenseId } : {}) }, { onConflict: 'asset_id' }),
    'Could not file the track',
  );
}

const BUILTIN_SOURCE = 'AdForge built-in sound effects';

async function builtinLicense(sb: ServiceClient, caller: Caller): Promise<string> {
  const { data } = await sb.from('licenses').select('id').eq('workspace_id', caller.workspaceId).eq('source', BUILTIN_SOURCE).limit(1).maybeSingle();
  if (data) return data.id;
  const row = check(
    await sb
      .from('licenses')
      .insert({
        workspace_id: caller.workspaceId,
        kind: 'royalty_free',
        commercial_use: true,
        source: BUILTIN_SOURCE,
        provider: 'adforge',
        notes: 'Original effects synthesized for this app. Free to use in commercial work.',
        created_by: caller.userId,
      })
      .select('id')
      .single(),
    'Could not save the license',
  );
  return row.id;
}

async function builtinBytes(id: string, origin: string): Promise<Buffer> {
  const rel = builtinSfxPath(id);
  try {
    return await readFile(path.join(process.cwd(), 'public', rel));
  } catch {
    // Hosts that serve public files from a CDN: fetch our own copy.
    const res = await fetch(new URL(rel, origin), { cache: 'no-store' });
    if (!res.ok) throw new Error(`The built-in sound “${id}” is missing (${res.status}). Run pnpm assets:generate.`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/**
 * Copies a built-in sound effect into the workspace library once and returns that file,
 * so edits and exports treat it like any other audio.
 */
export async function importBuiltinSfx(sb: ServiceClient, caller: Caller, builtinId: string, origin: string): Promise<AssetRow> {
  const sfx = BUILTIN_SFX_BY_ID[builtinId];
  if (!sfx) throw notFound('That sound effect');
  const { data: existing } = await sb
    .from('assets')
    .select('*')
    .eq('workspace_id', caller.workspaceId)
    .eq('meta->>builtinSfx', sfx.id)
    .is('deleted_at', null)
    .neq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const bytes = await builtinBytes(sfx.id, origin);
  const licenseId = await builtinLicense(sb, caller);
  const id = randomUUID();
  const driver = storage();
  const key = storageKeys.original(caller.workspaceId, id, 'mp3');
  await driver.putObject(key, bytes, 'audio/mpeg');
  const asset = check(
    await sb
      .from('assets')
      .insert({
        id,
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        name: sfx.name,
        type: 'audio',
        mime_type: 'audio/mpeg',
        size_bytes: bytes.length,
        duration_s: sfx.durationS,
        status: 'processing',
        source: 'import',
        storage_driver: driver.name,
        storage_key: key,
        tags: ['sfx', ...sfx.tags],
        license_id: licenseId,
        meta: asJson({ role: 'sfx', builtinSfx: sfx.id }),
      })
      .select('*')
      .single(),
    'Could not add the sound to your library',
  );
  check(await sb.from('audio_tracks').insert({ workspace_id: caller.workspaceId, asset_id: asset.id, kind: 'sfx', license_id: licenseId }), 'Could not file the sound');
  await enqueueJob(sb, { type: 'media.process', payload: { assetId: asset.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `media.process:${asset.id}:v1` });
  return asset;
}
