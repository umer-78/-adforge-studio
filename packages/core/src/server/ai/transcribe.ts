import { audioRates } from '../../ai/audio-models';
import { AppError } from '../../utils';
import { env } from '../env';
import { elevenTranscribe } from './elevenlabs';
import { providerKey } from './keys';
import { transcribeWhisper, type TranscriptResult } from './openai';

export type { TranscriptResult } from './openai';

export interface TranscribeInput {
  /** Audio, ideally mono 16 kHz MP3 extracted by the worker. Whisper accepts up to 25 MB. */
  audio: Buffer;
  filename?: string;
  durationS: number;
  language?: string;
  diarize?: boolean;
}

export interface TranscribeOutput extends TranscriptResult {
  provider: 'elevenlabs' | 'openai';
  model: string;
  costUsd: number;
}

const WHISPER_LIMIT = 25 * 1024 ** 2;

/** Word-level transcript from ElevenLabs Scribe when available, otherwise OpenAI Whisper. */
export async function transcribe(workspaceId: string | null, input: TranscribeInput): Promise<TranscribeOutput> {
  const preference = env().TRANSCRIBE_PROVIDER;
  const [eleven, openai] = await Promise.all([providerKey(workspaceId, 'elevenlabs'), providerKey(workspaceId, 'openai')]);
  const useEleven = preference === 'elevenlabs' ? !!eleven : preference === 'openai' ? !openai && !!eleven : !!eleven;
  const minutes = Math.max(input.durationS, 1) / 60;

  if (useEleven && eleven) {
    const fields: Record<string, string> = { model_id: 'scribe_v1', timestamps_granularity: 'word', tag_audio_events: 'false' };
    if (input.language) fields.language_code = input.language;
    if (input.diarize) fields.diarize = 'true';
    const res = await elevenTranscribe(eleven, { file: new Blob([new Uint8Array(input.audio)], { type: 'audio/mpeg' }) }, fields);
    const words = res.words.filter((w) => w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end, ...(w.speaker_id ? { speaker: w.speaker_id } : {}) }));
    return {
      text: res.text,
      language: res.language_code ?? null,
      words,
      segments: segmentsFromWords(words),
      durationS: input.durationS,
      provider: 'elevenlabs',
      model: 'scribe_v1',
      costUsd: minutes * audioRates.transcribePerMinute,
    };
  }

  if (openai) {
    if (input.audio.length > WHISPER_LIMIT) throw new AppError('audio_too_large', 'Audio is over 25 MB. Add an ElevenLabs key for long transcriptions.', 413);
    const res = await transcribeWhisper(openai, input.audio, input.filename ?? 'audio.mp3', input.language);
    return { ...res, provider: 'openai', model: 'whisper-1', costUsd: minutes * audioRates.openaiTranscribePerMinute };
  }

  throw new AppError('provider_not_configured', 'Add an ElevenLabs or OpenAI key in Settings → Providers to transcribe audio.', 501);
}

/** Groups words into sentence-like segments at punctuation, pauses and speaker changes. */
export function segmentsFromWords(words: { text: string; start: number; end: number; speaker?: string }[], maxS = 8, gapS = 0.7) {
  const segments: { text: string; start: number; end: number; speaker?: string }[] = [];
  let current: typeof words = [];
  const flush = () => {
    if (!current.length) return;
    segments.push({
      text: current.map((w) => w.text).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      ...(current[0]!.speaker ? { speaker: current[0]!.speaker } : {}),
    });
    current = [];
  };
  for (const w of words) {
    const prev = current[current.length - 1];
    if (prev && (w.start - prev.end > gapS || w.speaker !== prev.speaker || w.end - current[0]!.start > maxS)) flush();
    current.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  return segments;
}
