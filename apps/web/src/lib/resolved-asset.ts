import type { ResolvedAsset } from '@adforge/core';
import type { AssetView } from '@/lib/types';

/** What the compositions need from a library file. Videos play from the 720p proxy while editing. */
export function toResolvedAsset(a: AssetView): ResolvedAsset {
  return {
    id: a.id,
    type: a.type,
    src: (a.type === 'video' ? (a.proxyUrl ?? a.url) : a.url) ?? '',
    width: a.width,
    height: a.height,
    durationS: a.durationS,
    fps: a.fps,
    name: a.name,
    ...(a.role ? { role: a.role } : {}),
  };
}
