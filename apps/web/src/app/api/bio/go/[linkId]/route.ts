import { isLikelyBot } from '@adforge/core';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { clientIp, publicRoute, rateLimit } from '@/lib/server/api';

const gone = () => new NextResponse('This link is no longer available.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/** Counts a click on a link-in-bio button, then sends the visitor on. */
export const GET = publicRoute({}, async ({ req, sb, params }) => {
  const id = params.linkId ?? '';
  if (!z.string().uuid().safeParse(id).success) return gone();
  const { data: link } = await sb.from('bio_links').select('id, page_id, url, enabled').eq('id', id).maybeSingle();
  if (!link?.enabled) return gone();
  const { data: page } = await sb.from('bio_pages').select('id').eq('id', link.page_id).eq('published', true).maybeSingle();
  if (!page) return gone();
  if (!isLikelyBot(req.headers.get('user-agent'))) {
    // Over the limit still redirects; the click just is not counted.
    const counted = await rateLimit(sb, `bio.click:${clientIp(req)}`, 60, 60).then(
      () => true,
      () => false,
    );
    if (counted) {
      const { error } = await sb.rpc('bio_track', { p_page: page.id, p_link: link.id });
      if (error) console.warn('[bio] click not counted', error.message);
    }
  }
  return new NextResponse(null, { status: 302, headers: { location: link.url, 'cache-control': 'no-store', 'referrer-policy': 'strict-origin-when-cross-origin' } });
});
