import { isLikelyBot } from '@adforge/core';
import * as z from 'zod';
import { publicRoute } from '@/lib/server/api';

/** Counts one visit to a published page. The page sends it once per browser session. */
export const POST = publicRoute({ body: z.object({ pageId: z.string().uuid() }), limit: ['bio.view', 30, 60] }, async ({ req, sb, body }) => {
  if (isLikelyBot(req.headers.get('user-agent'))) return;
  const { data: page } = await sb.from('bio_pages').select('id').eq('id', body.pageId).eq('published', true).maybeSingle();
  if (!page) return;
  const { error } = await sb.rpc('bio_track', { p_page: page.id });
  if (error) console.warn('[bio] view not counted', error.message);
});
