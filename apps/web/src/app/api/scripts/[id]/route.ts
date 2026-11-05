import { asJson, scriptUpdateSchema, type ScriptRow } from '@adforge/core';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { scriptDetail } from '@/lib/server/scripts';

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  return scriptDetail(sb, caller.workspaceId, row);
});

export const PATCH = route({ body: scriptUpdateSchema }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  if (row.status === 'generating' && (body.lines || body.status)) throw conflict('Wait until the script finishes writing.');
  if (body.projectId) await owned(sb, 'projects', body.projectId, caller, 'The project');
  if (body.lines) {
    const ids = new Set(body.lines.map((l) => l.id));
    if (ids.size !== body.lines.length) throw badRequest('Two lines share the same id.');
    const characterIds = [...new Set(body.lines.map((l) => l.characterId).filter((x): x is string => !!x))];
    if (characterIds.length) {
      const { data } = await sb.from('characters').select('id').eq('workspace_id', caller.workspaceId).in('id', characterIds);
      if ((data?.length ?? 0) !== characterIds.length) throw badRequest('One of the characters no longer exists.');
    }
  }
  const update: Partial<ScriptRow> = {};
  if (body.title !== undefined) update.title = body.title.trim();
  if (body.lines !== undefined) update.lines = asJson(body.lines);
  if (body.captions !== undefined) update.captions = body.captions;
  if (body.hashtags !== undefined) update.hashtags = [...new Set(body.hashtags.map((h) => h.trim().replace(/^#+/, '')).filter(Boolean))];
  if (body.status !== undefined) update.status = body.status;
  if (body.language !== undefined) update.language = body.language;
  if (body.projectId !== undefined) update.project_id = body.projectId;
  if (!Object.keys(update).length) return scriptDetail(sb, caller.workspaceId, row);
  const saved = check(await sb.from('scripts').update(update).eq('id', row.id).select('*').single(), 'Could not save the script');
  if (body.status === 'final' && row.status !== 'final') await logActivity(sb, caller, 'script.finalize', 'script', row.id, { title: saved.title });
  return { id: saved.id, updatedAt: saved.updated_at, status: saved.status };
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  check(await sb.from('scripts').delete().eq('id', row.id), 'Could not delete the script');
  await logActivity(sb, caller, 'script.delete', 'script', row.id, { title: row.title });
});
