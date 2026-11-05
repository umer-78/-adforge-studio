import { useMemo, type ReactNode } from 'react';
import { AbsoluteFill, Sequence, getRemotionEnvironment, useVideoConfig } from 'remotion';
import { AI_LABEL_TEXT, parseTimeline, voiceRegions, type AssetMap, type TimelineDataInput, type Track } from '@adforge/core';
import { canvasFor, DEFAULT_RENDER_OPTIONS, RenderContext, type RenderEnv, type RenderOptions } from '../context';
import { timelineFonts, useFonts } from '../fonts';
import { fontStack } from '../text/style';
import { isVoiceClip, type AudioMix } from './audio';
import { ClipView } from './layers';
import { isPairTransition, tailFrames } from './transitions';

export interface TimelineCompositionProps {
  timeline: TimelineDataInput;
  assets: AssetMap;
  options?: Partial<RenderOptions>;
  [key: string]: unknown;
}

function TrackView({ track, mix, solo }: { track: Track; mix: AudioMix; solo: readonly string[] }) {
  const { fps } = useVideoConfig();
  const clips = useMemo(() => [...track.clips].sort((a, b) => a.start - b.start), [track.clips]);
  const audible = !track.muted && (solo.length === 0 || solo.includes(track.id));
  return (
    <>
      {clips.map((clip) => {
        const tail = tailFrames(track, clip);
        const prev = clips.find((c) => c.id !== clip.id && Math.abs(c.start + c.duration - clip.start) <= 1);
        const pairIn = !!prev && prev.type !== 'audio' && isPairTransition(clip.transitionIn);
        const media = clip.type === 'video' || clip.type === 'image' || clip.type === 'audio';
        const view = <ClipView clip={clip} track={track} tail={tail} pairIn={pairIn} mix={mix} audible={audible} visible={!track.hidden} />;
        if (clip.type === 'adjustment') {
          return (
            <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration} name={clip.name ?? 'Adjustment'} layout="none">
              {view}
            </Sequence>
          );
        }
        return (
          <Sequence key={clip.id} from={clip.start} durationInFrames={clip.duration + tail.frames} name={clip.name ?? clip.type} premountFor={media ? Math.round(fps) : 0}>
            {view}
          </Sequence>
        );
      })}
    </>
  );
}

/** Scales the timeline canvas into an output frame of another size, centred. */
function Fit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const out = useVideoConfig();
  if (out.width === width && out.height === height) return <>{children}</>;
  const k = Math.min(out.width / width, out.height / height);
  return (
    <div
      style={{
        position: 'absolute',
        left: (out.width - width * k) / 2,
        top: (out.height - height * k) / 2,
        width,
        height,
        transform: `scale(${k})`,
        transformOrigin: '0 0',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function AiLabel({ u }: { u: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 40 * u,
        top: 70 * u,
        padding: `${8 * u}px ${18 * u}px`,
        borderRadius: 999,
        background: 'rgba(11,11,18,0.62)',
        border: `${1.5 * u}px solid rgba(255,255,255,0.28)`,
        color: '#FFFFFF',
        fontFamily: fontStack('Geist'),
        fontWeight: 600,
        fontSize: 26 * u,
        letterSpacing: '0.02em',
      }}
    >
      {AI_LABEL_TEXT}
    </div>
  );
}

/** The editor and export composition: renders a timeline document with resolved assets. */
export function TimelineComposition({ timeline, assets, options }: TimelineCompositionProps) {
  const tl = useMemo(() => parseTimeline(timeline), [timeline]);
  const opts = useMemo(() => ({ ...DEFAULT_RENDER_OPTIONS, ...options }), [options]);
  const env = useMemo<RenderEnv>(
    () => ({ canvas: canvasFor(tl.width, tl.height, tl.fps), assets, options: opts, rendering: getRemotionEnvironment().isRendering }),
    [tl.width, tl.height, tl.fps, assets, opts],
  );
  const fonts = useMemo(() => timelineFonts(tl), [tl]);
  useFonts(fonts);
  const mix = useMemo<AudioMix>(() => {
    const voice = voiceRegions(tl.tracks, (clip) => isVoiceClip(clip, clip.type === 'audio' || clip.type === 'video' ? (clip.assetId ? assets[clip.assetId] : null) : null));
    return { masterVolume: tl.master.volume, duckAmount: tl.master.duckAmount, voice, rampFrames: Math.max(1, Math.round(tl.fps * 0.3)) };
  }, [tl, assets]);
  const ordered = useMemo(() => [...tl.tracks].reverse(), [tl.tracks]);

  return (
    <AbsoluteFill style={{ background: tl.background, overflow: 'hidden' }}>
      <Fit width={tl.width} height={tl.height}>
        <RenderContext.Provider value={env}>
          <AbsoluteFill style={{ background: tl.background }}>
            {ordered.map((track) => (
              <TrackView key={track.id} track={track} mix={mix} solo={opts.soloTrackIds} />
            ))}
            {(tl.aiLabel || opts.aiLabel) && <AiLabel u={env.canvas.u} />}
          </AbsoluteFill>
        </RenderContext.Provider>
      </Fit>
    </AbsoluteFill>
  );
}
