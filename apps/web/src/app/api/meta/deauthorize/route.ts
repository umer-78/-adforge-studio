import { revokeMetaUser } from '@/lib/server/account';
import { publicRoute } from '@/lib/server/api';
import { readSignedRequest } from '../signed-request';

/**
 * Meta's deauthorize callback: someone removed the app from their Facebook account, so its tokens no
 * longer work. The accounts their Facebook login connected are marked disconnected.
 */
export const POST = publicRoute({ limit: ['meta-deauthorize', 60, 60] }, async ({ sb, req }) => {
  const { userId } = await readSignedRequest(req);
  return { disconnected: await revokeMetaUser(sb, userId) };
});
