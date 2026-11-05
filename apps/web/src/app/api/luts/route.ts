import { randomUUID } from 'node:crypto';
import { asJson, displayName, storageKeys } from '@adforge/core';
import { encodeLutStripPng, parseCube, storage } from '@adforge/core/server';
import { badRequest, check, logActivity, route } from '@/lib/server/api';
import { toAssetView, toAssetViews } from '@/lib/server/assets';

const MAX_BYTES = 8 * 1024 ** 2;

/** Imported color grades. Each is stored as the PNG strip the renderer samples. */
export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(
    await sb.from('assets').select('*').eq('workspace_id', caller.workspaceId).contains('tags', ['lut']).is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
    'Could not load your LUTs',
  );
  return { items: await toAssetViews(rows) };
});

/** Imports an Adobe/Resolve .cube 3D LUT for the Color grade effect. */
export const POST = route({ limit: ['lut-import', 60, 3600] }, async ({ sb, caller, req }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw badRequest('Choose a .cube file.');
  if (!/\.cube$/i.test(file.name)) throw badRequest('Only .cube LUT files are supported.');
  if (file.size > MAX_BYTES) throw badRequest('That LUT is larger than 8 MB.');
  const lut = parseCube(await file.text());
  const png = encodeLutStripPng(lut);
  const id = randomUUID();
  const driver = storage();
  const key = storageKeys.original(caller.workspaceId, id, 'png');
  await driver.putObject(key, png, 'image/png');
  const row = check(
    await sb
      .from('assets')
      .insert({
        id,
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        name: lut.title?.slice(0, 200) || displayName(file.name),
        type: 'image',
        mime_type: 'image/png',
        size_bytes: png.length,
        width: lut.size * lut.size,
        height: lut.size,
        status: 'ready',
        source: 'import',
        storage_driver: driver.name,
        storage_key: key,
        thumbnail_key: key,
        tags: ['lut'],
        meta: asJson({ lut: { size: lut.size, title: lut.title, file: file.name } }),
      })
      .select('*')
      .single(),
    'Could not save the LUT',
  );
  await logActivity(sb, caller, 'asset.imported', 'asset', row.id, { kind: 'lut', name: row.name });
  return { asset: await toAssetView(row) };
});
