import * as z from 'zod';
import { SCRIPT_BEATS } from '../ai/llm';
import { capabilitySchema, genParamsSchema } from '../ai/models';
import { ASPECT_RATIOS, CONSENT_KINDS, OWNED_LICENSE_KINDS, SFX_CATEGORIES, SOCIAL_PLATFORMS } from '../constants';

const uuid = z.string().uuid();
const aspect = z.enum(ASPECT_RATIOS);

export const uploadCreateSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  type: z.string().max(120).default(''),
  projectId: uuid.nullish(),
  folderId: uuid.nullish(),
  /** Hex of the first bytes, checked against the claimed type. */
  head: z.string().regex(/^[0-9a-f]*$/i).max(64).optional(),
  source: z.enum(['upload', 'recording', 'derived', 'render']).default('upload'),
  /** Set when the file is an edited copy of another asset (shown as a version of it). */
  parentAssetId: uuid.optional(),
  isAiGenerated: z.boolean().optional(),
});
export type UploadCreate = z.infer<typeof uploadCreateSchema>;

export const uploadPartsSchema = z.object({
  assetId: uuid,
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
});

export const uploadCompleteSchema = z.object({
  assetId: uuid,
  parts: z.array(z.object({ PartNumber: z.number().int(), ETag: z.string() })).optional(),
});

export const assetPatchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(60).optional(),
  isFavorite: z.boolean().optional(),
  projectId: uuid.nullable().optional(),
  folderId: uuid.nullable().optional(),
  licenseId: uuid.nullable().optional(),
  role: z.enum(['voice', 'music', 'sfx', 'other']).optional(),
});

export const assetListSchema = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(['video', 'image', 'audio', 'model3d']).optional(),
  projectId: uuid.optional(),
  folderId: uuid.optional(),
  tag: z.string().max(60).optional(),
  favorite: z.coerce.boolean().optional(),
  trash: z.coerce.boolean().optional(),
  source: z.string().optional(),
  role: z.enum(['voice', 'music', 'sfx', 'other']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  cursor: z.string().optional(),
  semantic: z.coerce.boolean().optional(),
  /** Comma-separated ids: fetches exactly these files (fresh signed URLs for an open edit). */
  ids: z
    .string()
    .max(8000)
    .transform((v) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(uuid).max(200))
    .optional(),
});

export const estimateSchema = z.object({
  modelId: z.string(),
  params: genParamsSchema.partial().default({}),
  variants: z.number().int().min(1).max(10).default(1),
});

export const generationCreateSchema = z.object({
  capability: capabilitySchema,
  modelId: z.string(),
  params: genParamsSchema.partial().default({}),
  variants: z.number().int().min(1).max(4).default(1),
  projectId: uuid.nullish(),
  /** The total the user saw; the request fails if the fresh estimate is higher. */
  confirmCostUsd: z.number().min(0),
  sourceRef: z.record(z.string(), z.unknown()).optional(),
  consentId: uuid.optional(),
});
export type GenerationCreate = z.infer<typeof generationCreateSchema>;

export const consentCreateSchema = z.object({
  kind: z.enum(CONSENT_KINDS),
  subjectName: z.string().trim().min(1).max(120),
  isSelf: z.boolean(),
  /** The person ticked the box next to the statement. */
  accepted: z.literal(true),
  evidenceAssetId: uuid.optional(),
});

export const enhancePromptRequestSchema = z.object({
  idea: z.string().min(2).max(4000),
  mode: z.enum(['cinematic', 'ad']).default('ad'),
  platform: z.string().max(40).optional(),
  aspect: aspect.optional(),
  durationS: z.number().min(1).max(120).optional(),
  brandKitId: uuid.optional(),
  productId: uuid.optional(),
  /** The prompt this one improves, for history. */
  parentId: uuid.optional(),
  save: z.boolean().default(true),
});

