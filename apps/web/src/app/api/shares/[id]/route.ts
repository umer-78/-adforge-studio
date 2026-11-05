import { check, owned, route } from '@/lib/server/api';

export const DELETE = route({}, async ({ sb, caller, params }) => {
  await owned(sb, 'share_links', params.id!, caller, 'Share link');
  check(await sb.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', params.id!), 'Could not revoke the link');
});
