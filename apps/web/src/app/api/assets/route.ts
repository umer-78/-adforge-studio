import { assetListSchema } from '@adforge/core';
import { embed, providerKey, toPgVector } from '@adforge/core/server';
import { route } from '@/lib/server/api';
import { assetViewMap, toAssetViews } from '@/lib/server/assets';

/** Lists or searches the library. Text search is lexical + tags; `semantic=1` adds meaning search. */
export const GET = route({ query: assetListSchema }, async ({ sb, caller, query: q }) => {
  const ws = caller.workspaceId;
  if (q.ids) return { items: Object.values(await assetViewMap(sb, ws, q.ids)), nextCursor: null };
  if (q.q?.trim()) {
    let embedding: string | undefined;
    if (q.semantic) {
      const key = await providerKey(ws, 'openai');
      if (key) embedding = toPgVector((await embed(key, [q.q])).vectors[0]!);
    }
    const { data: hits, error } = await sb.rpc('search_assets', {
      p_workspace: ws,
      p_query: q.q,
      p_embedding: embedding,
      p_types: q.type ? [q.type] : undefined,
      p_limit: q.limit,
      p_include_deleted: q.trash ?? false,
    });
    if (error) throw new Error(`Search failed: ${error.message}`);
    const ids = (hits ?? []).map((h) => h.asset_id);
    if (!ids.length) return { items: [], nextCursor: null };
    let rows = sb.from('assets').select('*').eq('workspace_id', ws).in('id', ids);
    rows = q.trash ? rows.not('deleted_at', 'is', null) : rows.is('deleted_at', null);
    if (q.projectId) rows = rows.eq('project_id', q.projectId);
    if (q.favorite) rows = rows.eq('is_favorite', true);
    const { data, error: rowsError } = await rows;
    if (rowsError) throw new Error(rowsError.message);
    const order = new Map(ids.map((id, i) => [id, i]));
    const sorted = (data ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const matched = Object.fromEntries((hits ?? []).map((h) => [h.asset_id, h.matched]));
    const views = await toAssetViews(sorted);
    return { items: views.map((v) => ({ ...v, matched: matched[v.id] ?? [] })), nextCursor: null };
  }

  let rows = sb.from('assets').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(q.limit + 1);
  rows = q.trash ? rows.not('deleted_at', 'is', null) : rows.is('deleted_at', null);
  if (q.type) rows = rows.eq('type', q.type);
  if (q.projectId) rows = rows.eq('project_id', q.projectId);
  if (q.folderId) rows = rows.eq('folder_id', q.folderId);
  if (q.tag) rows = rows.contains('tags', [q.tag]);
  if (q.favorite) rows = rows.eq('is_favorite', true);
  if (q.source) rows = rows.eq('source', q.source);
  if (q.role) rows = rows.eq('meta->>role', q.role);
  if (q.cursor) {
    const [at, id] = q.cursor.split('|');
    if (at && id) rows = rows.or(`created_at.lt."${at}",and(created_at.eq."${at}",id.lt.${id})`);
  }
  const { data, error } = await rows;
  if (error) throw new Error(error.message);
  const page = (data ?? []).slice(0, q.limit);
  const last = page[page.length - 1];
  return { items: await toAssetViews(page), nextCursor: (data?.length ?? 0) > q.limit && last ? `${last.created_at}|${last.id}` : null };
});
