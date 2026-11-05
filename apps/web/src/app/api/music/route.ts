import { displayName, isRecord, musicAddSchema, type AssetMeta } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { createLicense, setAudioRole, toMusicViews } from '@/lib/server/music';

const query = z.object({
  q: z.string().max(100).optional(),
  filter: z.enum(['all', 'generated', 'added', 'logos']).default('all'),
  mood: z.string().max(40).optional(),
  /** Only tracks cleared for commercial use (pickers for ads). */
  cleared: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/** The music library: generated tracks and licensed tracks people added. Trashed files are left out. */
export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb
    .from('music')
    .select('*, asset:assets!inner(deleted_at)')
    .eq('workspace_id', caller.workspaceId)
    .is('asset.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(q.limit + 1);
  const text = q.q?.trim().replace(/[,()]/g, ' ');
  if (text) req = req.or(`title.ilike.${like(text)},genre.ilike.${like(text)},mood.ilike.${like(text)}`);
  if (q.mood) req = req.ilike('mood', q.mood.replace(/[%_\\]/g, (c) => `\\${c}`));
  if (q.filter === 'generated') req = req.not('generation_id', 'is', null);
  if (q.filter === 'added') req = req.is('generation_id', null);
  if (q.filter === 'logos') req = req.eq('is_audio_logo', true);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const page = (data ?? []).slice(0, q.limit).map(({ asset: _asset, ...row }) => row);
  let items = await toMusicViews(sb, caller.workspaceId, page);
  if (q.cleared) items = items.filter((m) => m.licenseState === 'cleared');
  return { items, nextCursor: (data?.length ?? 0) > q.limit ? page[page.length - 1]!.created_at : null };
});

/** Files an uploaded track as music. Tracks need commercial rights on file before they can go into ads. */
export const POST = route({ body: musicAddSchema, limit: ['music', 300, 3600] }, async ({ sb, caller, body }) => {
  const asset = await owned(sb, 'assets', body.assetId, caller, 'The track');
  if (asset.deleted_at) throw badRequest('Restore the file from the trash first.');
  if (asset.type !== 'audio') throw badRequest('Pick an audio file. To use the music from a video, extract its audio in the editor first.');
  const { data: existing } = await sb.from('music').select('id').eq('workspace_id', caller.workspaceId).eq('asset_id', asset.id).limit(1).maybeSingle();
  if (existing) throw conflict('This track is already in your music library.');
  if (!body.license && !asset.license_id && asset.source !== 'generated') throw badRequest('Add the license for this track: where it comes from and whether it covers commercial use.');
  const license = body.license ? await createLicense(sb, caller, body.license) : null;
  const licenseId = license?.id ?? asset.license_id;
  await setAudioRole(sb, caller, asset, 'music', licenseId);
  const meta = (isRecord(asset.meta) ? asset.meta : {}) as AssetMeta;
  const row = check(
    await sb
      .from('music')
      .insert({
        workspace_id: caller.workspaceId,
        asset_id: asset.id,
        license_id: licenseId,
        title: body.title ?? displayName(asset.name),
        genre: body.genre ?? null,
        mood: body.mood ?? null,
        bpm: typeof meta.bpm === 'number' ? meta.bpm : null,
        duration_s: asset.duration_s,
        instrumental: true,
        is_audio_logo: body.isAudioLogo,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not add the track',
  );
  if (asset.status === 'ready' && !meta.beats?.length && Number(asset.duration_s ?? 0) >= 6) {
    await enqueueJob(sb, { type: 'media.detect', payload: { assetId: asset.id, kind: 'beats' }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: -1, idempotencyKey: `media.detect:${asset.id}:beats:auto` });
  }
  await logActivity(sb, caller, 'music.added', 'asset', asset.id, { title: row.title, license: license?.kind ?? null });
  return (await toMusicViews(sb, caller.workspaceId, [row]))[0];
});
