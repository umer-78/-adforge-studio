import { Composition } from 'remotion';
import { createTimeline } from '@adforge/core';
import { calculateMotionMetadata, MotionTemplateComposition, type MotionCompositionProps } from './motion/MotionComposition';
import { calculateTimelineMetadata } from './timeline/metadata';
import { TimelineComposition, type TimelineCompositionProps } from './timeline/Timeline';

export const TIMELINE_COMPOSITION_ID = 'Timeline';
export const MOTION_COMPOSITION_ID = 'MotionTemplate';

const defaultTimeline: TimelineCompositionProps = { timeline: createTimeline(), assets: {} };
const defaultMotion: MotionCompositionProps = { templateId: 'kinetic-title', props: {}, background: '#0B0B12' };

export function RemotionRoot() {
  return (
    <>
      <Composition
        id={TIMELINE_COMPOSITION_ID}
        component={TimelineComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultTimeline}
        calculateMetadata={calculateTimelineMetadata}
      />
      <Composition
        id={MOTION_COMPOSITION_ID}
        component={MotionTemplateComposition}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultMotion}
        calculateMetadata={calculateMotionMetadata}
      />
    </>
  );
}
