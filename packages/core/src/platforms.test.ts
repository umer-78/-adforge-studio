import { describe, expect, it } from 'vitest';
import { composeCaption, validateCarousel, validateForPlatform } from './platforms';

const photo = { type: 'image', width: 1080, height: 1350, sizeBytes: 400_000 };
const clip = { type: 'video', width: 1080, height: 1920, durationS: 20, sizeBytes: 20_000_000 };
const messages = (issues: { message: string }[]) => issues.map((i) => i.message);

describe('platform rules', () => {
  it('checks caption length and required titles', () => {
    const long = validateForPlatform('x', clip, { caption: 'a'.repeat(300), hashtags: [] });
    expect(long.some((i) => i.level === 'error' && i.message.includes('allows 280'))).toBe(true);
    expect(messages(validateForPlatform('youtube', { ...clip, width: 1920, height: 1080 }, { caption: 'hi', hashtags: [] }))).toContain('YouTube needs a title.');
  });

  it('builds captions with hashtags and trims to the limit', () => {
    expect(composeCaption('Hello', ['#new', 'drop it'])).toBe('Hello\n\n#new #dropit');
    expect(composeCaption('abcdef', [], 3)).toBe('abc');
  });
});

describe('carousels', () => {
  it('passes a single file through', () => {
    expect(validateCarousel('youtube', [clip])).toEqual([]);
  });

  it('refuses networks that cannot post several files', () => {
    expect(messages(validateCarousel('youtube', [photo, photo]))[0]).toContain('cannot take a post with several files');
    expect(validateCarousel('tiktok', [photo, photo])[0]!.level).toBe('error');
  });

  it('enforces counts and kinds per network', () => {
    expect(validateCarousel('instagram', [photo, clip])).toEqual([{ level: 'warning', message: 'Instagram crops every file in a carousel to the shape of the first one.' }]);
    expect(messages(validateCarousel('x', [photo, photo, photo, photo, photo]))).toContain('X takes at most 4 files in one post; this one has 5.');
    expect(messages(validateCarousel('linkedin', [photo, clip]))).toContain('LinkedIn takes photos only in a post with several files.');
    expect(messages(validateCarousel('instagram', [photo, { ...clip, durationS: 75 }]))).toContain('File 2: Instagram takes videos up to 60s in a carousel.');
  });

  it('labels problems with each file', () => {
    const big = { ...photo, sizeBytes: 3 * 1024 ** 3 };
    expect(messages(validateCarousel('pinterest', [photo, big]))).toContain('File 2: File is too large for Pinterest.');
  });
});
