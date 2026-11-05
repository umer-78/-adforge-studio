import { SOCIAL_PLATFORMS, type SocialPlatform } from '../../constants';
import { isRecord } from '../../utils';
import { api, num, PlatformError } from './http';
import { emptyMetrics, type MetricsSnapshot, type PublishContext, type PublishOutcome } from './types';

const API = 'https://api.ayrshare.com/api';
const toAyr = (p: SocialPlatform) => (p === 'x' ? 'twitter' : p);
const fromAyr = (p: string): SocialPlatform | null => {
  const id = p === 'twitter' ? 'x' : p;
  return (SOCIAL_PLATFORMS as readonly string[]).includes(id) ? (id as SocialPlatform) : null;
};

function headers(apiKey: string, profileKey?: string | null): Record<string, string> {
  return { authorization: `Bearer ${apiKey}`, ...(profileKey ? { 'profile-key': profileKey } : {}) };
}

export interface AyrshareLinkedAccount {
  platform: SocialPlatform;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

/** Platforms the Ayrshare profile has linked in the Ayrshare dashboard. */
export async function ayrshareAccounts(apiKey: string, profileKey?: string | null): Promise<AyrshareLinkedAccount[]> {
  const { data } = await api<{ activeSocialAccounts?: string[]; displayNames?: { platform: string; displayName?: string; username?: string; userImage?: string; profileUrl?: string }[] }>(
    'ayrshare',
    `${API}/user`,
    { headers: headers(apiKey, profileKey) },
  );
  const names = new Map((data.displayNames ?? []).map((d) => [d.platform, d]));
  return (data.activeSocialAccounts ?? [])
    .map((p) => {
      const platform = fromAyr(p);
      if (!platform) return null;
      const d = names.get(p);
      return { platform, displayName: d?.displayName ?? null, username: d?.username ?? null, avatarUrl: d?.userImage ?? null, profileUrl: d?.profileUrl ?? null };
    })
    .filter((a): a is AyrshareLinkedAccount => !!a);
}

/** Publishes one target through Ayrshare. `ctx.accessToken` is the Ayrshare API key. */
export async function ayrsharePublish(platform: SocialPlatform, ctx: PublishContext): Promise<PublishOutcome> {
  const isVideo = ctx.media.kind === 'video';
  const vertical = (ctx.media.height ?? 0) > (ctx.media.width ?? 0);
  const body: Record<string, unknown> = {
    post: ctx.caption,
    platforms: [toAyr(platform)],
    mediaUrls: [ctx.media.url],
    isVideo,
    idempotencyKey: typeof ctx.options.idempotencyKey === 'string' ? ctx.options.idempotencyKey : undefined,
  };
  if (platform === 'youtube') {
    body.youTubeOptions = {
      title: (ctx.title ?? ctx.caption.split('\n')[0] ?? 'New video').replace(/[<>]/g, '').slice(0, 100),
      visibility: String(ctx.options.privacy ?? 'public'),
      madeForKids: ctx.options.madeForKids === true,
      shorts: vertical && (ctx.media.durationS ?? 999) <= 180,
      containsSyntheticMedia: ctx.aiGenerated,
      tags: ctx.hashtags.map((h) => h.replace(/^#/, '')).filter((t) => t.length >= 2),
    };
  }
  if (platform === 'tiktok') {
    body.tikTokOptions = {
      visibility: String(ctx.options.visibility ?? 'public'),
      isAIGenerated: ctx.aiGenerated,
      disableComments: ctx.options.disableComment === true,
      disableDuet: ctx.options.disableDuet === true,
      disableStitch: ctx.options.disableStitch === true,
      isBrandedContent: ctx.options.brandedContent === true,
      isBrandOrganic: ctx.options.yourBrand === true,
    };
  }
  if (platform === 'pinterest') {
    body.pinterestOptions = {
      title: (ctx.title ?? '').slice(0, 100),
      ...(ctx.link ? { link: ctx.link } : {}),
      ...(typeof ctx.options.boardId === 'string' ? { boardId: ctx.options.boardId } : {}),
      ...(isVideo && ctx.media.coverUrl ? { thumbNail: ctx.media.coverUrl } : {}),
    };
  }
  if (platform === 'facebook' && isVideo && vertical && (ctx.media.durationS ?? 999) <= 90) body.faceBookOptions = { reels: true, ...(ctx.title ? { title: ctx.title } : {}) };

  const { data } = await api<{ status: string; id?: string; errors?: unknown[]; postIds?: { status: string; platform: string; id?: string; postUrl?: string }[] }>('ayrshare', `${API}/post`, {
    headers: headers(ctx.accessToken, (ctx.account.meta.profileKey as string | undefined) ?? null),
    json: body,
  });
  const result = data.postIds?.find((p) => p.platform === toAyr(platform));
  if (data.status === 'error' || !result || result.status === 'error') {
    const reason = Array.isArray(data.errors) && isRecord(data.errors[0]) ? String(data.errors[0].message ?? '') : '';
    throw new PlatformError('ayrshare', 422, `Ayrshare could not publish to ${platform}${reason ? `: ${reason}` : '.'}`, { details: data });
  }
  // Keep Ayrshare's post id: analytics are looked up with it.
  return { status: 'published', externalId: `${data.id ?? ''}:${result.id ?? ''}`, externalUrl: result.postUrl ?? null };
}

export async function ayrshareMetrics(apiKey: string, platform: SocialPlatform, externalId: string, profileKey?: string | null): Promise<MetricsSnapshot | null> {
  const [ayrId] = externalId.split(':');
  if (!ayrId) return null;
  const { data } = await api<Record<string, { analytics?: Record<string, unknown> } | unknown>>('ayrshare', `${API}/analytics/post`, {
    headers: headers(apiKey, profileKey),
    json: { id: ayrId, platforms: [toAyr(platform)] },
  });
  const entry = data[toAyr(platform)];
  const a = isRecord(entry) && isRecord(entry.analytics) ? entry.analytics : null;
  if (!a) return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = num(a[k]);
      if (v != null) return v;
    }
    return null;
  };
  const out = emptyMetrics(a);
  out.views = pick('views', 'videoViews', 'viewCount', 'impressionCount', 'plays');
  out.likes = pick('likes', 'likeCount', 'reactions', 'favoriteCount');
  out.comments = pick('comments', 'commentCount', 'commentsCount', 'replyCount');
  out.shares = pick('shares', 'shareCount', 'retweetCount');
  out.saves = pick('saved', 'saves', 'bookmarkCount');
  out.impressions = pick('impressions', 'impressionCount', 'reach');
  out.clicks = pick('clicks', 'clickCount', 'outboundClicks');
  return out;
}
