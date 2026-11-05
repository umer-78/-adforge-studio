import { displayName, sfxAddSchema } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { toAssetView } from '@/lib/server/assets';
import { builtinSfxViews, createLicense, importBuiltinSfx, setAudioRole, toSfxViews } from '@/lib/server/music';

const query = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(40).optional(),
  scope: z.enum(['all', 'builtin', 'mine']).default('all'),
});

/** Built-in effects plus the workspace's own (generated or added), newest first. */
export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  const text = q.q?.trim().toLowerCase();
  const matches = (name: string, category: string, tags: string[]) =>
    (!q.category || category === q.category) && (!text || name.toLowerCase().includes(text) || category.includes(text) || tags.some((t) => t.toLowerCase().includes(text)));
  const builtin = q.scope === 'mine' ? [] : builtinSfxViews().filter((s) => matches(s.name, s.category, s.tags));
  let mine: Awaited<ReturnType<typeof toSfxViews>> = [];
  if (q.scope !== 'builtin') {
    const rows = check(
      await sb.from('sfx').select('*, asset:assets!inner(deleted_at)').eq('workspace_id', caller.workspaceId).is('asset.deleted_at', null).order('created_at', { ascending: false }).limit(300),
      'Could not load sound effects',
    ).map(({ asset: _asset, ...row }) => row);
    mine = (await toSfxViews(sb, caller.workspaceId, rows)).filter((s) => matches(s.name, s.category, s.tags));
  }
  return { mine, builtin };
});

/** Adds a sound effect to the library: a copy of a built-in one, or an uploaded file. Returns the library file. */
export const POST = route({ body: sfxAddSchema, limit: ['sfx', 300, 3600] }, async ({ sb, caller, body, req }) => {
  if (body.mode === 'builtin') {
    const asset = await importBuiltinSfx(sb, caller, body.builtinId, req.nextUrl.origin);
    return { asset: await toAssetView(asset) };
  }
  const asset = await owned(sb, 'assets', body.assetId, caller, 'The sound');
  if (asset.deleted_at) throw badRequest('Restore the file from the trash first.');
  if (asset.type !== 'audio') throw badRequest('Pick an audio file.');
  const { data: existing } = await sb.from('sfx').select('id').eq('workspace_id', caller.workspaceId).eq('asset_id', asset.id).limit(1).maybeSingle();
  if (existing) throw conflict('This sound is already in your effects.');
  if (!body.license && !asset.license_id && asset.source !== 'generated' && asset.source !== 'recording') throw badRequest('Add the license for this sound: where it comes from and whether it covers commercial use.');
  const license = body.license ? await createLicense(sb, caller, body.license) : null;
  const licenseId = license?.id ?? asset.license_id;
  await setAudioRole(sb, caller, asset, 'sfx', licenseId);
  const row = check(
    await sb
      .from('sfx')
      .insert({
        workspace_id: caller.workspaceId,
        asset_id: asset.id,
        name: body.name ?? displayName(asset.name),
        category: body.category,
        tags: body.tags,
        duration_s: asset.duration_s,
        license_id: licenseId,
      })
      .select('*')
      .single(),
    'Could not add the sound',
  );
  await logActivity(sb, caller, 'sfx.added', 'asset', asset.id, { name: row.name });
  return { asset: await toAssetView(asset), sfx: (await toSfxViews(sb, caller.workspaceId, [row]))[0] };
});
