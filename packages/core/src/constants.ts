export const APP_NAME = 'AdForge Studio';

export const MEDIA_BUCKET = 'media';
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;
/** Supabase resumable uploads require 6 MB chunks. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const S3_PART_BYTES = 16 * 1024 * 1024;
export const S3_MAX_PARTS = 10_000;

export const SIGNED_URL_TTL = {
  preview: 60 * 60,
  download: 15 * 60,
  /** AI providers fetch inputs from a queue that can wait a while. */
  provider: 6 * 60 * 60,
  publish: 6 * 60 * 60,
} as const;

export const ASSET_TYPES = ['video', 'image', 'audio', 'model3d'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SOURCES = ['upload', 'generated', 'render', 'recording', 'import', 'derived'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const ASSET_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ASPECT_RATIOS = ['9:16', '1:1', '4:5', '16:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_SIZES: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '9:16': { width: 1080, height: 1920, label: 'Vertical 9:16' },
  '1:1': { width: 1080, height: 1080, label: 'Square 1:1' },
  '4:5': { width: 1080, height: 1350, label: 'Portrait 4:5' },
  '16:9': { width: 1920, height: 1080, label: 'Landscape 16:9' },
};

export function aspectFromSize(width: number, height: number): AspectRatio {
  const r = width / height;
  let best: AspectRatio = '16:9';
  let diff = Infinity;
  for (const a of ASPECT_RATIOS) {
    const s = ASPECT_SIZES[a];
    const d = Math.abs(s.width / s.height - r);
    if (d < diff) {
      diff = d;
      best = a;
    }
  }
  return best;
}

export const SOCIAL_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'x', 'pinterest'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const AD_PLATFORMS = ['meta', 'tiktok'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const INSPIRATION_PLATFORMS = ['meta', 'tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'pinterest', 'other'] as const;
export type InspirationPlatform = (typeof INSPIRATION_PLATFORMS)[number];

export const LICENSE_KINDS = ['generated', 'owned', 'licensed', 'royalty_free', 'public_domain', 'unknown'] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

/** Rights a person can record for music or sound effects they bring in. */
export const OWNED_LICENSE_KINDS = ['licensed', 'royalty_free', 'owned', 'public_domain'] as const satisfies readonly LicenseKind[];
export type OwnedLicenseKind = (typeof OWNED_LICENSE_KINDS)[number];

export const LICENSE_KIND_LABELS: Record<LicenseKind, string> = {
  generated: 'AI-generated',
  owned: 'I made it',
  licensed: 'Licensed from a library',
  royalty_free: 'Royalty-free',
  public_domain: 'Public domain',
  unknown: 'Unknown',
};

export const MUSIC_MOODS = ['Upbeat', 'Energetic', 'Chill', 'Inspiring', 'Emotional', 'Playful', 'Luxurious', 'Confident', 'Dreamy', 'Dark', 'Epic', 'Romantic'] as const;
export const MUSIC_GENRES = ['Pop', 'Hip-hop', 'Lo-fi', 'Electronic', 'House', 'Cinematic', 'Acoustic', 'Rock', 'R&B', 'Funk', 'Corporate', 'Afrobeats', 'Latin', 'Jazz', 'Ambient', 'Trap'] as const;

export const SFX_CATEGORIES = ['transition', 'impact', 'riser', 'ui', 'notification', 'glitch', 'foley', 'ambience', 'generated'] as const;
export type SfxCategory = (typeof SFX_CATEGORIES)[number];

export const CONSENT_KINDS = ['voice_clone', 'face_likeness', 'lipsync_dub'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** The exact words a person agrees to; stored with each consent record. */
export function consentStatement(kind: ConsentKind, subjectName: string, isSelf: boolean): string {
  const who = isSelf ? 'my own' : `${subjectName}'s`;
  const proof = isSelf ? '' : ` I have written permission from ${subjectName} and can show it on request.`;
  switch (kind) {
    case 'voice_clone':
      return `I confirm the recordings are ${who} voice and agree to create an AI copy of it for use in ads.${proof} I can delete the cloned voice at any time.`;
    case 'face_likeness':
      return `I confirm the images or footage show ${isSelf ? 'me' : subjectName} and agree to animate ${who} face and likeness with AI for use in ads.${proof}`;
    case 'lipsync_dub':
      return `I confirm the video shows ${isSelf ? 'me' : subjectName} and agree to change the lip movements and translate the speech with AI.${proof}`;
  }
}

export const AI_LABEL_TEXT = 'AI-generated';

/** Ads are always created paused; activation is a separate, explicit step. */
export const ADS_LAUNCH_STATUS = 'paused' as const;

/** Languages offered for scripts, voice-over and dubbing (ISO 639-1). */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'el', name: 'Greek' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'fil', name: 'Filipino' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
] as const;

/** Target languages ElevenLabs dubbing supports. */
export const DUB_LANGUAGES = ['en', 'hi', 'pt', 'zh', 'es', 'fr', 'de', 'ja', 'ar', 'ru', 'ko', 'id', 'it', 'nl', 'tr', 'pl', 'sv', 'fil', 'ms', 'ro', 'uk', 'el', 'cs', 'da', 'fi', 'bg', 'hr', 'sk', 'ta'] as const;

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code.toLowerCase())?.name ?? code;
}
