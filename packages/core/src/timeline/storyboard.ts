import { ASPECT_SIZES, type AspectRatio } from '../constants';
import type { ScriptDraft } from '../ai/llm';
import { motionDefaults } from '../motion-templates';
import { estimateWordTimings } from './captions';
import { createTimeline, makeClip, makeTrack, makeTransition } from './ops';
import type { CaptionWord, TimelineData } from './schema';
import { DEFAULT_BRAND, type BrandStyle } from './templates';

export interface StoryboardSlot {
  clipId: string;
  key: string;
  lineIndex: number;
  prompt: string;
  durationS: number;
  useRealFootage: boolean;
  beat: string;
}

/** Recorded voice for one line; its length sets the shot length when longer. */
export interface StoryboardVoice {
  assetId: string;
  durationS: number;
  /** Word timings from the speech engine, relative to the audio start. */
  words?: CaptionWord[];
}

export interface Storyboard {
  timeline: TimelineData;
  slots: StoryboardSlot[];
  durationS: number;
}

/** Product shots fill these beats automatically when product images exist. */
const PRODUCT_BEATS = new Set(['solution', 'demo', 'offer', 'cta']);

/**
 * Turns a script into an editable timeline: one shot per line (empty slots carry the
 * generation prompt), on-screen text, word-timed captions for the voice-over and a CTA.
 */
export function storyboardFromScript(
  draft: ScriptDraft,
  opts: {
    aspect: AspectRatio;
    fps?: number;
    brand?: BrandStyle;
    productImageIds?: string[];
    logoAssetId?: string | null;
    /** Storyboard stills by line index. */
    frameAssetIds?: Record<number, string>;
    /** Voice-over clips by line index. */
    voices?: Record<number, StoryboardVoice>;
  },
): Storyboard {
  const fps = opts.fps ?? 30;
  const brand = opts.brand ?? DEFAULT_BRAND;
  const size = ASPECT_SIZES[opts.aspect];
  const tl = createTimeline({ fps, width: size.width, height: size.height, background: '#000000' });
  const text = makeTrack('text', 'On-screen text');
  const captions = makeTrack('text', 'Captions');
  const overlay = makeTrack('overlay', 'CTA');
  const video = makeTrack('video', 'Shots');
  const voiceTrack = makeTrack('audio', 'Voice-over');
  const words: CaptionWord[] = [];
  const slots: StoryboardSlot[] = [];
  const productImages = [...(opts.productImageIds ?? [])];
  let cursor = 0;
  let productIndex = 0;

  draft.lines.forEach((line, i) => {
    const voice = opts.voices?.[i];
    const seconds = Math.max(0.8, line.durationS, voice ? voice.durationS + 0.15 : 0);
    const duration = Math.max(Math.round(fps * 0.8), Math.round(seconds * fps));
    const useProduct = PRODUCT_BEATS.has(line.beat) && !line.useRealFootage && productImages.length > 0;
    const frame = opts.frameAssetIds?.[i];
    if (frame) {
      // A storyboard still stands in for the shot (slow push-in) until it is animated or replaced.
      video.clips.push(
        makeClip({
          type: 'image',
          assetId: frame,
          start: cursor,
          duration,
          name: `${line.beat}: frame ${i + 1}`,
          keyframes: { scale: [{ frame: 0, value: 1, easing: 'linear' }, { frame: duration, value: 1.08, easing: 'linear' }] },
          ...(i > 0 ? { transitionIn: makeTransition('crossfade', 8) } : {}),
        }),
      );
    } else if (useProduct) {
      const assetId = productImages[productIndex++ % productImages.length]!;
      video.clips.push(
        makeClip({
          type: 'image',
          assetId,
          start: cursor,
          duration,
          name: `${line.beat}: product`,
          transform: { scale: 1 },
          keyframes: { scale: [{ frame: 0, value: 1, easing: 'linear' }, { frame: duration, value: 1.1, easing: 'linear' }] },
          ...(i > 0 ? { transitionIn: makeTransition('crossfade', 8) } : {}),
        }),
      );
    } else {
      const key = `line-${i + 1}`;
      const clip = makeClip({
        type: 'video',
        assetId: null,
        start: cursor,
        duration,
        name: `${line.beat}: ${line.shotType}`,
        placeholder: {
          key,
          label: `${line.useRealFootage ? 'Film' : 'Generate'} · ${line.beat} · ${line.shotType}`.slice(0, 80),
          kind: 'media',
          prompt: `${line.visual}. ${line.shotType}, ${line.camera}.`,
        },
      });
      video.clips.push(clip);
      slots.push({ clipId: clip.id, key, lineIndex: i, prompt: `${line.visual}. ${line.shotType}, ${line.camera}.`, durationS: duration / fps, useRealFootage: line.useRealFootage, beat: line.beat });
    }
    if (line.onScreenText) {
      const hook = i === 0;
      text.clips.push(
        makeClip({
          type: 'text',
          text: line.onScreenText,
          start: cursor,
          duration,
          name: hook ? 'Hook' : `Text ${i + 1}`,
          style: hook
            ? { fontFamily: brand.displayFont, fontWeight: 800, fontSize: 84, uppercase: true, strokeColor: '#000000', strokeWidth: 8, shadowBlur: 0, highlightColor: brand.accent }
            : { fontFamily: brand.bodyFont, fontWeight: 700, fontSize: 56, backgroundColor: brand.primary, highlightColor: brand.accent },
          transform: { y: hook ? -0.28 : -0.32, width: 0.86 },
          animation: { in: hook ? 'pop' : 'slideUp', out: 'fade' },
        }),
      );
    }
    // Captions follow the voice-over: real word timings when the line is voiced, estimates otherwise.
    const startS = cursor / fps;
    const spoken = line.text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    if (voice) {
      voiceTrack.clips.push(makeClip({ type: 'audio', assetId: voice.assetId, start: cursor, duration: Math.min(duration, Math.max(1, Math.round(voice.durationS * fps))), name: `Line ${i + 1}${line.speaker ? ` · ${line.speaker}` : ''}`, audio: { role: 'voice' } }));
      if (voice.words?.length) words.push(...voice.words.map((w) => ({ ...w, start: w.start + startS, end: w.end + startS })));
      else if (spoken) words.push(...estimateWordTimings(spoken, voice.durationS, startS));
    } else if (spoken) {
      words.push(...estimateWordTimings(spoken, (duration / fps) * 0.95, startS));
    }
    cursor += duration;
  });

  if (words.length) {
    captions.clips.push(makeClip({ type: 'captions', start: 0, duration: cursor, words, styleId: 'pop', position: 'bottom', maxWordsPerLine: 4 }));
  }

  const ctaLen = Math.min(Math.round(fps * 2.5), cursor);
  if (draft.cta && ctaLen > 0) {
    overlay.clips.push(
      makeClip({
        type: 'motion',
        templateId: 'cta-button',
        props: { ...motionDefaults('cta-button'), text: draft.cta.slice(0, 40), color: brand.primary },
        start: cursor - ctaLen,
        duration: ctaLen,
        transform: { width: 1, height: 1 },
      }),
    );
  }

  const last = video.clips[video.clips.length - 1];
  if (last) last.transitionOut = makeTransition('fade', 10);
  tl.tracks = [overlay, captions, text, video, voiceTrack].filter((t) => t.clips.length);
  return { timeline: tl, slots, durationS: cursor / fps };
}
