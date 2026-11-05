import { ads, social } from '@adforge/core/server';
import { badRequest, owned, route } from '@/lib/server/api';

/** The Meta pixels this ad account can use, so sales campaigns optimize for purchases. */
export const GET = route({ scope: 'ads', limit: ['ad-pixels', 120, 3600] }, async ({ sb, caller, params }) => {
  const account = await owned(sb, 'ad_accounts', params.id!, caller, 'The ad account');
  if (account.platform !== 'meta') throw badRequest('Pixels are a Meta setting.');
  if (account.status !== 'active') throw badRequest('Reconnect this ad account first.');
  const token = await ads.adAccessToken(sb, account);
  const act = account.external_id.startsWith('act_') ? account.external_id : `act_${account.external_id}`;
  const res = await social.metaGet<{ data: { id: string; name?: string; last_fired_time?: string }[] }>(`/${act}/adspixels`, token, { fields: 'id,name,last_fired_time', limit: '100' });
  return { items: res.data.map((p) => ({ id: p.id, name: p.name ?? p.id, lastFiredAt: p.last_fired_time ?? null })) };
});
