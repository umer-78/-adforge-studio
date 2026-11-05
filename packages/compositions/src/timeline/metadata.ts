import type { CalculateMetadataFunction } from 'remotion';
import { parseTimeline, timelineOps } from '@adforge/core';
import type { TimelineCompositionProps } from './Timeline';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Duration, fps and size come from the timeline document; `output` resizes the frame for exports. */
export const calculateTimelineMetadata: CalculateMetadataFunction<TimelineCompositionProps & { output?: { width: number; height: number } | null }> = ({ props }) => {
  const tl = parseTimeline(props.timeline);
  return {
    durationInFrames: timelineOps.timelineDuration(tl),
    fps: tl.fps,
    width: even(props.output?.width ?? tl.width),
    height: even(props.output?.height ?? tl.height),
  };
};
