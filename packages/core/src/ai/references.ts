/**
 * Reference tokens let a prompt point at attached files: @image1…@image8, @audio1…@audio3, @video1.
 * Agnes understands numbered placeholders; other models get plain words.
 */
export const REFERENCE_TOKEN = /@(image|audio|video)([1-9])\b/gi;

export type ReferenceStyle = 'agnes' | 'natural';

export function expandReferences(prompt: string, style: ReferenceStyle): string {
  return prompt.replace(REFERENCE_TOKEN, (_m, kind: string, n: string) => {
    const k = kind.toLowerCase();
    if (style === 'agnes') return k === 'image' ? `<Picture ${n}>` : k === 'audio' ? `<Audio ${n}>` : `<Video ${n}>`;
    return k === 'image' ? `reference image ${n}` : k === 'audio' ? `reference audio ${n}` : `reference video ${n}`;
  });
}

/** Tokens used in a prompt, e.g. to warn about @image3 when only two images are attached. */
export function usedReferences(prompt: string): { image: number[]; audio: number[]; video: number[] } {
  const out = { image: new Set<number>(), audio: new Set<number>(), video: new Set<number>() };
  for (const m of prompt.matchAll(REFERENCE_TOKEN)) out[m[1]!.toLowerCase() as 'image' | 'audio' | 'video'].add(Number(m[2]));
  return { image: [...out.image].sort(), audio: [...out.audio].sort(), video: [...out.video].sort() };
}
