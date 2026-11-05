import { AppError } from '../../utils';

const BASE = 'https://api.elevenlabs.io';

async function call(apiKey: string, path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('xi-api-key', apiKey);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, ...(body !== undefined ? { body } : {}) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text) as { detail?: { message?: string; status?: string } | string };
      message = typeof parsed.detail === 'string' ? parsed.detail : (parsed.detail?.message ?? text);
    } catch {
      // keep raw text
    }
    if (res.status === 401) throw new AppError('provider_auth', 'The ElevenLabs API key was rejected. Check Settings → Providers.', 401);
    if (res.status === 429) throw new AppError('provider_rate_limited', 'ElevenLabs is busy or your quota is used up. Try again shortly.', 429);
    throw new AppError('provider_error', `ElevenLabs error (${res.status}): ${message.slice(0, 300)}`, res.status < 500 ? 422 : 502);
  }
  return res;
}

const buffer = async (res: Response) => Buffer.from(await res.arrayBuffer());

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export async function elevenTts(
  apiKey: string,
  voiceId: string,
  body: Record<string, unknown>,
  opts: { withTimestamps?: boolean; outputFormat?: string } = {},
): Promise<{ audio: Buffer; alignment: Alignment | null }> {
  const format = opts.outputFormat ?? 'mp3_44100_128';
  if (opts.withTimestamps) {
    const res = await call(apiKey, `/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${format}`, { method: 'POST', json: body });
    const json = (await res.json()) as { audio_base64: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };
    return { audio: Buffer.from(json.audio_base64, 'base64'), alignment: json.alignment ?? json.normalized_alignment ?? null };
  }
  const res = await call(apiKey, `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${format}`, { method: 'POST', json: body });
  return { audio: await buffer(res), alignment: null };
}

/** Word timings from character alignment, for captions. */
export function alignmentToWords(a: Alignment | null): { text: string; start: number; end: number }[] {
  if (!a) return [];
  const words: { text: string; start: number; end: number }[] = [];
  let current = '';
  let start = 0;
  let end = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) words.push({ text: current, start, end });
      current = '';
      return;
    }
    if (!current) start = a.character_start_times_seconds[i] ?? end;
    current += ch;
    end = a.character_end_times_seconds[i] ?? end;
  });
  if (current) words.push({ text: current, start, end });
  // Drop audio tags such as [excited] from captions.
  return words.filter((w) => !/^\[.*\]$/.test(w.text));
}

export async function elevenDialogue(apiKey: string, inputs: { text: string; voice_id: string }[], modelId = 'eleven_v3'): Promise<Buffer> {
  const res = await call(apiKey, '/v1/text-to-dialogue?output_format=mp3_44100_128', { method: 'POST', json: { inputs, model_id: modelId } });
  return buffer(res);
}

