import { competitorCreateSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import { badRequest, check, logActivity, route } from '@/lib/server/api';
import { toCompetitorView } from '@/lib/server/growth';

export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(await sb.from('competitors').select('*').eq('workspace_id', caller.workspaceId).order('name'), 'Could not load competitors');
  return { items: rows.map(toCompetitorView) };
});

/** Starts tracking a brand's ads in Meta's Ad Library; the first check runs right away. */
export const POST = route({ body: competitorCreateSchema, limit: ['competitors', 60, 3600] }, async ({ sb, caller, body }) => {
  if (body.metaPageId && !/^[0-9]{1,40}$/.test(body.metaPageId)) throw badRequest('A Facebook Page id is a number, e.g. 104983924558463.');
  const { count } = await sb.from('competitors').select('id', { count: 'exact', head: true }).eq('workspace_id', caller.workspaceId);
  if ((count ?? 0) >= 100) throw badRequest('You can track up to 100 competitors. Remove one first.');
  const row = check(
    await sb
      .from('competitors')
      .insert({
        workspace_id: caller.workspaceId,
        name: body.name.trim(),
        website: body.website ?? null,
        meta_page_id: body.metaPageId || null,
        tiktok_handle: body.tiktokHandle?.replace(/^@/, '') || null,
        countries: [...new Set(body.countries.map((c) => c.toUpperCase()))],
        notes: body.notes ?? null,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not add the competitor',
  );
  await enqueueJob(sb, { type: 'competitors.sync', payload: { competitorId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 2, idempotencyKey: `competitors.sync:${row.id}:first` });
  await logActivity(sb, caller, 'competitor.create', 'competitor', row.id, { name: row.name });
  return toCompetitorView(row);
});
