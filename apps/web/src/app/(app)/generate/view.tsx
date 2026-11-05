'use client';

import { ArrowRightLeft, Expand, Gauge, Image as ImageIcon, MessageSquareText, Mic, Scissors, Type, UserRound, WandSparkles } from 'lucide-react';
import { GenerateStudio, type StudioMode } from '@/components/generate/generate-studio';

const MODES: StudioMode[] = [
  { capability: 't2v', label: 'Text to video', icon: Type },
  { capability: 'i2v', label: 'Image to video', icon: ImageIcon },
  { capability: 'first_last', label: 'First + last frame', icon: ArrowRightLeft },
  { capability: 'v2v', label: 'Restyle video', icon: WandSparkles },
  { capability: 'video_edit', label: 'Edit with words', icon: MessageSquareText },
  { capability: 'avatar', label: 'Talking presenter', icon: UserRound },
  { capability: 'lipsync', label: 'Lip-sync', icon: Mic },
  { capability: 'upscale_video', label: 'Upscale', icon: Expand },
  { capability: 'interpolate', label: 'Slow motion', icon: Gauge },
  { capability: 'remove_bg_video', label: 'Remove background', icon: Scissors },
];

export function GenerateView() {
  return <GenerateStudio modes={MODES} kind="video" />;
}

