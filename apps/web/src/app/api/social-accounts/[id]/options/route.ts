import { social } from '@adforge/core/server';
import { badRequest, owned, route } from '@/lib/server/api';

/**
 * What the composer must offer for this account right now: TikTok's allowed privacy levels and
 * interaction settings (required before each post), or the Pinterest boards to pin to.
 */
export const GET = route({ limit: ['account-options', 240, 3600] }, async ({ sb, caller, params }) => {
  const account = await owned(sb, 'social_accounts', params.id!, caller, 'The account');
  if (account.status !== 'active') throw badRequest('Reconnect this account first.');
  if (account.provider === 'ayrshare') return { platform: account.platform, provider: 'ayrshare' };
  const token = await social.socialAccessToken(sb, account);
  if (account.platform === 'tiktok') {
    const info = await social.tiktokCreatorInfo(token);
    return {
      platform: 'tiktok',
      provider: 'native',
      tiktok: {
        username: info.creator_username,
        nickname: info.creator_nickname,
        avatarUrl: info.creator_avatar_url,
        privacyLevels: info.privacy_level_options,
        commentDisabled: info.comment_disabled,
        duetDisabled: info.duet_disabled,
        stitchDisabled: info.stitch_disabled,
        maxDurationS: info.max_video_post_duration_sec,
      },
    };
  }
  if (account.platform === 'pinterest') return { platform: 'pinterest', provider: 'native', boards: await social.pinterestBoards(token) };
  return { platform: account.platform, provider: 'native' };
});
