import { asJson, isRecord } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { assetsByIds } from '@/lib/server/assets';
import { productCopy, toProductViews } from '@/lib/server/growth';

const list = (max: number) => z.array(z.string().trim().min(1).max(500)).max(max);

const patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).nullish(),
  price: z.number().min(0).max(10_000_000).nullish(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code.').nullish(),
  brandName: z.string().trim().max(200).nullish(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be #RRGGBB.')).max(12).optional(),
  imageAssetIds: z.array(z.string().uuid()).max(20).optional(),
  logoAssetId: z.string().uuid().nullish(),
  copy: z
    .object({
      category: z.string().max(200),
      benefits: list(20),
      features: list(20),
      audience: z.string().max(1000),
      painPoints: list(20),
      usps: list(20),
      offer: z.string().max(500).nullable(),
      ctaSuggestions: list(10),
      hooks: list(20),
      tone: z.string().max(200),
    })
    .partial()
    .optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'products', params.id!, caller, 'The product');
  return (await toProductViews(sb, caller.workspaceId, [row]))[0];
});

/** Corrects what the import read: facts, copy, colors, which images to use and the logo. */
export const PATCH = route({ body: patch }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'products', params.id!, caller, 'The product');
  const imageIds = [...new Set(body.imageAssetIds ?? [])];
  const wanted = [...imageIds, ...(body.logoAssetId ? [body.logoAssetId] : [])];
  if (wanted.length) {
    const found = await assetsByIds(sb, caller.workspaceId, wanted);
    const images = new Map(found.filter((a) => a.type === 'image' && !a.deleted_at).map((a) => [a.id, a]));
    if (wanted.some((id) => !images.has(id))) throw badRequest('Product images and the logo must be images from your library.');
  }
  const copy = body.copy ? { ...productCopy(row.copy), ...body.copy } : null;
  const updated = check(
    await sb
      .from('products')
      .update({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.price !== undefined ? { price: body.price ?? null } : {}),
        ...(body.currency !== undefined ? { currency: body.currency?.toUpperCase() ?? null } : {}),
        ...(body.brandName !== undefined ? { brand_name: body.brandName || null } : {}),
        ...(body.colors ? { colors: asJson(body.colors.map((c) => c.toLowerCase())) } : {}),
        ...(body.imageAssetIds ? { image_asset_ids: imageIds } : {}),
        ...(body.logoAssetId !== undefined ? { logo_asset_id: body.logoAssetId ?? null } : {}),
        ...(copy ? { copy: asJson({ ...(isRecord(row.copy) ? row.copy : {}), ...copy }) } : {}),
      })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the product',
  );
  return (await toProductViews(sb, caller.workspaceId, [updated]))[0];
});

/** Removes the product. Imported images stay in the library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'products', params.id!, caller, 'The product');
  check(await sb.from('products').delete().eq('id', row.id), 'Could not delete the product');
  await logActivity(sb, caller, 'product.delete', 'product', row.id, { title: row.title });
});
