import { bioPageSaveSchema } from '@adforge/core';
import { conflict, logActivity, owned, route } from '@/lib/server/api';
import { bioStats, checkBioAvatar, saveBioLinks, toBioViews } from '@/lib/server/bio';

export const GET = route({}, async ({ sb, caller, params }) => {
  const page = await owned(sb, 'bio_pages', params.id!, caller, 'The link page');
  const [view, stats] = await Promise.all([toBioViews(sb, [page]), bioStats(sb, page.id)]);
  return { page: view[0], stats };
});

export const PUT = route({ body: bioPageSaveSchema, limit: ['bio.write', 60, 3600] }, async ({ sb, caller, params, body }) => {
  const page = await owned(sb, 'bio_pages', params.id!, caller, 'The link page');
  await checkBioAvatar(sb, caller.workspaceId, body.avatarAssetId);
  const { data: saved, error } = await sb
    .from('bio_pages')
    .update({ slug: body.slug, title: body.title, bio: body.bio, avatar_asset_id: body.avatarAssetId ?? null, theme: body.theme, published: body.published })
    .eq('id', page.id)
    .select('*')
    .single();
  if (error?.code === '23505') throw conflict('That address is taken. Pick another.');
  if (error || !saved) throw new Error(`Could not save the page: ${error?.message}`);
  await saveBioLinks(sb, saved, body.links);
  if (saved.published !== page.published) await logActivity(sb, caller, saved.published ? 'bio.published' : 'bio.unpublished', 'bio_page', page.id, { slug: saved.slug });
  return (await toBioViews(sb, [saved]))[0];
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const page = await owned(sb, 'bio_pages', params.id!, caller, 'The link page');
  const { error } = await sb.from('bio_pages').delete().eq('id', page.id);
  if (error) throw new Error(`Could not delete the page: ${error.message}`);
  await logActivity(sb, caller, 'bio.deleted', 'bio_page', page.id, { slug: page.slug });
});
