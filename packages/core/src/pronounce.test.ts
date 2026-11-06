import { describe, expect, it } from 'vitest';
import { applyPronunciations, type Pronunciation } from './pronounce';

const rules: Pronunciation[] = [
  { word: 'AdForge', sayAs: 'Ad Forge', matchCase: false },
  { word: 'AdForge Pro', sayAs: 'Ad Forge Pro', matchCase: false },
  { word: 'SKU', sayAs: 'skew', matchCase: true },
  { word: 'C++', sayAs: 'C plus plus', matchCase: false },
];

describe('applyPronunciations', () => {
  it('replaces whole words, longest first, keeping audio tags', () => {
    expect(applyPronunciations('Try adforge pro today. [whispers] AdForge rocks', rules)).toBe('Try Ad Forge Pro today. [whispers] Ad Forge rocks');
    expect(applyPronunciations('[AdForge] stays a tag', rules)).toBe('[AdForge] stays a tag');
  });
  it('respects case and word edges', () => {
    expect(applyPronunciations('Each SKU ships, but skus and SKUs do not', rules)).toBe('Each skew ships, but skus and SKUs do not');
    expect(applyPronunciations('Learn C++ fast', rules)).toBe('Learn C plus plus fast');
    expect(applyPronunciations('AdForgery is a word', rules)).toBe('AdForgery is a word');
  });
  it('leaves text alone without rules', () => {
    expect(applyPronunciations('Hello', [])).toBe('Hello');
  });
});
