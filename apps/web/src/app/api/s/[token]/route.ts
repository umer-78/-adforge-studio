import { AppError, extForMime, SIGNED_URL_TTL, type AssetRow } from '@adforge/core';
import { storage, verifyPassword } from '@adforge/core/server';
import * as z from 'zod';
import { notFound, publicRoute } from '@/lib/server/api';

interface SharedFile {
  id: string;
  name: string;
  type: string;
  durationS: number | null;
  width: number | null;
  height: number | null;
  isAiGenerated: boolean;
  src: string | null;
  poster: string | null;
  downloadUrl: string | null;
}

async function sharedFiles(rows: AssetRow[], allowDownload: boolean): Promise<SharedFile[]> {
  return Promise.all(
    rows.map(async (a) => {
      const driver = storage(a.storage_driver);
      const keys = [a.proxy_key ?? a.storage_key, a.thumbnail_key].filter((k): k is string => !!k);
      const signed = await driver.signedReadUrls(keys, SIGNED_URL_TTL.preview).catch(() => ({}) as Record<string, string>);
      const filename = `${a.name.replace(/[^\w\- .]+/g, '').trim() || 'download'}.${extForMime(a.mime_type)}`;
      const download = allowDownload ? await driver.signedReadUrl(a.storage_key, SIGNED_URL_TTL.download, { download: filename }).catch(() => null) : null;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        durationS: a.duration_s == null ? null : Number(a.duration_s),
        width: a.width,
        height: a.height,
        isAiGenerated: a.is_ai_generated,
        src: signed[a.proxy_key ?? a.storage_key] ?? null,
        poster: a.thumbnail_key ? (signed[a.thumbnail_key] ?? null) : null,
        downloadUrl: download,
      };
    }),
  );
}

/** Public view of a share link. Password-protected links take the password in a POST body. */
async function resolve(sb: Parameters<Parameters<typeof publicRoute>[1]>[0]['sb'], token: string, password: string | undefined) {
  const { data: link } = await sb.from('share_links').select('*').eq('token', token).maybeSingle();
  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) throw notFound('This link');
  if (link.password_hash) {
    if (!password) throw new AppError('password_required', 'This link is password protected.', 401);
    if (!(await verifyPassword(password, link.password_hash))) throw new AppError('wrong_password', 'That password is not right.', 401);
  }
  await sb.from('share_links').update({ view_count: link.view_count + 1 }).eq('id', link.id);
  const [{ data: ws }, rows] = await Promise.all([
    sb.from('workspaces').select('name').eq('id', link.workspace_id).maybeSingle(),
    link.asset_id
      ? sb.from('assets').select('*').eq('id', link.asset_id).is('deleted_at', null).eq('status', 'ready')
      : sb.from('assets').select('*').eq('project_id', link.project_id!).is('deleted_at', null).eq('status', 'ready').order('created_at', { ascending: false }).limit(100),
  ]);
  const project = link.project_id ? (await sb.from('projects').select('name').eq('id', link.project_id).maybeSingle()).data : null;
  return {
    title: project?.name ?? rows.data?.[0]?.name ?? 'Shared file',
    from: ws?.name ?? null,
    expiresAt: link.expires_at,
    allowDownload: link.allow_download,
    files: await sharedFiles(rows.data ?? [], link.allow_download),
  };
}

export const GET = publicRoute({ limit: ['share-view', 120, 60] }, async ({ sb, params }) => resolve(sb, params.token!, undefined));

export const POST = publicRoute({ body: z.object({ password: z.string().max(128).optional() }), limit: ['share-unlock', 20, 300] }, async ({ sb, params, body }) => resolve(sb, params.token!, body.password));
