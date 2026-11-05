import OpenAI, { toFile } from 'openai';
import { llmCost } from '../../ai/llm';

const clients = new Map<string, OpenAI>();
function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, maxRetries: 3 });
    clients.set(apiKey, c);
  }
  return c;
}

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export async function embed(apiKey: string, input: string[]): Promise<{ vectors: number[][]; costUsd: number }> {
  const res = await client(apiKey).embeddings.create({ model: EMBEDDING_MODEL, input: input.map((s) => s.slice(0, 24_000)), dimensions: EMBEDDING_DIMS });
  return {
    vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
    costUsd: llmCost(EMBEDDING_MODEL, { input_tokens: res.usage.prompt_tokens }),
  };
}

export const toPgVector = (v: number[]) => `[${v.map((x) => Number(x.toFixed(7))).join(',')}]`;

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export async function moderate(apiKey: string, text: string, imageUrls: string[] = []): Promise<ModerationResult> {
  const input: OpenAI.Moderations.ModerationMultiModalInput[] = [{ type: 'text', text: text.slice(0, 10_000) }, ...imageUrls.slice(0, 1).map((url) => ({ type: 'image_url' as const, image_url: { url } }))];
  const res = await client(apiKey).moderations.create({ model: 'omni-moderation-latest', input });
  const categories = new Set<string>();
  let flagged = false;
  for (const r of res.results) {
    if (r.flagged) flagged = true;
    for (const [k, v] of Object.entries(r.categories)) if (v) categories.add(k);
  }
  return { flagged, categories: [...categories] };
}

export interface TranscriptResult {
  text: string;
  language: string | null;
  words: { text: string; start: number; end: number; speaker?: string }[];
  segments: { text: string; start: number; end: number; speaker?: string }[];
  durationS: number | null;
}

export async function transcribeWhisper(apiKey: string, file: Buffer, filename: string, language?: string): Promise<TranscriptResult> {
  const res = (await client(apiKey).audio.transcriptions.create({
    file: await toFile(file, filename),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
    ...(language ? { language } : {}),
  })) as unknown as {
    text: string;
    language?: string;
    duration?: number;
    words?: { word: string; start: number; end: number }[];
    segments?: { text: string; start: number; end: number }[];
  };
  return {
    text: res.text,
    language: res.language ?? null,
    durationS: res.duration ?? null,
    words: (res.words ?? []).map((w) => ({ text: w.word, start: w.start, end: w.end })),
    segments: (res.segments ?? []).map((s) => ({ text: s.text.trim(), start: s.start, end: s.end })),
  };
}
