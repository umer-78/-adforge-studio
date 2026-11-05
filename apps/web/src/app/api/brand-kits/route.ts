import { asJson, brandKitSchema } from '@adforge/core';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toBrandKitViews } from '@/lib/server/brand';

export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(await sb.from('brand_kits').select('*').eq('workspace_id', caller.workspaceId).order('is_default', { ascending: false }).order('created_at'), 'Could not load brand kits');
  return { items: await toBrandKitViews(sb, caller.workspaceId, rows) };
});

export const POST = route({ body: brandKitSchema, role: 'admin', limit: ['brand-kits', 60, 3600] }, async ({ sb, caller, body }) => {
  for (const id of [body.logoAssetId, body.introAssetId, body.outroAssetId, body.watermarkAssetId]) if (id) await owned(sb, 'assets', id, caller, 'A brand file');
  const { count } = await sb.from('brand_kits').select('id', { count: 'exact', head: true }).eq('workspace_id', caller.workspaceId);
  if ((count ?? 0) >= 20) throw badRequest('A workspace can have up to 20 brand kits.');
  const makeDefault = body.isDefault || !count;
  if (makeDefault) check(await sb.from('brand_kits').update({ is_default: false }).eq('workspace_id', caller.workspaceId).eq('is_default', true), 'Could not change the default kit');
  const row = check(
    await sb
      .from('brand_kits')
      .insert({
        workspace_id: caller.workspaceId,
        name: body.name,
        is_default: makeDefault,
        colors: asJson(body.colors),
        fonts: asJson(body.fonts),
        tone: body.tone ?? null,
        logo_asset_id: body.logoAssetId ?? null,
        intro_asset_id: body.introAssetId ?? null,
        outro_asset_id: body.outroAssetId ?? null,
        watermark_asset_id: body.watermarkAssetId ?? null,
        ...(body.watermark ? { watermark: asJson(body.watermark) } : {}),
        caption_style: asJson(body.captionStyleId ? { styleId: body.captionStyleId } : {}),
      })
      .select('*')
      .single(),
    'Could not save the brand kit',
  );
  await logActivity(sb, caller, 'brand_kit.create', 'brand_kit', row.id, { name: row.name });
  return (await toBrandKitViews(sb, caller.workspaceId, [row]))[0];
});
