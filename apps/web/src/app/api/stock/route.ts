import { randomUUID } from 'node:crypto';
import { asJson, assetTypeForMime, extForMime, MIME_BY_EXT, STOCK_LICENSES, STOCK_PROVIDER_INFO, STOCK_PROVIDERS, stockImportSchema, stockSearchSchema, storageKeys, type StockKind, type StockMeta } from '@adforge/core';
import { enqueueJob, storage } from '@adforge/core/server';
import { badRequest, check, logActivity, notFound, route } from '@/lib/server/api';
import { toAssetView } from '@/lib/server/assets';
import { enabledProviders, getStockItem, searchStock } from '@/lib/server/stock';
import { assertInWorkspace } from '@/lib/server/uploads';

const FALLBACK_MIME: Record<StockKind, string> = { photo: 'image/jpeg', video: 'video/mp4', music: 'audio/mpeg', sound: 'audio/mpeg' };
const TYPE_FOR_KIND = { photo: 'image', video: 'video', music: 'audio', sound: 'audio' } as const;

function providerList() {
  const on = new Set(enabledProviders());
  return STOCK_PROVIDERS.map((id) => ({ id, label: STOCK_PROVIDER_INFO[id].label, url: STOCK_PROVIDER_INFO[id].url, kinds: STOCK_PROVIDER_INFO[id].kinds, enabled: on.has(id) }));
}

/** Searches a free library. Only media that may be used in ads comes back. */
export const GET = route({ query: stockSearchSchema, limit: ['stock-search', 600, 3600] }, async ({ query }) => {
  const usable = enabledProviders(query.kind);
  const provider = query.provider && usable.includes(query.provider) ? query.provider : usable[0];
  if (!provider) return { items: [], page: 1, hasMore: false, provider: null, providers: providerList() };
  const result = await searchStock(query, provider);
  return { ...result, provider, providers: providerList() };
});

/** Imports an item into the Library with its license recorded. Importing the same item again returns the existing file. */
export const POST = route({ body: stockImportSchema, limit: ['stock-import', 200, 3600] }, async ({ sb, caller, body }) => {
  if (!enabledProviders(body.kind).includes(body.provider)) throw badRequest(`${STOCK_PROVIDER_INFO[body.provider].label} is not switched on for ${body.kind === 'photo' ? 'photos' : `${body.kind}s`}.`);
  await Promise.all([assertInWorkspace(sb, caller, 'projects', body.projectId), assertInWorkspace(sb, caller, 'folders', body.folderId)]);

  const { data: existing } = await sb
    .from('assets')
    .select('*')
    .eq('workspace_id', caller.workspaceId)
    .is('deleted_at', null)
    .eq('meta->stock->>provider', body.provider)
    .eq('meta->stock->>id', body.id)
    .neq('status', 'failed')
    .limit(1)
    .maybeSingle();
  if (existing) return { asset: await toAssetView(existing), existing: true };

  const item = await getStockItem(body.provider, body.kind, body.id);
  if (!item) throw notFound('This free file');
  const terms = STOCK_LICENSES[item.license];
  const license = check(
    await sb
      .from('licenses')
      .insert({
        workspace_id: caller.workspaceId,
        kind: terms.kind,
        commercial_use: true,
        provider: item.source ? `${STOCK_PROVIDER_INFO[item.provider].label} · ${item.source}` : STOCK_PROVIDER_INFO[item.provider].label,
        source: item.pageUrl,
        terms_url: item.licenseUrl,
        notes: [terms.name, item.creator ? `by ${item.creator}` : null].filter(Boolean).join(' '),
        attribution: item.credit,
        created_by: caller.userId,
      })
      .select('id')
      .single(),
    'Could not record the license',
  );

  const guessed = item.ext ? MIME_BY_EXT[item.ext] : undefined;
  const mime = guessed && assetTypeForMime(guessed) === TYPE_FOR_KIND[item.kind] ? guessed : FALLBACK_MIME[item.kind];
  const id = randomUUID();
  const driver = storage();
  const stock: StockMeta = { provider: item.provider, id: item.id, kind: item.kind, pageUrl: item.pageUrl, creator: item.creator, creatorUrl: item.creatorUrl, license: item.license, credit: item.credit, source: item.source, downloadUrl: item.downloadUrl };
  const asset = check(
    await sb
      .from('assets')
      .insert({
        id,
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        name: item.title.slice(0, 300) || 'Untitled',
        type: TYPE_FOR_KIND[item.kind],
        mime_type: mime,
        status: 'processing',
        source: 'import',
        storage_driver: driver.name,
        storage_key: storageKeys.original(caller.workspaceId, id, extForMime(mime)),
        project_id: body.projectId ?? null,
        folder_id: body.folderId ?? null,
        license_id: license.id,
        width: item.width,
        height: item.height,
        duration_s: item.durationS,
        tags: item.kind === 'music' ? ['music'] : item.kind === 'sound' ? ['sfx'] : [],
        upload_state: asJson({ kind: 'stock', startedAt: new Date().toISOString() }),
        meta: asJson({ stock, sourceUrl: item.pageUrl, ...(item.credit ? { credits: [item.credit] } : {}), ...(item.kind === 'music' ? { role: 'music' } : item.kind === 'sound' ? { role: 'sfx' } : {}) }),
      })
      .select('*')
      .single(),
    'Could not start the import',
  );
  // Free music and sound effects also show up in Music & SFX.
  if (item.kind === 'music') {
    check(await sb.from('music').insert({ workspace_id: caller.workspaceId, title: asset.name, asset_id: asset.id, license_id: license.id, duration_s: item.durationS, created_by: caller.userId }), 'Could not add the track to your music');
  } else if (item.kind === 'sound') {
    check(await sb.from('sfx').insert({ workspace_id: caller.workspaceId, name: asset.name, category: 'free', asset_id: asset.id, license_id: license.id, duration_s: item.durationS, tags: ['free'] }), 'Could not add the sound to your effects');
  }
  await enqueueJob(sb, { type: 'stock.import', payload: { assetId: asset.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 6, idempotencyKey: `stock.import:${asset.id}` });
  await logActivity(sb, caller, 'asset.imported', 'asset', asset.id, { name: asset.name, provider: item.provider, license: item.license });
  return { asset: await toAssetView(asset), existing: false };
});