export const scriptBriefSchema = z.object({
  format: z.enum(['ad', 'dialogue']).default('ad'),
  product: z.string().max(4000).default(''),
  productId: uuid.optional(),
  audience: z.string().max(1000).default(''),
  goal: z.string().max(500).default('Drive purchases'),
  tone: z.string().max(200).default('Confident, friendly, direct'),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest', 'meta']).default('tiktok'),
  durationS: z.number().int().min(5).max(180).default(30),
  language: z.string().max(12).default('en'),
  characterIds: z.array(uuid).max(6).default([]),
  angle: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type ScriptBrief = z.infer<typeof scriptBriefSchema>;

export const scriptGenerateSchema = z.object({
  brief: scriptBriefSchema,
  projectId: uuid.nullish(),
  title: z.string().max(200).optional(),
});

/** Either an AI-written script from a brief, or an empty one to write by hand. */
export const scriptCreateSchema = z.discriminatedUnion('mode', [
  scriptGenerateSchema.extend({ mode: z.literal('generate') }),
  z.object({
    mode: z.literal('blank'),
    title: z.string().min(1).max(200).default('Untitled script'),
    format: z.enum(['ad', 'dialogue']).default('ad'),
    language: z.string().max(12).default('en'),
    projectId: uuid.nullish(),
  }),
]);

/** A script line as stored and edited (AI drafts plus the per-line voice settings). */
export const scriptLineEditSchema = z.object({
  id: z.string().min(1).max(64),
  speaker: z.string().max(80).nullable().default(null),
  text: z.string().max(2000).default(''),
  emotion: z.string().max(80).nullable().default(null),
  onScreenText: z.string().max(300).nullable().default(null),
  visual: z.string().max(2000).default(''),
  shotType: z.string().max(80).default('medium'),
  camera: z.string().max(80).default('static'),
  durationS: z.number().min(0.5).max(60).default(3),
  beat: z.enum(SCRIPT_BEATS).default('other'),
  useRealFootage: z.boolean().default(false),
  characterId: uuid.nullish(),
  /** ElevenLabs voice id; falls back to the character's voice. */
  voiceId: z.string().max(64).nullish(),
  /** 0.5–2.0 speaking speed. */
  pace: z.number().min(0.5).max(2).nullish(),
  /** The storyboard still picked for this line (else the newest generated frame). */
  frameAssetId: uuid.nullish(),
  /** The voice take picked for this line (else the newest one). */
  voiceAssetId: uuid.nullish(),
});
export type ScriptLine = z.infer<typeof scriptLineEditSchema>;

export const scriptUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  lines: z.array(scriptLineEditSchema).max(80).optional(),
  captions: z.string().max(2200).nullable().optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  status: z.enum(['draft', 'final']).optional(),
  language: z.string().max(12).optional(),
  projectId: uuid.nullable().optional(),
});

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a #RRGGBB colour');

export const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

export const brandKitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean().optional(),
  /** Named colours; "primary", "accent", "ink" and "paper" drive templates and captions. */
  colors: z.array(z.object({ name: z.string().trim().max(40), hex: hexColor })).max(12).default([]),
  fonts: z.object({ display: z.string().max(80).optional(), body: z.string().max(80).optional() }).default({}),
  tone: z.string().max(500).nullable().optional(),
  logoAssetId: uuid.nullable().optional(),
  introAssetId: uuid.nullable().optional(),
  outroAssetId: uuid.nullable().optional(),
  watermarkAssetId: uuid.nullable().optional(),
  watermark: z.object({ position: z.enum(WATERMARK_POSITIONS), opacity: z.number().min(0.1).max(1), scale: z.number().min(0.04).max(0.4) }).optional(),
  captionStyleId: z.string().max(60).nullable().optional(),
});
export type BrandKitInput = z.infer<typeof brandKitSchema>;

export const characterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).nullable().optional(),
  voiceId: uuid.nullable().optional(),
  defaultEmotion: z.string().max(40).default('neutral'),
  defaultPace: z.number().min(0.5).max(2).default(1),
  avatarAssetId: uuid.nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
});

