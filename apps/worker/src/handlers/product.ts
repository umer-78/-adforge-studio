import path from 'node:path';
import { asJson, productExtractSchema, slugify, SYSTEM_PROMPTS, uniq, type ProductExtract, type ProductRow } from '@adforge/core';
import { scrapeProductPage, type ScrapedPage } from '@adforge/core/server';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, downloadUrl } from '../lib/files';
import { llmAvailable, runLlm } from '../lib/llm';
import type { JobContext, JobHandler } from '../runner';

const MAX_IMAGES = 6;

function pageFacts(page: ScrapedPage): string {
  return JSON.stringify(
    {
      url: page.canonicalUrl ?? page.url,
      siteName: page.siteName,
      title: page.title,
      description: page.description,
      brand: page.brand,
      price: page.price,
      currency: page.currency,
      themeColor: page.themeColor,
      colorCandidates: page.colors.slice(0, 12),
      imageCandidates: page.images.slice(0, 30),
      logoCandidates: page.logos.slice(0, 5),
      structuredDataSource: page.source,
    },
    null,
    1,
  );
}

/** Product facts without an LLM: what the page states, nothing invented. */
function heuristicExtract(page: ScrapedPage): ProductExtract {
  return {
    title: page.title ?? page.siteName ?? 'Imported product',
    brandName: page.brand ?? page.siteName,
    category: '',
    description: page.description ?? '',
    price: page.price,
    currency: page.currency,
    benefits: [],
    features: [],
    audience: '',
    painPoints: [],
    usps: [],
    offer: null,
    ctaSuggestions: ['Shop now'],
    hooks: [],
    tone: '',
    colors: uniq([page.themeColor, ...page.colors].filter((c): c is string => !!c)).slice(0, 6),
    imageUrls: page.images.slice(0, MAX_IMAGES),
    logoUrl: page.logos[0] ?? null,
  };
}

async function saveImage(ctx: JobContext, product: ProductRow, url: string, name: string, tags: string[]) {
  const file = path.join(await ctx.tmp(), `img-${Math.random().toString(36).slice(2)}`);
  try {
    const res = await downloadUrl(url, file, { maxBytes: 25 * 1024 ** 2, timeoutMs: 60_000, signal: ctx.signal });
    const asset = await createAssetFromFile(ctx, {
      workspaceId: product.workspace_id,
      filePath: file,
      mime: res.contentType,
      name,
      source: 'import',
      createdBy: product.created_by,
      tags,
      meta: { sourceUrl: url, productId: product.id },
    });
    return asset.type === 'image' ? asset.id : null;
  } catch (err) {
    ctx.log.warn({ url, err: (err as Error).message }, 'product image skipped');
    return null;
  }
}

/** Scrapes a product page, extracts structured facts and imports the best images. Shared with agent mode. */
export async function importProduct(ctx: JobContext, product: ProductRow): Promise<ProductRow> {
  ctx.progress(5, 'Reading the page');
  const page = await scrapeProductPage(product.source_url);
  ctx.checkAborted();
  let extract = heuristicExtract(page);
  let usedClaude = false;
  if (await llmAvailable(ctx)) {
    ctx.progress(30, 'Understanding the product');
    const { data } = await runLlm(ctx, {
      task: 'extractProduct',
      schema: productExtractSchema,
      system: SYSTEM_PROMPTS.extractProduct,
      prompt: `Page facts:\n${pageFacts(page)}\n\nVisible page text:\n${page.text}`,
      meta: { productId: product.id },
    });
    extract = data;
    usedClaude = true;
  }
  // Only keep image URLs that were actually on the page.
  const known = new Set([...page.images, ...page.logos]);
  const images = uniq([...extract.imageUrls.filter((u) => known.has(u)), ...page.images]).slice(0, MAX_IMAGES);
  const logoUrl = extract.logoUrl && known.has(extract.logoUrl) ? extract.logoUrl : (page.logos[0] ?? null);
  const title = extract.title || page.title || 'Product';
  const tags = uniq(['product', slugify(extract.brandName ?? '', 30)].filter(Boolean));

  ctx.progress(55, 'Importing images');
  const imageIds: string[] = [];
  for (const [i, url] of images.entries()) {
    const id = await saveImage(ctx, product, url, `${title} ${i + 1}`, tags);
    if (id) imageIds.push(id);
    ctx.progress(55 + ((i + 1) / images.length) * 35, 'Importing images');
  }
  const logoId = logoUrl ? await saveImage(ctx, product, logoUrl, `${extract.brandName ?? title} logo`, [...tags, 'logo']) : null;

  const { data, error } = await ctx.sb
    .from('products')
    .update({
      title,
      brand_name: extract.brandName,
      description: extract.description || page.description,
      price: extract.price ?? page.price,
      currency: extract.currency ?? page.currency,
      colors: asJson(extract.colors.length ? extract.colors : page.colors.slice(0, 6)),
      copy: asJson({
        category: extract.category,
        benefits: extract.benefits,
        features: extract.features,
        audience: extract.audience,
        painPoints: extract.painPoints,
        usps: extract.usps,
        offer: extract.offer,
        ctaSuggestions: extract.ctaSuggestions,
        hooks: extract.hooks,
        tone: extract.tone,
      }),
      image_asset_ids: imageIds,
      logo_asset_id: logoId,
      raw: asJson({ source: page.source, siteName: page.siteName, canonicalUrl: page.canonicalUrl, themeColor: page.themeColor, images: page.images.slice(0, 40), extractedWith: usedClaude ? 'claude' : 'page' }),
      status: 'ready',
      error: null,
    })
    .eq('id', product.id)
    .select('*')
    .single();
  if (error) throw new Error(`Could not save product: ${error.message}`);
  if (!imageIds.length) ctx.log.warn({ productId: product.id }, 'no product images could be imported');
  return data;
}

export const productImport: JobHandler<'product.import'> = {
  async run(ctx, { productId }) {
    const { data: product } = await ctx.sb.from('products').select('*').eq('id', productId).eq('workspace_id', ctx.workspaceId).maybeSingle();
    if (!product) throw new PermanentError('This product no longer exists.');
    const saved = await importProduct(ctx, product);
    return { title: saved.title, images: saved.image_asset_ids.length };
  },
  async onFailure(ctx, { productId }, message) {
    await ctx.sb.from('products').update({ status: 'failed', error: message }).eq('id', productId);
  },
};
