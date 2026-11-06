/**
 * Sample workspace data for end-to-end tests and UI previews. Shapes follow src/lib/types.ts, and
 * catalogs (models, templates, sound effects, platforms) come from @adforge/core, so the screens
 * show what the real app offers. Media points at files the app ships in /public.
 */
import { BUILTIN_SFX, CAPABILITIES, estimateCost, MODELS, TIMELINE_TEMPLATES, type Capability } from '@adforge/core';
import type { AssetView, GenerationView, JobView, Me, ModelView, PostView, ProviderView, SocialAccountView, TimelineSummaryView, UsageView } from '../src/lib/types';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const id = (prefix: string, n: number) => `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const NOW_ISO = iso(0);

export const me: Me = {
  user: { id: id('aaaaaaaa', 1), email: 'owner@example.com', name: 'Studio Owner', avatarUrl: null },
  workspace: { id: id('bbbbbbbb', 1), name: 'AdForge Studio', slug: 'adforge', role: 'owner', monthlyBudgetUsd: 100, budgetHardStop: true, aiLabelDefault: true, settings: {} },
  features: {
    storage: 'supabase',
    maxUploadBytes: 5 * 1024 ** 3,
    mux: true,
    llm: true,
    embeddings: true,
    fal: true,
    replicate: true,
    agnes: false,
    elevenlabs: true,
    transcription: true,
    encryption: true,
    social: { youtube: true, tiktok: true, instagram: true, facebook: true, linkedin: true, x: false, pinterest: true },
    ads: { meta: true, tiktok: true },
    adLibrary: true,
  },
  providers: { anthropic: true, openai: true, fal: true, replicate: true, agnes: false, elevenlabs: true, ayrshare: false },
  budget: { spentUsd: 23.84, budgetUsd: 100, remainingUsd: 76.16, hardStop: true },
};

interface MediaSeed {
  name: string;
  type: AssetView['type'];
  file: string;
  poster: string;
  width: number;
  height: number;
  durationS?: number;
  ai?: boolean;
  tags?: string[];
  source?: AssetView['source'];
}

const MEDIA: MediaSeed[] = [
  { name: 'Hook: stop the scroll', type: 'video', file: '/landing/kinetic.mp4', poster: '/landing/kinetic.jpg', width: 720, height: 1280, durationS: 5, ai: false, tags: ['hook', 'kinetic'], source: 'render' },
  { name: 'Everyday Bottle showcase', type: 'video', file: '/landing/showcase.mp4', poster: '/landing/showcase.jpg', width: 720, height: 1280, durationS: 5, tags: ['product', 'bottle'], source: 'render' },
  { name: 'Us vs them comparison', type: 'video', file: '/landing/compare.mp4', poster: '/landing/compare.jpg', width: 720, height: 1280, durationS: 5, tags: ['comparison'], source: 'render' },
  ...['before-after', 'listicle', 'problem-solution', 'unboxing', 'us-vs-them'].map((t) => ({
    name: `${t.replace(/-/g, ' ')} frame`,
    type: 'image' as const,
    file: `/templates/${t}.jpg`,
    poster: `/templates/${t}.jpg`,
    width: 540,
    height: 960,
    tags: ['template'],
    source: 'render' as const,
  })),
  ...['kinetic-title', 'price-tag', 'sale-badge', 'rating-stars', 'logo-sting', 'testimonial']
    .map((m) => ({ name: m.replace(/-/g, ' '), type: 'image' as const, file: `/motion/${m}.jpg`, poster: `/motion/${m}.jpg`, width: 540, height: 540, ai: true, tags: ['motion'], source: 'generated' as const })),
];

function asset(seed: MediaSeed, n: number): AssetView {
  const isVideo = seed.type === 'video';
  return {
    id: id('cccccccc', n),
    name: seed.name.charAt(0).toUpperCase() + seed.name.slice(1),
    credits: [],
    type: seed.type,
    mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
    status: 'ready',
    source: seed.source ?? 'upload',
    sizeBytes: isVideo ? 2_400_000 + n * 91_000 : 180_000 + n * 7_000,
    durationS: seed.durationS ?? null,
    width: seed.width,
    height: seed.height,
    fps: isVideo ? 30 : null,
    tags: seed.tags ?? [],
    aiTags: isVideo ? ['bold type', 'dark background'] : ['studio light'],
    aiCaption: null,
    description: null,
    isFavorite: n % 4 === 0,
    isAiGenerated: !!seed.ai,
    projectId: null,
    folderId: null,
    parentAssetId: null,
    generationId: null,
    licenseId: null,
    version: 1,
    processingError: null,
    createdAt: iso(-n * DAY * 0.6),
    updatedAt: iso(-n * DAY * 0.5),
    deletedAt: null,
    role: null,
    colors: ['#7C5CFF', '#0B0B12', '#FF4D8D'],
    score: isVideo ? { overall: 86 - n * 4 } : null,
    url: seed.file,
    thumbnailUrl: seed.poster,
    previewUrl: isVideo ? seed.file : null,
    proxyUrl: isVideo ? seed.file : null,
    waveformUrl: null,
    playback: isVideo ? { kind: 'file', src: seed.file, poster: seed.poster, preparing: false } : null,
  };
}

export const assets: AssetView[] = MEDIA.map((m, i) => asset(m, i + 1));
const videos = assets.filter((a) => a.type === 'video');

const VERSION_BYTES = 1_250_000;
export const stats = {
  storage_bytes: assets.reduce((s, a) => s + a.sizeBytes, 0) + VERSION_BYTES,
  asset_count: assets.length,
  video_count: videos.length,
  image_count: assets.length - videos.length,
  audio_count: 0,
  trash_count: 2,
  generation_count: 9,
  month_spend_usd: me.budget.spentUsd,
  monthly_budget_usd: me.budget.budgetUsd,
  active_jobs: 1,
  scheduled_posts: 4,
  published_posts: 11,
  storage_by_type: assets.reduce<Record<string, number>>((m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + a.sizeBytes }), { versions: VERSION_BYTES }),
  generations_daily: [0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 2, 0, 1, 1].map((count, i) => ({ date: iso((i - 13) * 86_400_000).slice(0, 10), count })),
};

export function models(capability?: Capability | null): ModelView[] {
  return MODELS.filter((m) => !capability || m.capability === capability).map((m) => {
    let fromUsd = 0;
    let etaS = 0;
    try {
      const est = estimateCost(m.id, {});
      fromUsd = est.usd;
      etaS = est.etaS;
    } catch {
      // Priced per input.
    }
    return {
      id: m.id,
      label: m.label,
      vendor: m.vendor,
      provider: m.provider,
      capability: m.capability,
      output: CAPABILITIES[m.capability].output,
      description: m.description,
      badges: m.badges,
      inputs: m.inputs ?? null,
      controls: m.controls,
      defaults: m.defaults,
      recommended: !!m.recommended,
      available: m.provider !== 'agnes',
      fromUsd,
      etaS,
    };
  });
}

export const generations: GenerationView[] = videos.map((a, i) => ({
  id: id('dddddddd', i + 1),
  capability: 't2v',
  model: 'veo31-fast-t2v',
  modelLabel: 'Veo 3.1 Fast',
  provider: 'fal',
  prompt: ['Bold kinetic headline on a dark set, fast cuts', 'Bottle on a seamless studio sweep, slow orbit', 'Split screen, ours vs theirs, clean labels'][i] ?? 'Product ad',
  params: { aspect: '9:16', durationS: 5 },
  status: 'succeeded',
  progress: 1,
  error: null,
  costEstimateUsd: 1.2,
  costActualUsd: 1.2,
  etaSeconds: null,
  variantGroup: null,
  variantIndex: null,
  createdAt: a.createdAt,
  completedAt: a.updatedAt,
  outputs: [a],
  inputs: [],
}));

export const timelines: TimelineSummaryView[] = TIMELINE_TEMPLATES.slice(0, 6).map((t, i) => ({
  id: id('eeeeeeee', i + 1),
  name: `${t.name} — spring launch`,
  aspect: i % 3 === 2 ? '1:1' : '9:16',
  width: i % 3 === 2 ? 1080 : 1080,
  height: i % 3 === 2 ? 1080 : 1920,
  fps: 30,
  durationS: 12 + i * 3,
  version: 3 + i,
  projectId: null,
  thumbnailUrl: `/templates/${t.id}.jpg`,
  updatedAt: iso(-i * DAY * 0.8),
  createdAt: iso(-i * DAY * 2),
}));

const noMetrics = { views: null, impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: null, ctr: null, watchTimeS: null };

function post(n: number, dayOffset: number, hour: number, status: PostView['status'], platforms: PostView['platforms']): PostView {
  const when = new Date(NOW + dayOffset * DAY);
  when.setUTCHours(hour, 0, 0, 0);
  const published = status === 'published';
  const metrics = published ? { views: 4200 * n, impressions: 6100 * n, likes: 310 * n, comments: 24 * n, shares: 41 * n, saves: 18 * n, clicks: 96 * n, ctr: 0.016, watchTimeS: 3100 * n } : noMetrics;
  return {
    id: id('ffffffff', n),
    title: ['Spring drop teaser', 'Bottle restock', 'Customer review cut', 'Flash sale 24h', 'How it works', 'Comparison reel'][n % 6] ?? 'Post',
    caption: 'Cold for 24 hours. Built for every day.',
    firstComment: null,
    hashtags: ['#hydration', '#everydaycarry'],
    status,
    scheduledAt: when.toISOString(),
    publishedAt: published ? when.toISOString() : null,
    abGroup: null,
    abVariant: null,
    aiLabel: true,
    asset: videos[n % videos.length] ?? null,
    platforms,
    targets: platforms.map((p, i) => ({
      id: id('ab000000', n * 10 + i),
      socialAccountId: id('ac000000', i + 1),
      platform: p,
      account: { handle: '@everydaybottle', displayName: 'Everyday Bottle', avatarUrl: null, provider: 'native' },
      captionOverride: null,
      options: {},
      status: published ? 'published' : 'pending',
      externalUrl: null,
      error: null,
      firstComment: null,
      attempts: published ? 1 : 0,
      publishedAt: published ? when.toISOString() : null,
      metrics,
      metricsUpdatedAt: published ? iso(-DAY / 4) : null,
    })),
    totals: metrics,
    projectId: null,
    createdAt: iso(dayOffset * DAY - 3 * DAY),
    updatedAt: iso(dayOffset * DAY - 2 * DAY),
  };
}

export const posts: PostView[] = [
  post(1, -3, 15, 'published', ['instagram', 'tiktok']),
  post(2, -1, 18, 'published', ['youtube']),
  post(3, 1, 16, 'scheduled', ['instagram', 'facebook']),
  post(4, 2, 12, 'scheduled', ['tiktok']),
  post(5, 4, 19, 'scheduled', ['youtube', 'linkedin']),
  post(6, 6, 17, 'scheduled', ['pinterest']),
];

export const jobs: JobView[] = [
  { id: id('a1000000', 1), type: 'render.timeline', label: 'Exporting “Spring launch” (1080p)', status: 'running', progress: 0.42, progressMessage: 'Rendering frames', error: null, attempts: 1, createdAt: iso(-120_000), startedAt: iso(-90_000), completedAt: null, payload: {}, result: null },
];

export function usage(days = 30): UsageView {
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(NOW - (days - 1 - i) * DAY);
    const usd = Math.round((Math.sin(i / 3) + 1.3) * 0.9 * 100) / 100;
    return { date: d.toISOString().slice(0, 10), usd };
  });
  const totalUsd = Math.round(daily.reduce((s, d) => s + d.usd, 0) * 100) / 100;
  return {
    totalUsd,
    budget: me.budget,
    daily,
    byKind: [
      { key: 'generation', usd: Math.round(totalUsd * 0.62 * 100) / 100 },
      { key: 'voice', usd: Math.round(totalUsd * 0.18 * 100) / 100 },
      { key: 'llm', usd: Math.round(totalUsd * 0.12 * 100) / 100 },
      { key: 'render', usd: Math.round(totalUsd * 0.08 * 100) / 100 },
    ],
    byProvider: [
      { key: 'fal', usd: Math.round(totalUsd * 0.62 * 100) / 100 },
      { key: 'elevenlabs', usd: Math.round(totalUsd * 0.18 * 100) / 100 },
      { key: 'anthropic', usd: Math.round(totalUsd * 0.12 * 100) / 100 },
    ],
    topModels: [
      { model: 'veo31-fast-t2v', usd: 9.6, count: 8 },
      { model: 'eleven-v3-tts', usd: 3.1, count: 14 },
    ],
    recent: [
      { at: iso(-3_600_000), kind: 'generation', provider: 'fal', model: 'veo31-fast-t2v', usd: 1.2, units: 8, unit: 's' },
      { at: iso(-7_200_000), kind: 'voice', provider: 'elevenlabs', model: 'eleven-v3-tts', usd: 0.21, units: 700, unit: 'chars' },
    ],
  };
}

export const activity = [
  { id: id('a2000000', 1), verb: 'generation.completed', object_type: 'generation', object_id: generations[0]!.id, data: { label: 'Veo 3.1 Fast' }, created_at: iso(-3_600_000) },
  { id: id('a2000000', 2), verb: 'post.published', object_type: 'post', object_id: posts[1]!.id, data: { platforms: ['youtube'] }, created_at: iso(-DAY) },
  { id: id('a2000000', 3), verb: 'asset.uploaded', object_type: 'asset', object_id: assets[3]!.id, data: { name: assets[3]!.name }, created_at: iso(-2 * DAY) },
];

export const socialAccounts: SocialAccountView[] = (['instagram', 'tiktok', 'youtube', 'facebook'] as const).map((p, i) => ({
  id: id('ac000000', i + 1),
  platform: p,
  provider: 'native',
  handle: '@everydaybottle',
  displayName: 'Everyday Bottle',
  avatarUrl: null,
  status: 'active',
  statusDetail: null,
  tokenExpiresAt: iso(50 * DAY),
  createdAt: iso(-20 * DAY),
}));

export const providers: ProviderView[] = (['anthropic', 'openai', 'fal', 'replicate', 'agnes', 'elevenlabs', 'ayrshare'] as const).map((p) => ({
  id: p,
  source: me.providers[p] ? 'workspace' : 'none',
  keyHint: me.providers[p] ? '…4f2a' : null,
  label: null,
  updatedAt: me.providers[p] ? iso(-10 * DAY) : null,
  serverKey: false,
}));

export const sfx = {
  mine: [],
  builtin: BUILTIN_SFX.map((s) => ({ id: s.id, name: s.name, category: s.category, tags: s.tags, durationS: s.durationS, builtinId: s.id, url: `/sfx/${s.id}.mp3`, asset: null, licenseState: 'ok', generated: false, createdAt: null })),
};

export const templates = TIMELINE_TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description, durationS: t.durationS, aspect: null, builtin: true, updatedAt: null }));

/** Free media search results, using the site's own sample images. */
export function stock(kind: string | null, provider: string | null) {
  const k = (kind ?? 'photo') as 'photo' | 'video' | 'music' | 'sound';
  const providers = [
    { id: 'pexels', label: 'Pexels', url: 'https://www.pexels.com', kinds: ['photo', 'video'], enabled: true },
    { id: 'pixabay', label: 'Pixabay', url: 'https://pixabay.com', kinds: ['photo', 'video'], enabled: false },
    { id: 'openverse', label: 'Openverse', url: 'https://openverse.org', kinds: ['photo', 'music', 'sound'], enabled: true },
  ];
  const active = provider ?? (k === 'photo' || k === 'video' ? 'pexels' : 'openverse');
  const pics = ['before-after', 'listicle', 'problem-solution', 'unboxing', 'us-vs-them'].map((t) => `/templates/${t}.jpg`).concat(['kinetic', 'showcase', 'compare'].map((t) => `/landing/${t}.jpg`));
  const creators = ['Ana Ruiz', 'Kenji Mori', 'Lea Brandt', 'Omar Haddad', 'Priya Nair', 'Sam Okafor', 'Tess Larsen', 'Yuki Sato'];
  const visual = k === 'photo' || k === 'video';
  const items = Array.from({ length: visual ? 8 : 6 }, (_, i) => {
    const license = active === 'openverse' ? (i % 3 === 2 ? 'by' : i % 2 ? 'pdm' : 'cc0') : active;
    const title = visual ? ['Morning coffee pour', 'Desk with laptop', 'City lights at night', 'Fresh skincare set', 'Runner at sunrise', 'Beach in summer', 'Product unboxing', 'Happy customer'][i]! : k === 'music' ? ['Bright Morning', 'Upbeat Days', 'Lo-fi Study', 'Cinematic Rise', 'Acoustic Walk', 'Neon Drive'][i]! : ['Whoosh fast', 'Soft click', 'Pop', 'Applause short', 'Notification ding', 'Camera shutter'][i]!;
    const creator = creators[i % creators.length]!;
    return {
      provider: active,
      id: String(1000 + i),
      kind: k,
      title,
      creator,
      creatorUrl: null,
      pageUrl: `https://example.com/media/${1000 + i}`,
      thumbUrl: visual ? pics[i % pics.length]! : null,
      previewUrl: k === 'video' ? ['/landing/kinetic.mp4', '/landing/showcase.mp4', '/landing/compare.mp4'][i % 3]! : null,
      width: visual ? 1080 : null,
      height: visual ? 1350 : null,
      durationS: k === 'photo' ? null : k === 'sound' ? 1 + i * 0.6 : k === 'video' ? 8 + i * 3 : 95 + i * 21,
      license,
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      credit: license === 'by' ? `“${title}” by ${creator}, CC BY 4.0` : null,
      source: active === 'openverse' ? (k === 'photo' ? 'wikimedia' : 'freesound') : null,
    };
  });
  return { items, page: 1, hasMore: false, provider: active, providers };
}
