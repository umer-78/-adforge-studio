import * as z from 'zod';
import { setAudioRates } from '../ai/audio-models';

const optional = z.string().trim().min(1).optional().catch(undefined);
const flag = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));
const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v == null || v === '' ? def : Number(v);
      return Number.isFinite(n) ? n : def;
    });

/** Vercel's production domain when NEXT_PUBLIC_APP_URL is not set, so a fresh deploy links to itself. */
const appUrlOrDefault = (v: unknown) => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : 'http://localhost:3000';
};

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  NEXT_PUBLIC_APP_URL: z.preprocess(appUrlOrDefault, z.string().url()),
  APP_OWNER_EMAILS: z.string().default(''),
  /** Sign-in off: every visitor uses the studio as the first APP_OWNER_EMAILS account. */
  OPEN_ACCESS: flag(false),
  APP_ENCRYPTION_KEY: optional,
  APP_ENCRYPTION_KEY_PREVIOUS: optional,

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  SUPABASE_MAX_FILE_MB: num(50),

  STORAGE_DRIVER: z.enum(['supabase', 's3']).default('supabase'),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: flag(false),

  MUX_TOKEN_ID: optional,
  MUX_TOKEN_SECRET: optional,
  MUX_WEBHOOK_SECRET: optional,
  MUX_SIGNING_KEY_ID: optional,
  MUX_SIGNING_KEY_PRIVATE: optional,

  ANTHROPIC_API_KEY: optional,
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  LLM_FAST_MODEL: z.string().default('claude-sonnet-5-5'),
  ANTHROPIC_SERVER_FALLBACKS: flag(true),
  AGNES_API_KEY: optional,
  /** International API; use https://api.agnes-ai.cn/v1 for the China site. */
  AGNES_BASE_URL: z.string().url().default('https://apihub.agnes-ai.com/v1'),
  OPENAI_API_KEY: optional,
  FAL_KEY: optional,
  FAL_WEBHOOKS: flag(true),
  REPLICATE_API_TOKEN: optional,
  REPLICATE_WEBHOOK_SECRET: optional,
  ELEVENLABS_API_KEY: optional,
  // Free media libraries. Openverse works without keys; its app credentials raise the rate limit.
  PEXELS_API_KEY: optional,
  PIXABAY_API_KEY: optional,
  OPENVERSE_CLIENT_ID: optional,
  OPENVERSE_CLIENT_SECRET: optional,
  ELEVENLABS_USD_PER_1K_CHARS: num(0.22),
  ELEVENLABS_MUSIC_USD_PER_MIN: num(0.8),
  ELEVENLABS_SFX_USD_PER_GEN: num(0.044),
  ELEVENLABS_STS_USD_PER_MIN: num(0.22),
  ELEVENLABS_ISOLATE_USD_PER_MIN: num(0.22),
  ELEVENLABS_STT_USD_PER_MIN: num(0.0067),
  ELEVENLABS_DUB_USD_PER_MIN: num(0.66),
  TRANSCRIBE_PROVIDER: z.enum(['auto', 'elevenlabs', 'openai']).default('auto'),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  TIKTOK_CLIENT_KEY: optional,
  TIKTOK_CLIENT_SECRET: optional,
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_GRAPH_VERSION: z.string().default('v26.0'),
  META_AD_LIBRARY_TOKEN: optional,
  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  LINKEDIN_API_VERSION: z.string().default('202605'),
  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,
  PINTEREST_APP_ID: optional,
  PINTEREST_APP_SECRET: optional,
  AYRSHARE_API_KEY: optional,
  TIKTOK_ADS_APP_ID: optional,
  TIKTOK_ADS_SECRET: optional,

  WORKER_ID: z.string().default('worker-1'),
  WORKER_TMP_DIR: z.string().default('.tmp'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  REMOTION_CHROME_PATH: optional,
  /** Pre-built Remotion bundle (directory or URL); bundled on first render when unset. */
  REMOTION_SERVE_URL: optional,
  /** Remotion company license key; individuals and small teams can render without one. */
  REMOTION_LICENSE_KEY: optional,
  RENDER_CONCURRENCY: num(0),
  /** Comma-separated pools this process runs (render, media, ai, network); empty runs all. */
  WORKER_POOLS: z.string().default(''),
  WORKER_PORT: num(8080),
  /** Set by hosts such as Railway; wins over WORKER_PORT for the worker's health endpoint. */
  PORT: num(0),
  /** Upload analysis (tags, transcript, search embedding) runs automatically when an LLM key is set. */
  AUTO_ANALYZE: flag(true),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  // ElevenLabs bills in plan credits; server-side estimates use this deployment's rates.
  setAudioRates({
    ttsPer1kChars: cached.ELEVENLABS_USD_PER_1K_CHARS,
    musicPerMinute: cached.ELEVENLABS_MUSIC_USD_PER_MIN,
    sfxPerGeneration: cached.ELEVENLABS_SFX_USD_PER_GEN,
    stsPerMinute: cached.ELEVENLABS_STS_USD_PER_MIN,
    isolatePerMinute: cached.ELEVENLABS_ISOLATE_USD_PER_MIN,
    transcribePerMinute: cached.ELEVENLABS_STT_USD_PER_MIN,
    dubPerMinute: cached.ELEVENLABS_DUB_USD_PER_MIN,
  });
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export function supabasePublishableKey(e = env()): string {
  const key = e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  return key;
}

export function supabaseSecretKey(e = env()): string {
  const key = e.SUPABASE_SECRET_KEY ?? e.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Set SUPABASE_SECRET_KEY');
  return key;
}

export function ownerEmails(e: Pick<Env, 'APP_OWNER_EMAILS'> = env()): string[] {
  return e.APP_OWNER_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** The account every visitor uses while sign-in is off (OPEN_ACCESS), else null. */
export function openAccessEmail(e: Pick<Env, 'OPEN_ACCESS' | 'APP_OWNER_EMAILS'> = env()): string | null {
  return e.OPEN_ACCESS ? (ownerEmails(e)[0] ?? null) : null;
}

export function appUrl(path = '', e = env()): string {
  return new URL(path, e.NEXT_PUBLIC_APP_URL.endsWith('/') ? e.NEXT_PUBLIC_APP_URL : `${e.NEXT_PUBLIC_APP_URL}/`).toString();
}

/** Webhooks need a public HTTPS URL; local development falls back to polling. */
export function publicWebhookBase(e = env()): string | null {
  const url = new URL(e.NEXT_PUBLIC_APP_URL);
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return null;
  return url.origin;
}

export interface Features {
  storage: 'supabase' | 's3';
  maxUploadBytes: number;
  mux: boolean;
  muxSigned: boolean;
  llm: boolean;
  embeddings: boolean;
  moderation: boolean;
  fal: boolean;
  replicate: boolean;
  agnes: boolean;
  elevenlabs: boolean;
  /** Free media libraries that are switched on. */
  stock: Record<'pexels' | 'pixabay' | 'openverse', boolean>;
  transcription: boolean;
  encryption: boolean;
  social: Record<'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'pinterest' | 'ayrshare', boolean>;
  ads: Record<'meta' | 'tiktok', boolean>;
  adLibrary: boolean;
}

export function features(e = env()): Features {
  const s3 = e.STORAGE_DRIVER === 's3' && !!(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
  const meta = !!(e.META_APP_ID && e.META_APP_SECRET);
  return {
    storage: s3 ? 's3' : 'supabase',
    maxUploadBytes: s3 ? 5 * 1024 ** 3 : e.SUPABASE_MAX_FILE_MB * 1024 ** 2,
    mux: !!(e.MUX_TOKEN_ID && e.MUX_TOKEN_SECRET),
    muxSigned: !!(e.MUX_SIGNING_KEY_ID && e.MUX_SIGNING_KEY_PRIVATE),
    llm: !!e.ANTHROPIC_API_KEY,
    embeddings: !!e.OPENAI_API_KEY,
    moderation: !!e.OPENAI_API_KEY,
    fal: !!e.FAL_KEY,
    replicate: !!e.REPLICATE_API_TOKEN,
    agnes: !!e.AGNES_API_KEY,
    elevenlabs: !!e.ELEVENLABS_API_KEY,
    stock: { pexels: !!e.PEXELS_API_KEY, pixabay: !!e.PIXABAY_API_KEY, openverse: true },
    transcription: !!(e.ELEVENLABS_API_KEY || e.OPENAI_API_KEY),
    encryption: !!e.APP_ENCRYPTION_KEY,
    social: {
      youtube: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
      tiktok: !!(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET),
      instagram: meta,
      facebook: meta,
      linkedin: !!(e.LINKEDIN_CLIENT_ID && e.LINKEDIN_CLIENT_SECRET),
      x: !!(e.X_CLIENT_ID && e.X_CLIENT_SECRET),
      pinterest: !!(e.PINTEREST_APP_ID && e.PINTEREST_APP_SECRET),
      ayrshare: !!e.AYRSHARE_API_KEY,
    },
    ads: { meta, tiktok: !!(e.TIKTOK_ADS_APP_ID && e.TIKTOK_ADS_SECRET) },
    adLibrary: !!(e.META_AD_LIBRARY_TOKEN || meta),
  };
}
