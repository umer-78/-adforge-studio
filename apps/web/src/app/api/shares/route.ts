import { shareCreateSchema } from '@adforge/core';
import { appUrl, hashPassword, randomToken } from '@adforge/core/server';
import * as z from 'zod';
import { check, logActivity, owned, route } from '@/lib/server/api';

const toView = (r: { id: string; token: string; asset_id: string | null; project_id: string | null; expires_at: string | null; allow_download: boolean; password_hash: string | null; view_count: number; created_at: string; revoked_at: string | null }) => ({
  id: r.id,
  url: appUrl(`/s/${r.token}`),
  assetId: r.asset_id,
  projectId: r.project_id,
  expiresAt: r.expires_at,
  allowDownload: r.allow_download,
  hasPassword: !!r.password_hash,
  viewCount: r.view_count,
  createdAt: r.created_at,
  revokedAt: r.revoked_at,
});

export const GET = route({ query: z.object({ assetId: z.string().uuid().optional(), projectId: z.string().uuid().optional() }) }, async ({ sb, caller, query }) => {
  let q = sb.from('share_links').select('*').eq('workspace_id', caller.workspaceId).is('revoked_at', null).order('created_at', { ascending: false }).limit(50);
  if (query.assetId) q = q.eq('asset_id', query.assetId);
  if (query.projectId) q = q.eq('project_id', query.projectId);
  return { items: check(await q, 'Could not load share links').map(toView) };
});

/** Creates an unguessable link, optionally with a password and an expiry. */
export const POST = route({ body: shareCreateSchema, limit: ['shares', 100, 3600] }, async ({ sb, caller, body }) => {
  if (body.assetId) await owned(sb, 'assets', body.assetId, caller, 'This file');
  if (body.projectId) await owned(sb, 'projects', body.projectId, caller, 'This project');
  const row = check(
    await sb
      .from('share_links')
      .insert({
        workspace_id: caller.workspaceId,
        asset_id: body.assetId ?? null,
        project_id: body.projectId ?? null,
        token: randomToken(24),
        password_hash: body.password ? await hashPassword(body.password) : null,
        expires_at: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null,
        allow_download: body.allowDownload,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not create the link',
  );
  await logActivity(sb, caller, 'share.created', body.assetId ? 'asset' : 'project', (body.assetId ?? body.projectId)!);
  return toView(row);
});
