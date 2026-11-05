import { asJson, brandKitSchema, type BrandKitRow } from '@adforge/core';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toBrandKitViews } from '@/lib/server/brand';

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'brand_kits', params.id!, caller, 'This brand kit');
  return (await toBrandKitViews(sb, caller.workspaceId, [row]))[0];
});

export const PATCH = route({ body: brandKitSchema.partial(), role: 'admin' }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'brand_kits', params.id!, caller, 'This brand kit');
  for (const id of [body.logoAssetId, body.introAssetId, body.outroAssetId, body.watermarkAssetId]) if (id) await owned(sb, 'assets', id, caller, 'A brand file');
  if (body.isDefault === false && row.is_default) throw badRequest('Make another kit the default instead.');
  if (body.isDefault && !row.is_default) check(await sb.from('brand_kits').update({ is_default: false }).eq('workspace_id', caller.workspaceId).eq('is_default', true), 'Could not change the default kit');
  const update: Partial<BrandKitRow> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.isDefault) update.is_default = true;
  if (body.colors !== undefined) update.colors = asJson(body.colors);
  if (body.fonts !== undefined) update.fonts = asJson(body.fonts);
  if (body.tone !== undefined) update.tone = body.tone;
  if (body.logoAssetId !== undefined) update.logo_asset_id = body.logoAssetId;
  if (body.introAssetId !== undefined) update.intro_asset_id = body.introAssetId;
  if (body.outroAssetId !== undefined) update.outro_asset_id = body.outroAssetId;
  if (body.watermarkAssetId !== undefined) update.watermark_asset_id = body.watermarkAssetId;
  if (body.watermark !== undefined) update.watermark = asJson(body.watermark);
  if (body.captionStyleId !== undefined) update.caption_style = asJson(body.captionStyleId ? { styleId: body.captionStyleId } : {});
  const saved = Object.keys(update).length ? check(await sb.from('brand_kits').update(update).eq('id', row.id).select('*').single(), 'Could not save the brand kit') : row;
  return (await toBrandKitViews(sb, caller.workspaceId, [saved]))[0];
});

export const DELETE = route({ role: 'admin' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'brand_kits', params.id!, caller, 'This brand kit');
  check(await sb.from('brand_kits').delete().eq('id', row.id), 'Could not delete the brand kit');
  if (row.is_default) {
    const { data: next } = await sb.from('brand_kits').select('id').eq('workspace_id', caller.workspaceId).order('created_at').limit(1).maybeSingle();
    if (next) await sb.from('brand_kits').update({ is_default: true }).eq('id', next.id);
  }
  await logActivity(sb, caller, 'brand_kit.delete', 'brand_kit', row.id, { name: row.name });
});
