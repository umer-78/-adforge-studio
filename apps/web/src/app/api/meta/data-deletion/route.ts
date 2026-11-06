import { appUrl } from '@adforge/core/server';
import { deleteMetaUserData, recordMetaDeletion } from '@/lib/server/account';
import { publicRoute } from '@/lib/server/api';
import { readSignedRequest } from '../signed-request';

/**
 * Meta's data deletion callback: someone removed the app in their Facebook settings and asked for
 * their data to be deleted. Deletes what their Facebook login connected and answers with the status
 * page and confirmation code Meta shows them.
 */
export const POST = publicRoute({ limit: ['meta-data-deletion', 60, 60] }, async ({ sb, req }) => {
  const { userId } = await readSignedRequest(req);
  const removed = await deleteMetaUserData(sb, userId);
  const code = await recordMetaDeletion(sb, removed);
  return { url: appUrl(`/data-deletion?code=${code}`), confirmation_code: code };
});
