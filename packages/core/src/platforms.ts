import type { AspectRatio, SocialPlatform } from './constants';

export interface PlatformSpec {
  id: SocialPlatform;
  label: string;
  color: string;
  maxDurationS: number;
  minDurationS: number;
  maxBytes: number;
  aspects: AspectRatio[];
  preferredAspect: AspectRatio;
  captionLimit: number;
  hashtagLimit: number;
  titleLimit?: number;
  requiresTitle?: boolean;
  supportsScheduling: boolean;
  /** Platform supports a native "AI-generated" disclosure flag. */
  aiDisclosure: boolean;
  notes: string;
}

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0033',
    maxDurationS: 12 * 60 * 60,
    minDurationS: 1,
    maxBytes: 256 * 1024 ** 3,
    aspects: ['16:9', '9:16', '1:1', '4:5'],
    preferredAspect: '16:9',
    captionLimit: 5000,
    hashtagLimit: 15,
    titleLimit: 100,
    requiresTitle: true,
    supportsScheduling: true,
    aiDisclosure: true,
    notes: 'Vertical videos up to 3 minutes are treated as Shorts.',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    color: '#25F4EE',
    maxDurationS: 10 * 60,
    minDurationS: 3,
    maxBytes: 4 * 1024 ** 3,
    aspects: ['9:16', '1:1', '16:9'],
    preferredAspect: '9:16',
    captionLimit: 2200,
    hashtagLimit: 30,
    supportsScheduling: false,
    aiDisclosure: true,
    notes: 'Apps that have not passed TikTok review can only post privately.',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram Reels',
    color: '#E1306C',
    maxDurationS: 15 * 60,
    minDurationS: 3,
    maxBytes: 1024 ** 3,
    aspects: ['9:16', '4:5', '1:1'],
    preferredAspect: '9:16',
    captionLimit: 2200,
    hashtagLimit: 30,
    supportsScheduling: false,
    aiDisclosure: false,
    notes: 'Requires an Instagram professional account linked to a Facebook Page.',
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    maxDurationS: 4 * 60 * 60,
    minDurationS: 1,
    maxBytes: 10 * 1024 ** 3,
    aspects: ['16:9', '9:16', '1:1', '4:5'],
    preferredAspect: '4:5',
    captionLimit: 63206,
    hashtagLimit: 30,
    supportsScheduling: true,
    aiDisclosure: false,
    notes: 'Posts to a Facebook Page you manage.',
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    maxDurationS: 30 * 60,
    minDurationS: 3,
    maxBytes: 5 * 1024 ** 3,
    aspects: ['16:9', '1:1', '4:5', '9:16'],
    preferredAspect: '1:1',
    captionLimit: 3000,
    hashtagLimit: 10,
    supportsScheduling: false,
    aiDisclosure: false,
    notes: 'Posts to your member profile.',
  },
  x: {
    id: 'x',
    label: 'X',
    color: '#E7E9EA',
    maxDurationS: 140,
    minDurationS: 0.5,
    maxBytes: 512 * 1024 ** 2,
    aspects: ['16:9', '1:1', '9:16'],
    preferredAspect: '16:9',
    captionLimit: 280,
    hashtagLimit: 5,
    supportsScheduling: false,
    aiDisclosure: false,
    notes: 'Longer videos need X Premium on the posting account.',
  },
  pinterest: {
    id: 'pinterest',
    label: 'Pinterest',
    color: '#E60023',
    maxDurationS: 15 * 60,
    minDurationS: 4,
    maxBytes: 2 * 1024 ** 3,
    aspects: ['9:16', '4:5', '1:1'],
    preferredAspect: '9:16',
    captionLimit: 500,
    hashtagLimit: 20,
    titleLimit: 100,
    supportsScheduling: false,
    aiDisclosure: false,
    notes: 'Pins are created on the default board you choose in Settings.',
  },
};

export interface PlatformIssue {
  level: 'error' | 'warning';
  message: string;
}

export function validateForPlatform(
  platform: SocialPlatform,
  media: { durationS?: number | null; sizeBytes?: number | null; width?: number | null; height?: number | null; type?: string },
  post: { caption: string; hashtags: string[]; title?: string | null },
): PlatformIssue[] {
  const spec = PLATFORM_SPECS[platform];
  const issues: PlatformIssue[] = [];
  if (media.type && media.type !== 'video' && media.type !== 'image') issues.push({ level: 'error', message: `${spec.label} needs a video or image.` });
  if (media.durationS != null) {
    if (media.durationS > spec.maxDurationS) issues.push({ level: 'error', message: `${spec.label} allows up to ${Math.round(spec.maxDurationS)}s; this video is ${Math.round(media.durationS)}s.` });
    if (media.durationS < spec.minDurationS) issues.push({ level: 'error', message: `${spec.label} needs at least ${spec.minDurationS}s of video.` });
  }
  if (media.sizeBytes != null && media.sizeBytes > spec.maxBytes) issues.push({ level: 'error', message: `File is too large for ${spec.label}.` });
  if (media.width && media.height) {
    const r = media.width / media.height;
    const ok = spec.aspects.some((a) => {
      const [w, h] = a.split(':').map(Number) as [number, number];
      return Math.abs(w / h - r) < 0.04;
    });
    if (!ok) issues.push({ level: 'warning', message: `${spec.label} works best with ${spec.aspects.join(', ')}; the video will be letterboxed or cropped.` });
  }
  const text = [post.caption, post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')].filter(Boolean).join('\n\n');
  if (text.length > spec.captionLimit) issues.push({ level: 'error', message: `Caption is ${text.length} characters; ${spec.label} allows ${spec.captionLimit}.` });
  if (post.hashtags.length > spec.hashtagLimit) issues.push({ level: 'warning', message: `${spec.label} recommends at most ${spec.hashtagLimit} hashtags.` });
  if (spec.requiresTitle && !post.title?.trim()) issues.push({ level: 'error', message: `${spec.label} needs a title.` });
  if (spec.titleLimit && post.title && post.title.length > spec.titleLimit) issues.push({ level: 'error', message: `Title must be at most ${spec.titleLimit} characters for ${spec.label}.` });
  return issues;
}

export function composeCaption(caption: string, hashtags: string[], limit?: number): string {
  const tags = hashtags.map((h) => `#${h.replace(/^#/, '').replace(/\s+/g, '')}`).filter((h) => h.length > 1);
  const text = [caption.trim(), tags.join(' ')].filter(Boolean).join('\n\n');
  return limit ? text.slice(0, limit) : text;
}
