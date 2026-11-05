import { createContext, useContext } from 'react';
import type { AssetMap, ResolvedAsset } from '@adforge/core';

export interface RenderOptions {
  /** Burn the "AI-generated" label in even when the timeline flag is off. */
  aiLabel: boolean;
  /** Draw cards for empty media slots (editor preview and template thumbnails). */
  showPlaceholders: boolean;
  /**
   * Processed audio per clip id, already trimmed, retimed and filtered by the
   * worker and aligned to the clip's start. The clip's own audio is muted.
   */
  audioOverrides: Record<string, string>;
  /** Track ids to play alone (editor solo buttons). Empty plays every track. */
  soloTrackIds: string[];
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  aiLabel: false,
  showPlaceholders: true,
  audioOverrides: {},
  soloTrackIds: [],
};

export interface Canvas {
  width: number;
  height: number;
  fps: number;
  /** Pixels per design unit: style sizes are authored for a 1080 px short side. */
  u: number;
}

export interface RenderEnv {
  canvas: Canvas;
  assets: AssetMap;
  options: RenderOptions;
  /** True while rendering a file; false in the editor player. */
  rendering: boolean;
}

export const RenderContext = createContext<RenderEnv | null>(null);

export function useRenderEnv(): RenderEnv {
  const env = useContext(RenderContext);
  if (!env) throw new Error('useRenderEnv must be used inside a timeline or motion composition');
  return env;
}

export function canvasFor(width: number, height: number, fps: number): Canvas {
  return { width, height, fps, u: Math.min(width, height) / 1080 };
}

export function useAsset(id: string | null | undefined): ResolvedAsset | null {
  const { assets } = useRenderEnv();
  return id ? (assets[id] ?? null) : null;
}
