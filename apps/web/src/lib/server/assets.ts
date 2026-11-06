import 'server-only';
import { carriedCredits, isRecord, SIGNED_URL_TTL, type AssetMeta, type AssetRow, type PlaybackInfo } from '@adforge/core';
import { features, muxPlayback, storage, type ServiceClient } from '@adforge/core/server';
import type { AssetView, PlaybackView } from '@/lib/types';

const TTL = SIGNED_URL_TTL.preview;

/** Signs every key of the given assets in one batch per storage driver. */
async function signAll(rows: AssetRow[], pick: (a: AssetRow) => (string | null | undefined)[]): Promise<Map<string, string>> {
  const byDriver = new Map<string, Set<string>>();
  for (const a of rows) {
    for (const key of pick(a)) {
      if (!key) continue;
      const set = byDriver.get(a.storage_driver) ?? new Set<string>();
      set.add(key);
      byDriver.set(a.storage_driver, set);
    }
  }
  const out = new Map<string, string>();
  await Promise.all(
    [...byDriver].map(async ([driver, keys]) => {
      const signed = await storage(driver).signedReadUrls([...keys], TTL).catch((err) => {
        console.warn('[assets] signing failed', err instanceof Error ? err.message : err);
        return {} as Record<string, string>;
      });
      for (const [k, v] of Object.entries(signed)) out.set(`${driver}:${k}`, v);
    }),
  );
  return out;
}

function playbackFor(a: AssetRow, signed: (key: string | null) => string | null): PlaybackView | null {
  if (a.type !== 'video' && a.type !== 'audio') return null;
  const pb = (isRecord(a.playback) ? a.playback : {}) as PlaybackInfo;
  const poster = signed(a.thumbnail_key);
  if (pb.provider === 'mux' && pb.muxPlaybackId && pb.muxStatus === 'ready') {
    try {
      const urls = muxPlayback(pb.muxPlaybackId, pb.policy === 'public' ? 'public' : 'signed');
      return { kind: 'mux', src: urls.hls, poster: poster ?? urls.poster, preparing: false };
    } catch {
      // Signing keys missing: fall through to the stored files.
    }
  }
  if (a.hls_key) return { kind: 'hls', src: `/api/assets/${a.id}/hls/master.m3u8`, poster, preparing: false };
  const file = signed(a.proxy_key) ?? signed(a.storage_key);
  if (!file) return null;
  return { kind: 'file', src: file, poster, preparing: pb.provider === 'mux' && pb.muxStatus === 'preparing' };
}

export async function toAssetViews(rows: AssetRow[], opts: { original?: boolean } = {}): Promise<AssetView[]> {
  if (!rows.length) return [];
  const signedMap = await signAll(rows, (a) => [a.thumbnail_key, a.preview_key, a.proxy_key, a.waveform_key, a.type === 'image' || a.type === 'audio' || opts.original || !a.proxy_key ? a.storage_key : null]);
  return rows.map((a) => {
    const signed = (key: string | null) => (key ? (signedMap.get(`${a.storage_driver}:${key}`) ?? null) : null);
    const meta = (isRecord(a.meta) ? a.meta : {}) as AssetMeta;
    const score = isRecord(meta.score) && typeof meta.score.overall === 'number' ? (meta.score as AssetView['score']) : null;
    const original = signed(a.storage_key);
    return {
      id: a.id,
      name: a.name,
      type: a.type as AssetView['type'],
      mimeType: a.mime_type,
      status: a.status as AssetView['status'],
      source: a.source as AssetView['source'],
      sizeBytes: Number(a.size_bytes ?? 0),
      durationS: a.duration_s == null ? null : Number(a.duration_s),
      width: a.width,
      height: a.height,
      fps: a.fps == null ? null : Number(a.fps),
      tags: a.tags ?? [],
      aiTags: a.ai_tags ?? [],
      aiCaption: a.ai_caption,
      description: a.description,
      isFavorite: a.is_favorite,
      isAiGenerated: a.is_ai_generated,
      projectId: a.project_id,
      folderId: a.folder_id,
      parentAssetId: a.parent_asset_id,
      generationId: a.generation_id,
      licenseId: a.license_id,
      version: a.version,
      processingError: a.processing_error,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      deletedAt: a.deleted_at,
      role: (meta.role as AssetView['role']) ?? null,
      credits: carriedCredits(meta),
      colors: Array.isArray(meta.colors) ? meta.colors.filter((c): c is string => typeof c === 'string') : [],
      score,
      url: original,
      thumbnailUrl: signed(a.thumbnail_key) ?? (a.type === 'image' ? original : null),
      previewUrl: signed(a.preview_key),
      proxyUrl: signed(a.proxy_key),
      waveformUrl: signed(a.waveform_key),
      playback: playbackFor(a, signed),
    };
  });
}

export async function toAssetView(row: AssetRow, opts: { original?: boolean } = {}): Promise<AssetView> {
  return (await toAssetViews([row], opts))[0]!;
}

export async function assetsByIds(sb: ServiceClient, workspaceId: string, ids: string[]): Promise<AssetRow[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { data, error } = await sb.from('assets').select('*').eq('workspace_id', workspaceId).in('id', unique);
  if (error) throw new Error(`Could not load assets: ${error.message}`);
  return data ?? [];
}

/** Asset views keyed by id, for embedding into other objects (posts, generations, ads). */
export async function assetViewMap(sb: ServiceClient, workspaceId: string, ids: (string | null | undefined)[]): Promise<Record<string, AssetView>> {
  const rows = await assetsByIds(sb, workspaceId, ids.filter((x): x is string => !!x));
  const views = await toAssetViews(rows);
  return Object.fromEntries(views.map((v) => [v.id, v]));
}

export function maxUploadBytes(): number {
  return features().maxUploadBytes;
}
