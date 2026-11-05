import * as z from 'zod';

export const LLM_PRICING: Record<string, { inputPerM: number; outputPerM: number; cacheReadPerM?: number }> = {
  'claude-opus-5-5': { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2 },
  'claude-sonnet-5-5': { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2 },
  'claude-haiku-5-5': { inputPerM: 0.1, outputPerM: 0.5 },
  'text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0 },
};

export function llmCost(model: string, usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null }): number {
  const key = Object.keys(LLM_PRICING).find((k) => model.startsWith(k));
  const p = key ? LLM_PRICING[key]! : LLM_PRICING['claude-opus-5-5']!;
  const input = (usage.input_tokens ?? 0) * p.inputPerM;
  const cached = (usage.cache_read_input_tokens ?? 0) * (p.cacheReadPerM ?? p.inputPerM);
  const output = (usage.output_tokens ?? 0) * p.outputPerM;
  return (input + cached + output) / 1_000_000;
}

/** Typical cost of a structured LLM task, shown before running it. */
export function llmEstimate(model: string, inputTokens: number, outputTokens: number): number {
  return llmCost(model, { input_tokens: inputTokens, output_tokens: outputTokens });
}

export const LLM_TASKS = {
  enhancePrompt: { tier: 'fast', input: 1500, output: 1800 },
  writeScript: { tier: 'smart', input: 3000, output: 4000 },
  analyzeAsset: { tier: 'fast', input: 6000, output: 900 },
  scoreAd: { tier: 'smart', input: 9000, output: 2500 },
  extractProduct: { tier: 'fast', input: 9000, output: 2000 },
  analyzeAdStructure: { tier: 'smart', input: 12000, output: 3500 },
  planVariants: { tier: 'fast', input: 2500, output: 1500 },
  editPlan: { tier: 'smart', input: 4000, output: 2000 },
  research: { tier: 'smart', input: 8000, output: 4000 },
  optimize: { tier: 'smart', input: 6000, output: 2500 },
  captions: { tier: 'fast', input: 1500, output: 900 },
  reframe: { tier: 'fast', input: 8000, output: 800 },
  rewriteLine: { tier: 'fast', input: 2500, output: 500 },
  translateScript: { tier: 'fast', input: 3000, output: 3500 },
  socialCopy: { tier: 'fast', input: 2500, output: 1500 },
} as const;
export type LlmTask = keyof typeof LLM_TASKS;

// ---------- Structured output schemas (kept free of records and numeric bounds for structured outputs) ----------

export const enhancedPromptSchema = z.object({
  title: z.string().describe('Short name for this idea, max 6 words'),
  prompt: z.string().describe('The final, production-ready prompt'),
  negativePrompt: z.string().nullable(),
  style: z.object({
    look: z.string(),
    lighting: z.string(),
    camera: z.string(),
    lens: z.string(),
    colorGrade: z.string(),
    mood: z.string(),
  }),
  shotList: z.array(z.object({ shot: z.string(), camera: z.string(), durationS: z.number() })),
  hook: z.string().nullable().describe('Ad mode only: the first-second hook'),
  variations: z.array(z.string()).describe('Three alternative prompts with different angles'),
  recommendedCapability: z.enum(['t2v', 'i2v', 't2i']),
  notes: z.string().describe('Tips for getting the best result'),
});
export type EnhancedPrompt = z.infer<typeof enhancedPromptSchema>;

export const SCRIPT_BEATS = ['hook', 'problem', 'agitate', 'solution', 'demo', 'proof', 'offer', 'cta', 'other'] as const;

export const scriptLineSchema = z.object({
  speaker: z.string().nullable().describe('Character name, or null for narrator/voice-over'),
  text: z.string().describe('Spoken words. Eleven v3 audio tags like [excited] are allowed'),
  emotion: z.string().nullable(),
  onScreenText: z.string().nullable(),
  visual: z.string().describe('What we see: a shot description usable as a video generation prompt'),
  shotType: z.string().describe('e.g. close-up, medium, wide, POV, product macro, screen recording'),
  camera: z.string().describe('e.g. static, handheld, push-in, orbit, whip pan'),
  durationS: z.number(),
  beat: z.enum(SCRIPT_BEATS),
  useRealFootage: z.boolean().describe('True when real creator/product footage should be filmed instead of generated'),
});
export type ScriptLineDraft = z.infer<typeof scriptLineSchema>;

export const scriptDraftSchema = z.object({
  title: z.string(),
  angle: z.string(),
  hook: z.string(),
  lines: z.array(scriptLineSchema),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  musicMood: z.string(),
});
export type ScriptDraft = z.infer<typeof scriptDraftSchema>;

export const assetAnalysisSchema = z.object({
  caption: z.string().describe('One sentence describing the media'),
  tags: z.array(z.string()).describe('8-20 lowercase search tags'),
  objects: z.array(z.string()),
  colors: z.array(z.string()).describe('Dominant colors as #RRGGBB'),
  mood: z.string(),
  setting: z.string(),
  peopleCount: z.number(),
  textInFrame: z.string().nullable(),
  shotTypes: z.array(z.string()),
  isProductShot: z.boolean(),
  brandSafe: z.boolean(),
  safetyNotes: z.string().nullable(),
});
export type AssetAnalysis = z.infer<typeof assetAnalysisSchema>;

