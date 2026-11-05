import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from 'remotion';
import { MOTION_TEMPLATES_BY_ID, type AssetMap } from '@adforge/core';
import { canvasFor, DEFAULT_RENDER_OPTIONS, RenderContext, type RenderEnv } from '../context';
import { motionFonts, useFonts } from '../fonts';
import { MotionView } from '.';

export interface MotionCompositionProps {
  templateId: string;
  props: Record<string, unknown>;
  assets?: AssetMap;
  /** CSS background behind overlay templates; transparent by default. */
  background?: string | null;
  durationInFrames?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/** Renders one motion template on its own: library previews, thumbnails and standalone exports. */
export function MotionTemplateComposition({ templateId, props, assets, background }: MotionCompositionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const resolved = useMemo(() => assets ?? {}, [assets]);
  const env = useMemo<RenderEnv>(() => ({ canvas: canvasFor(width, height, fps), assets: resolved, options: DEFAULT_RENDER_OPTIONS, rendering: false }), [width, height, fps, resolved]);
  const fonts = useMemo(() => motionFonts(templateId, props), [templateId, props]);
  useFonts(fonts);
  return (
    <AbsoluteFill style={{ background: background ?? 'transparent' }}>
      <RenderContext.Provider value={env}>
        <MotionView templateId={templateId} props={props} assets={resolved} frame={frame} duration={durationInFrames} fps={fps} u={env.canvas.u} width={width} height={height} />
      </RenderContext.Provider>
    </AbsoluteFill>
  );
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export const calculateMotionMetadata: CalculateMetadataFunction<MotionCompositionProps> = ({ props }) => {
  const def = MOTION_TEMPLATES_BY_ID[props.templateId];
  return {
    durationInFrames: Math.max(1, Math.round(props.durationInFrames ?? def?.durationInFrames ?? 90)),
    width: even(props.width ?? 1080),
    height: even(props.height ?? 1920),
  };
};
