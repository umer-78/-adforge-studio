import { bioPageSaveSchema, MAX_BIO_PAGES } from '@adforge/core';
import { badRequest, conflict, logActivity, route } from '@/lib/server/api';
import { checkBioAvatar, saveBioLinks, toBioViews } from '@/lib/server/bio';

export const GET = route({}, async ({ sb, caller }) => {
  const { data, error } = await sb.from('bio_pages').select('*').eq('workspace_id', caller.workspaceId).order('created_at');
  if (error) throw new Error(`Could not load the link pages: ${error.message}`);
  return { items: await toBioViews(sb, data ?? []) };
});

export const POST = route({ body: bioPageSaveSchema, limit: ['bio.write', 60, 3600] }, async ({ sb, caller, body }) => {
  const { count } = await sb.from('bio_pages').select('id', { count: 'exact', head: true }).eq('workspace_id', caller.workspaceId);
  if ((count ?? 0) >= MAX_BIO_PAGES) throw badRequest(`A workspace can have up to ${MAX_BIO_PAGES} link pages.`);
  await checkBioAvatar(sb, caller.workspaceId, body.avatarAssetId);
  const { data: page, error } = await sb
    .from('bio_pages')
    .insert({ workspace_id: caller.workspaceId, slug: body.slug, title: body.title, bio: body.bio, avatar_asset_id: body.avatarAssetId ?? null, theme: body.theme, published: body.published, created_by: caller.userId })
    .select('*')
    .single();
  if (error?.code === '23505') throw conflict('That address is taken. Pick another.');
  if (error || !page) throw new Error(`Could not create the page: ${error?.message}`);
  await saveBioLinks(sb, page, body.links);
  await logActivity(sb, caller, 'bio.created', 'bio_page', page.id, { slug: page.slug });
  return (await toBioViews(sb, [page]))[0];
});
