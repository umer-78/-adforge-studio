import type { VARIANT_DIMENSIONS } from '@adforge/core';

export type Dimension = (typeof VARIANT_DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, { label: string; hint: string }> = {
  hook: { label: 'Hook', hint: 'First 3 seconds: line and on-screen text' },
  cta: { label: 'Call to action', hint: 'How the ad ends' },
  voice: { label: 'Voice', hint: 'Re-voiced with other voices' },
  music: { label: 'Music', hint: 'Another licensed track mood' },
  caption_style: { label: 'Captions', hint: 'Caption look and animation' },
  first_shot: { label: 'First shot', hint: 'The opening visual' },
};