export async function elevenSts(apiKey: string, voiceId: string, audio: Blob, fields: Record<string, string>): Promise<Buffer> {
  const form = new FormData();
  form.set('audio', audio, 'input.mp3');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await call(apiKey, `/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method: 'POST', body: form });
  return buffer(res);
}

export async function elevenMusic(apiKey: string, body: Record<string, unknown>): Promise<Buffer> {
  const res = await call(apiKey, '/v1/music?output_format=mp3_44100_128', { method: 'POST', json: body });
  return buffer(res);
}

export async function elevenSfx(apiKey: string, body: Record<string, unknown>): Promise<Buffer> {
  const res = await call(apiKey, '/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', json: body });
  return buffer(res);
}

export async function elevenIsolate(apiKey: string, audio: Blob): Promise<Buffer> {
  const form = new FormData();
  form.set('audio', audio, 'input.mp3');
  const res = await call(apiKey, '/v1/audio-isolation', { method: 'POST', body: form });
  return buffer(res);
}

export interface ElevenTranscript {
  text: string;
  language_code?: string;
  words: { text: string; start: number; end: number; type: 'word' | 'spacing' | 'audio_event'; speaker_id?: string }[];
}

export async function elevenTranscribe(apiKey: string, input: { file?: Blob; cloudUrl?: string }, fields: Record<string, string>): Promise<ElevenTranscript> {
  const form = new FormData();
  if (input.file) form.set('file', input.file, 'audio.mp3');
  else if (input.cloudUrl) form.set('cloud_storage_url', input.cloudUrl);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await call(apiKey, '/v1/speech-to-text', { method: 'POST', body: form });
  return (await res.json()) as ElevenTranscript;
}

export interface ElevenVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

export async function elevenVoices(apiKey: string, search?: string): Promise<ElevenVoice[]> {
  const out: ElevenVoice[] = [];
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ page_size: '100', ...(search ? { search } : {}), ...(token ? { next_page_token: token } : {}) });
    const res = await call(apiKey, `/v2/voices?${qs}`);
    const json = (await res.json()) as { voices: ElevenVoice[]; has_more?: boolean; next_page_token?: string | null };
    out.push(...json.voices);
    if (!json.has_more || !json.next_page_token) break;
    token = json.next_page_token;
  }
  return out;
}

export async function elevenSharedVoices(apiKey: string, search: string, opts: { gender?: string; language?: string } = {}): Promise<(ElevenVoice & { public_owner_id: string })[]> {
  const qs = new URLSearchParams({ page_size: '40', search, ...(opts.gender ? { gender: opts.gender } : {}), ...(opts.language ? { language: opts.language } : {}) });
  const res = await call(apiKey, `/v1/shared-voices?${qs}`);
  const json = (await res.json()) as { voices: (ElevenVoice & { public_owner_id: string })[] };
  return json.voices;
}

export async function elevenAddSharedVoice(apiKey: string, publicOwnerId: string, voiceId: string, name: string): Promise<string> {
  const res = await call(apiKey, `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`, { method: 'POST', json: { new_name: name } });
  return ((await res.json()) as { voice_id: string }).voice_id;
}

export async function elevenCloneVoice(apiKey: string, name: string, files: { data: Blob; filename: string }[], opts: { description?: string; removeNoise?: boolean } = {}): Promise<string> {
  const form = new FormData();
  form.set('name', name);
  for (const f of files) form.append('files', f.data, f.filename);
  if (opts.description) form.set('description', opts.description);
  form.set('remove_background_noise', String(opts.removeNoise ?? true));
  const res = await call(apiKey, '/v1/voices/add', { method: 'POST', body: form });
  return ((await res.json()) as { voice_id: string }).voice_id;
}

export async function elevenDeleteVoice(apiKey: string, voiceId: string) {
  await call(apiKey, `/v1/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
}

export async function elevenDubCreate(apiKey: string, input: { sourceUrl: string; targetLang: string; sourceLang?: string; name?: string }): Promise<{ id: string; expectedS: number }> {
  const form = new FormData();
  form.set('source_url', input.sourceUrl);
  form.set('target_lang', input.targetLang);
  form.set('source_lang', input.sourceLang ?? 'auto');
  form.set('num_speakers', '0');
  form.set('watermark', 'false');
  if (input.name) form.set('name', input.name);
  const res = await call(apiKey, '/v1/dubbing', { method: 'POST', body: form });
  const json = (await res.json()) as { dubbing_id: string; expected_duration_sec: number };
  return { id: json.dubbing_id, expectedS: json.expected_duration_sec };
}

export async function elevenDubStatus(apiKey: string, id: string): Promise<{ status: string; error?: string | null }> {
  const res = await call(apiKey, `/v1/dubbing/${encodeURIComponent(id)}`);
  const json = (await res.json()) as { status: string; error?: string | null };
  return json;
}

export async function elevenDubResult(apiKey: string, id: string, lang: string): Promise<Buffer> {
  return buffer(await call(apiKey, `/v1/dubbing/${encodeURIComponent(id)}/audio/${encodeURIComponent(lang)}`));
}

export async function elevenSubscription(apiKey: string): Promise<{ tier: string; characterCount: number; characterLimit: number; resetsAt: string | null }> {
  const res = await call(apiKey, '/v1/user/subscription');
  const json = (await res.json()) as { tier: string; character_count: number; character_limit: number; next_character_count_reset_unix?: number };
  return {
    tier: json.tier,
    characterCount: json.character_count,
    characterLimit: json.character_limit,
    resetsAt: json.next_character_count_reset_unix ? new Date(json.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}
