import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod';
import { llmCost } from '../../ai/llm';
import { AppError } from '../../utils';
import { env } from '../env';

export type ImageInput = { url: string } | { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };

export interface StructuredRequest<T extends z.ZodType> {
  apiKey: string;
  schema: T;
  system: string;
  prompt: string;
  images?: { label?: string; image: ImageInput }[];
  tier?: 'smart' | 'fast';
  model?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  costUsd: number;
}

const clients = new Map<string, Anthropic>();
function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60 * 1000 });
    clients.set(apiKey, c);
  }
  return c;
}

export function modelForTier(tier: 'smart' | 'fast' = 'smart'): string {
  return tier === 'fast' ? env().LLM_FAST_MODEL : env().LLM_MODEL;
}

/**
 * Runs Claude with a structured output schema. Server-side fallbacks retry a
 * declined request on another model instead of returning a refusal.
 */
export async function structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
  const model = req.model ?? modelForTier(req.tier);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of req.images ?? []) {
    if (img.label) content.push({ type: 'text', text: img.label });
    content.push(
      'url' in img.image
        ? { type: 'image', source: { type: 'url', url: img.image.url } }
        : { type: 'image', source: { type: 'base64', media_type: img.image.mediaType, data: img.image.base64 } },
    );
  }
  content.push({ type: 'text', text: req.prompt });

  const useFallbacks = env().ANTHROPIC_SERVER_FALLBACKS;
  const run = (withFallbacks: boolean) =>
    client(req.apiKey).beta.messages.parse({
      model,
      max_tokens: req.maxTokens ?? 16_000,
      system: req.system,
      messages: [{ role: 'user', content }],
      output_config: { format: betaZodOutputFormat(req.schema), ...(req.effort ? { effort: req.effort } : {}) },
      ...(withFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });

  let message;
  try {
    message = await run(useFallbacks);
  } catch (err) {
    if (useFallbacks && err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) message = await run(false);
    else throw mapError(err);
  }

  if (message.stop_reason === 'refusal') throw new AppError('ai_refused', 'The AI declined this request. Try rephrasing it.', 422);
  if (message.stop_reason === 'max_tokens') throw new AppError('ai_truncated', 'The AI response was cut off. Try a shorter request.', 502);
  const data = message.parsed_output;
  if (data == null) throw new AppError('ai_bad_output', 'The AI returned an unexpected format. Please try again.', 502);
  const usage = {
    input_tokens: message.usage.input_tokens ?? 0,
    output_tokens: message.usage.output_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };
  return { data: data as z.infer<T>, model: message.model, usage, costUsd: llmCost(message.model, usage) };
}

function mapError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new AppError('provider_auth', 'The Claude API key was rejected. Check Settings → Providers.', 401);
  if (err instanceof Anthropic.RateLimitError) return new AppError('provider_rate_limited', 'Claude is rate limiting requests. Try again in a minute.', 429);
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return new AppError('provider_unavailable', 'Claude is temporarily unavailable. Try again shortly.', 503);
  return err instanceof Error ? err : new Error(String(err));
}
