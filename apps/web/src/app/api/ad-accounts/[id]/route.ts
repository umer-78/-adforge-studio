import { asJson, isRecord } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toAdAccountView } from '@/lib/server/distribution';

const patch = z.object({
  /** Meta: the Facebook Page the ads run as. */
  pageId: z.string().regex(/^[0-9]{1,40}$/).optional(),
  /** Meta: the Instagram account linked to that Page, or null for Facebook only. */
  instagramUserId: z.string().regex(/^[0-9]{1,40}$/).nullish(),
  /** Meta: the pixel that sales and lead campaigns optimize for. */
  pixelId: z.string().regex(/^[0-9]{1,40}$/, 'A pixel id is a number.').nullish(),
});

export const PATCH = route({ body: patch, role: 'admin', scope: 'ads' }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'ad_accounts', params.id!, caller, 'The ad account');
  if (row.platform !== 'meta') throw badRequest('Only Meta ad accounts have a Page, Instagram account and pixel to pick.');
  const view = toAdAccountView(row);
  const pageId = body.pageId ?? view.pageId;
  const identity = view.identities.find((i) => i.pageId === pageId);
  if (body.pageId && !identity) throw badRequest('Pick one of the Pages this connection can use. To use another Page, connect again and share it.');
  let instagramUserId = view.instagramUserId;
  if (body.instagramUserId !== undefined) {
    if (body.instagramUserId && body.instagramUserId !== identity?.instagramUserId) throw badRequest('That Instagram account is not linked to the chosen Page.');
    instagramUserId = body.instagramUserId ?? null;
  } else if (body.pageId) instagramUserId = identity?.instagramUserId ?? null;
  const meta = { ...(isRecord(row.meta) ? row.meta : {}), pageId, instagramUserId, ...(body.pixelId !== undefined ? { pixelId: body.pixelId ?? null } : {}) };
  const updated = check(await sb.from('ad_accounts').update({ meta: asJson(meta) }).eq('id', row.id).select('*').single(), 'Could not save the ad account');
  return toAdAccountView(updated);
});

/** Disconnects: the token is deleted and the account hidden. Campaign history and results stay. */
export const DELETE = route({ role: 'admin', scope: 'ads' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_accounts', params.id!, caller, 'The ad account');
  check(await sb.from('ad_account_tokens').delete().eq('ad_account_id', row.id), 'Could not remove the token');
  check(await sb.from('ad_accounts').update({ status: 'revoked', status_detail: 'Disconnected.', token_expires_at: null }).eq('id', row.id), 'Could not disconnect the ad account');
  await logActivity(sb, caller, 'ads.disconnected', 'ad_account', row.id, { platform: row.platform, name: row.name });
});