export const timelineCreateSchema = z.object({
  name: z.string().min(1).max(200).default('Untitled edit'),
  aspect: aspect.default('9:16'),
  fps: z.number().int().min(12).max(60).default(30),
  templateId: z.string().max(80).optional(),
  projectId: uuid.nullish(),
  scriptId: uuid.optional(),
  productId: uuid.optional(),
  brandKitId: uuid.optional(),
  assetIds: z.array(uuid).max(50).optional(),
  /** A whole timeline document, for "save as a copy" from the editor. */
  data: z.unknown().optional(),
  /** Starts the edit with one motion-graphics template. */
  motion: z
    .object({
      templateId: z.string().min(1).max(60),
      props: z.record(z.string(), z.unknown()).default({}),
      durationS: z.number().min(0.5).max(120).optional(),
    })
    .optional(),
  /** Canvas color behind everything, as #rrggbb, or transparent for overlay exports. */
  background: z.union([z.literal('transparent'), z.string().regex(/^#[0-9a-f]{6}$/i)]).optional(),
});
export type TimelineCreate = z.infer<typeof timelineCreateSchema>;

export const timelineSaveSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  data: z.unknown().optional(),
  baseVersion: z.number().int().min(1),
  snapshotLabel: z.string().max(120).optional(),
});

export const renderCreateSchema = z.object({
  timelineId: uuid,
  presetId: z.string().max(40).default('source-1080'),
  name: z.string().max(200).optional(),
});

export const editAssistantSchema = z.object({
  timelineId: uuid,
  instruction: z.string().min(2).max(2000),
  data: z.unknown(),
  /** Where the editor's playhead is, so "here" and "this part" make sense. */
  playheadSeconds: z.number().min(0).optional(),
  /** Clips selected in the editor, so "this clip" makes sense. */
  selectedClipIds: z.array(z.string().max(80)).max(50).optional(),
});

export const postCreateSchema = z.object({
  assetId: uuid,
  title: z.string().max(200).nullish(),
  caption: z.string().max(5000).default(''),
  hashtags: z.array(z.string().max(80)).max(30).default([]),
  targets: z
    .array(
      z.object({
        socialAccountId: uuid,
        captionOverride: z.string().max(5000).nullish(),
        options: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(14),
  scheduledAt: z.string().datetime({ offset: true }).nullish(),
  aiLabel: z.boolean().default(false),
  rightsAcknowledged: z.literal(true, { message: 'Confirm you have the rights to publish this content.' }),
  abGroup: z.string().max(60).nullish(),
  abVariant: z.enum(['A', 'B', 'C', 'D']).nullish(),
  projectId: uuid.nullish(),
});
export type PostCreate = z.infer<typeof postCreateSchema>;

export const productImportSchema = z.object({ url: z.string().url().max(2000) });

export const cloneCreateSchema = z
  .object({
    name: z.string().min(1).max(200).default('Ad clone'),
    referenceAssetId: uuid.optional(),
    inspirationAdId: uuid.optional(),
    productId: uuid.optional(),
  })
  .refine((v) => v.referenceAssetId || v.inspirationAdId, { message: 'Pick a reference video or a saved ad.' });

export const VARIANT_DIMENSIONS = ['hook', 'cta', 'voice', 'music', 'caption_style', 'first_shot'] as const;
export const variantBatchCreateSchema = z.object({
  name: z.string().min(1).max(200).default('Variants'),
  sourceTimelineId: uuid,
  dimensions: z.array(z.enum(VARIANT_DIMENSIONS)).min(1).default(['hook', 'cta']),
  count: z.number().int().min(2).max(10).default(5),
  voiceIds: z.array(z.string()).max(10).optional(),
});

export const AD_OBJECTIVES = ['traffic', 'sales', 'engagement', 'awareness', 'leads', 'video_views'] as const;
export const AD_CTAS = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'ORDER_NOW', 'GET_OFFER', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'SUBSCRIBE', 'WATCH_MORE'] as const;

export const campaignCreateSchema = z.object({
  adAccountId: uuid,
  name: z.string().min(1).max(200),
  objective: z.enum(AD_OBJECTIVES).default('traffic'),
  dailyBudget: z.number().positive().max(100_000),
  countries: z.array(z.string().length(2)).min(1).max(25).default(['US']),
  ageMin: z.number().int().min(18).max(65).default(18),
  ageMax: z.number().int().min(18).max(65).default(65),
  landingUrl: z.string().url(),
  cta: z.enum(AD_CTAS).default('SHOP_NOW'),
  variantBatchId: uuid.optional(),
  ads: z
    .array(
      z.object({
        assetId: uuid,
        headline: z.string().max(255).default(''),
        primaryText: z.string().max(2200).default(''),
        variantLabel: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(10),
});
export type CampaignCreate = z.infer<typeof campaignCreateSchema>;

export const agentRunCreateSchema = z
  .object({
    goal: z.string().trim().min(5).max(2000),
    productUrl: z.string().url().optional(),
    productId: uuid.optional(),
    budgetUsd: z.number().min(1).max(10_000).default(25),
    platforms: z.array(z.enum(['meta', 'tiktok'])).min(1).max(2).default(['meta']),
    adAccountId: uuid.optional(),
    dailyAdBudget: z.number().positive().max(10_000).optional(),
    aspect: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16'),
    durationS: z.number().int().min(6).max(90).default(20),
    /** Text-to-video model for the shots; the recommended one when left out. */
    videoModelId: z.string().max(100).optional(),
    /** ElevenLabs voice id for the voice-over; a saved or natural premade voice when left out. */
    voiceId: z.string().max(100).optional(),
    style: z.enum(['ugc', 'polished']).default('ugc'),
    countries: z.array(z.string().length(2)).min(1).max(25).default(['US']),
    landingUrl: z.string().url().optional(),
    /** Steps estimated at or under this amount run without asking. Launching ads always asks. */
    autoApproveUnderUsd: z.number().min(0).max(25).default(0),
    /** False creates the run and waits for approval before the research step too. */
    start: z.boolean().default(true),
  })
  .refine((v) => v.productUrl || v.productId, { message: 'Add a product URL or pick an imported product.' });

export const agentDecisionSchema = z.object({
  /**
   * approve: run the current step with the edits. reject: redo a finished step (the previous one
   * by default) with the note as feedback. reopen: go back to a finished or skipped step's approval
   * gate without running it. skip: finish the run here. cancel: stop the run.
   */
  decision: z.enum(['approve', 'reject', 'reopen', 'skip', 'cancel']),
  step: z.enum(['research', 'script', 'generate', 'launch', 'optimize']).optional(),
  edits: z.record(z.string(), z.unknown()).optional(),
  note: z.string().max(2000).optional(),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(['read', 'write', 'generate', 'publish', 'ads'])).min(1).default(['read', 'write']),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
});

export const shareCreateSchema = z
  .object({
    assetId: uuid.optional(),
    projectId: uuid.optional(),
    expiresInDays: z.number().int().min(1).max(365).nullish(),
    password: z.string().min(4).max(128).nullish(),
    allowDownload: z.boolean().default(false),
  })
  .refine((v) => !!v.assetId !== !!v.projectId, { message: 'Share either an asset or a project.' });

export const inspirationCreateSchema = z.object({
  brand: z.string().min(1).max(200),
  platform: z.enum(['meta', 'tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'pinterest', 'other']).default('other'),
  sourceUrl: z.string().url().max(2000).nullish(),
  assetId: uuid.nullish(),
  headline: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  cta: z.string().max(120).nullish(),
  tags: z.array(z.string().max(60)).max(30).default([]),
  notes: z.string().max(5000).nullish(),
  competitorId: uuid.nullish(),
});

export const competitorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().max(500).nullish(),
  metaPageId: z.string().max(40).nullish(),
  tiktokHandle: z.string().max(60).nullish(),
  countries: z.array(z.string().length(2)).max(30).default(['DE', 'FR', 'IE']),
  notes: z.string().max(2000).nullish(),
});

export const socialPlatformSchema = z.enum(SOCIAL_PLATFORMS);

/* ------------------------------ Music and SFX ------------------------------ */

/** Rights for music or a sound effect someone brings in. Exports refuse audio without commercial rights. */
export const licenseInputSchema = z.object({
  kind: z.enum(OWNED_LICENSE_KINDS),
  commercialUse: z.boolean(),
  /** Where it came from: a library name, a composer, a store. */
  source: z.string().trim().max(300).nullish(),
  termsUrl: z.string().url().max(1000).nullish(),
  notes: z.string().max(2000).nullish(),
  expiresAt: z.string().datetime().nullish(),
  /** A receipt or license file saved in the library. */
  proofAssetId: z.string().uuid().nullish(),
});
export type LicenseInput = z.infer<typeof licenseInputSchema>;

const trackTitle = z.string().trim().min(1).max(120);
const shortLabel = z.string().trim().max(40);

/** Adds an uploaded track to the music library. Without a license on file it must come with one. */
export const musicAddSchema = z.object({
  assetId: z.string().uuid(),
  title: trackTitle.optional(),
  genre: shortLabel.nullish(),
  mood: shortLabel.nullish(),
  isAudioLogo: z.boolean().default(false),
  license: licenseInputSchema.optional(),
});
export type MusicAdd = z.infer<typeof musicAddSchema>;

export const musicUpdateSchema = z.object({
  title: trackTitle.optional(),
  genre: shortLabel.nullish(),
  mood: shortLabel.nullish(),
  isAudioLogo: z.boolean().optional(),
  musicalKey: z.string().trim().max(12).nullish(),
  bpm: z.number().min(30).max(300).nullish(),
  lyrics: z.string().max(5000).nullish(),
});

export const sfxAddSchema = z.discriminatedUnion('mode', [
  /** Copies a built-in effect into the library so edits can use it. */
  z.object({ mode: z.literal('builtin'), builtinId: z.string().min(1).max(60) }),
  /** Files a library upload as a sound effect. */
  z.object({
    mode: z.literal('asset'),
    assetId: z.string().uuid(),
    name: z.string().trim().min(1).max(80).optional(),
    category: z.enum(SFX_CATEGORIES).default('foley'),
    tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
    license: licenseInputSchema.optional(),
  }),
]);

export const sfxUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  category: z.enum(SFX_CATEGORIES).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
});