export const adScoreSchema = z.object({
  overall: z.number().describe('0-100'),
  scores: z.object({
    hook: z.number().describe('0-10'),
    clarity: z.number(),
    pacing: z.number(),
    branding: z.number(),
    cta: z.number(),
    platformFit: z.number(),
    emotion: z.number(),
  }),
  strengths: z.array(z.string()),
  issues: z.array(
    z.object({
      severity: z.enum(['high', 'medium', 'low']),
      atSeconds: z.number().nullable(),
      problem: z.string(),
      fix: z.string(),
    }),
  ),
  outlook: z.enum(['weak', 'average', 'strong']),
  outlookReason: z.string(),
  hookAlternatives: z.array(z.string()),
  captionSuggestion: z.string(),
});
export type AdScore = z.infer<typeof adScoreSchema>;

export const productExtractSchema = z.object({
  title: z.string(),
  brandName: z.string().nullable(),
  category: z.string(),
  description: z.string(),
  price: z.number().nullable(),
  currency: z.string().nullable().describe('ISO 4217 code'),
  benefits: z.array(z.string()),
  features: z.array(z.string()),
  audience: z.string(),
  painPoints: z.array(z.string()),
  usps: z.array(z.string()),
  offer: z.string().nullable(),
  ctaSuggestions: z.array(z.string()),
  hooks: z.array(z.string()),
  tone: z.string(),
  colors: z.array(z.string()).describe('Brand colors as #RRGGBB, most important first'),
  imageUrls: z.array(z.string()).describe('Best product image URLs from the candidates, best first'),
  logoUrl: z.string().nullable(),
});
export type ProductExtract = z.infer<typeof productExtractSchema>;

export const adStructureSchema = z.object({
  summary: z.string(),
  format: z.enum(['ugc', 'demo', 'testimonial', 'problem_solution', 'listicle', 'unboxing', 'before_after', 'comparison', 'founder_story', 'skit', 'motion_graphics', 'other']),
  hookType: z.string(),
  durationS: z.number(),
  cutsPerMinute: z.number(),
  musicMood: z.string(),
  hasVoiceover: z.boolean(),
  hasCaptions: z.boolean(),
  beats: z.array(
    z.object({
      startS: z.number(),
      endS: z.number(),
      role: z.enum(SCRIPT_BEATS),
      description: z.string(),
      onScreenText: z.string().nullable(),
      voiceover: z.string().nullable(),
      shotType: z.string(),
      camera: z.string(),
      transition: z.string().nullable(),
    }),
  ),
  whyItWorks: z.array(z.string()),
  adaptationNotes: z.string(),
});
export type AdStructure = z.infer<typeof adStructureSchema>;

export const variantPlanSchema = z.object({
  variants: z.array(
    z.object({
      label: z.string(),
      hook: z.string().nullable(),
      cta: z.string().nullable(),
      voiceStyle: z.string().nullable(),
      captionStyleId: z.string().nullable(),
      musicMood: z.string().nullable(),
      firstShot: z.string().nullable(),
      hypothesis: z.string(),
    }),
  ),
});
export type VariantPlan = z.infer<typeof variantPlanSchema>;

export const researchBriefSchema = z.object({
  productSummary: z.string(),
  audiences: z.array(z.object({ name: z.string(), painPoints: z.array(z.string()), desires: z.array(z.string()), objections: z.array(z.string()) })),
  angles: z.array(z.object({ name: z.string(), hook: z.string(), why: z.string(), format: z.string() })),
  competitorInsights: z.array(z.string()),
  keyMessages: z.array(z.string()),
  complianceRisks: z.array(z.string()),
  recommendedPlatforms: z.array(z.enum(['meta', 'tiktok'])),
});
export type ResearchBrief = z.infer<typeof researchBriefSchema>;

export const optimizeReportSchema = z.object({
  summary: z.string(),
  winners: z.array(z.object({ adId: z.string(), reason: z.string() })),
  underperformers: z.array(z.object({ adId: z.string(), reason: z.string(), action: z.enum(['pause', 'keep', 'iterate']) })),
  nextTests: z.array(z.object({ hypothesis: z.string(), dimension: z.enum(['hook', 'cta', 'voice', 'music', 'caption_style', 'first_shot', 'offer']), change: z.string() })),
  budgetAdvice: z.string(),
});
export type OptimizeReport = z.infer<typeof optimizeReportSchema>;

export const socialCopySchema = z.object({
  title: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  altText: z.string(),
  platformCaptions: z.array(z.object({ platform: z.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'x', 'pinterest']), caption: z.string() })),
});
export type SocialCopy = z.infer<typeof socialCopySchema>;

export const inspirationAnalysisSchema = z.object({
  hook: z.string(),
  angle: z.string(),
  format: z.string(),
  structure: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  cta: z.string(),
  visualStyle: z.string(),
  whyItWorks: z.array(z.string()),
  weaknesses: z.array(z.string()),
  ideasForUs: z.array(z.string()),
});
export type InspirationAnalysis = z.infer<typeof inspirationAnalysisSchema>;

export const reframeSchema = z.object({
  samples: z.array(
    z.object({
      index: z.number().describe('Index of the frame as given'),
      cx: z.number().describe('Subject centre x, 0-1 from left'),
      cy: z.number().describe('Subject centre y, 0-1 from top'),
      confidence: z.number().describe('0-1'),
    }),
  ),
  subject: z.string(),
});
export type ReframeResult = z.infer<typeof reframeSchema>;
