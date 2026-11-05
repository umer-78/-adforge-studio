import { PLATFORM_SPECS, SOCIAL_PLATFORMS, socialCopySchema, SYSTEM_PROMPTS } from '@adforge/core';
import * as z from 'zod';
import { owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd } from '@/lib/server/growth';
import { runLlm, workspaceBrandContext } from '@/lib/server/llm';
import { productFactsText } from '@/lib/server/products';

const body = z.object({
  assetId: z.string().uuid(),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).min(1).max(7),
  productId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  language: z.string().max(12).default('en'),
});

/** Writes the title, caption, hashtags and a caption per platform from what the video says and shows. */
export const POST = route({ body, scope: 'publish', limit: ['social-copy', 120, 3600] }, async ({ sb, caller, body: b }) => {
  const asset = await owned(sb, 'assets', b.assetId, caller, 'The media');
  await assertLlmReady(sb, caller, llmTaskUsd('socialCopy'), 'write captions');
  const [brand, product] = await Promise.all([workspaceBrandContext(sb, caller.workspaceId), b.productId ? productFactsText(sb, caller.workspaceId, b.productId) : '']);
  const limits = b.platforms.map((p) => `${PLATFORM_SPECS[p].label}: caption up to ${PLATFORM_SPECS[p].captionLimit} characters, ${PLATFORM_SPECS[p].hashtagLimit} hashtags at most${PLATFORM_SPECS[p].titleLimit ? `, title up to ${PLATFORM_SPECS[p].titleLimit}` : ''}`);
  return runLlm(sb, caller, {
    task: 'socialCopy',
    schema: socialCopySchema,
    system: SYSTEM_PROMPTS.socialCopy,
    prompt: [
      `Video: "${asset.name}". ${asset.duration_s ? `${Math.round(Number(asset.duration_s))}s long.` : ''}`,
      asset.ai_caption ? `What it shows: ${asset.ai_caption}` : '',
      asset.description ? `Description: ${asset.description}` : '',
      asset.transcript ? `What is said: ${asset.transcript.slice(0, 3000)}` : '',
      product ? `Product:\n${product}` : '',
      brand ? `Brand: ${brand.name}${brand.tone ? `, tone: ${brand.tone}` : ''}.` : '',
      `Platforms and limits:\n${limits.join('\n')}`,
      `Write in language: ${b.language}.`,
      b.notes ? `Notes from the user: ${b.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    meta: { assetId: asset.id },
  });
});
