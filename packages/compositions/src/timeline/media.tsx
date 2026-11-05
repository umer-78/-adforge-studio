import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Audio, Freeze, Img, OffthreadVideo } from 'remotion';
import { buildTimeMap, needsTimeRemap, sourceSpan, sourceTimeAt, type AudioClip, type ImageClip, type ResolvedAsset, type Track, type VideoClip } from '@adforge/core';
import { useRenderEnv } from '../context';
import type { GlPassSpec } from '../effects/stack';
import { useGlEffects } from '../effects/useGl';
import { mediaLayout, type Rect } from '../layout';
import { clipVolume, type AudioMix } from './audio';
import { PlaceholderCard } from './Placeholder';

export interface MediaContentProps<C> {
  clip: C;
  frame: number;
  box: { width: number; height: number };
  gl: readonly GlPassSpec[];
  track: Track;
  mix: AudioMix;
  /** Extra frames shown after the clip end for a pair transition. */
  tail: number;
  /** Multiplier from transitions (audio crossfades). */
  transitionGain: number;
  audible: boolean;
}

const rectStyle = (r: Rect): CSSProperties => ({ position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height });

/** Positions media in its box honouring fit and crop; falls back to object-fit when the size is unknown. */
function Framed({ asset, clip, box, children }: { asset: ResolvedAsset; clip: VideoClip | ImageClip; box: { width: number; height: number }; children: (style: CSSProperties) => ReactNode }) {
  const layout = mediaLayout(box, asset, clip.transform.fit, clip.transform.crop);
  if (!layout) {
    return <>{children({ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: clip.transform.fit })}</>;
  }
  return (
    <div style={{ ...rectStyle(layout.frame), overflow: 'hidden' }}>
      {children({ ...rectStyle(layout.media), objectFit: 'fill', maxWidth: 'none' })}
    </div>
  );
}

function GlStack({ enabled, canvasRef, mediaStyle, children }: { enabled: boolean; canvasRef: React.RefObject<HTMLCanvasElement | null>; mediaStyle: CSSProperties; children: (hidden: boolean) => ReactNode }) {
  return (
    <>
      {children(enabled)}
      {enabled && <canvas ref={canvasRef} style={{ ...mediaStyle, objectFit: mediaStyle.objectFit ?? 'fill' }} />}
    </>
  );
}

export function VideoContent({ clip, frame, box, gl, track, mix, tail, transitionGain, audible }: MediaContentProps<VideoClip>) {
  const { assets, canvas, options, rendering } = useRenderEnv();
  const asset = clip.assetId ? assets[clip.assetId] : undefined;
  const fps = canvas.fps;
  const remap = needsTimeRemap(clip);
  const timeMap = useMemo(() => (clip.speedRamp.length ? buildTimeMap(clip, fps) : undefined), [clip, fps]);
  const { enabled, canvasRef, draw } = useGlEffects(gl);
  if (!asset || asset.type !== 'video') {
    if (!options.showPlaceholders) return null;
    return <PlaceholderCard label={clip.placeholder?.label ?? 'Video'} kind="video" u={canvas.u} missing={!!clip.assetId} />;
  }
  const override = options.audioOverrides[clip.id];
  const sourceEnd = clip.trimStart + sourceSpan(clip, fps);
  const tailHasMedia = !remap && sourceEnd + (tail / fps) * clip.speed <= (asset.durationS ?? Infinity) + 1e-3;
  const inTail = frame >= clip.duration;
  const freezeTail = tail > 0 && inTail && !tailHasMedia;
  const ownAudio = audible && !override && !remap && asset.hasAudio !== false && !clip.audio.muted && !freezeTail;
  const gain = ownAudio || override ? clipVolume(clip, asset, frame, fps, track.volume, mix, transitionGain) : 0;
  const volume = rendering ? gain : Math.min(1, gain);

  const video = (style: CSSProperties, hidden: boolean) => (
    <OffthreadVideo
      src={asset.src}
      muted={!ownAudio || volume <= 0}
      volume={ownAudio ? volume : 0}
      playbackRate={remap ? 1 : clip.speed}
      trimBefore={remap ? undefined : clip.trimStart * fps}
      crossOrigin={enabled ? 'anonymous' : undefined}
      onVideoFrame={enabled ? draw : undefined}
      pauseWhenBuffering
      style={{ ...style, opacity: hidden ? 0 : 1 }}
    />
  );

  const body = (
    <Framed asset={asset} clip={clip} box={box}>
      {(style) => (
        <GlStack enabled={enabled} canvasRef={canvasRef} mediaStyle={style}>
          {(hidden) =>
            remap ? (
              <Freeze frame={sourceTimeAt(clip, Math.min(frame, clip.duration - 1), fps, timeMap) * fps}>{video(style, hidden)}</Freeze>
            ) : (
              <Freeze frame={clip.duration - 1} active={freezeTail}>
                {video(style, hidden)}
              </Freeze>
            )
          }
        </GlStack>
      )}
    </Framed>
  );

  return (
    <>
      {body}
      {override && audible && frame < clip.duration && <Audio src={override} volume={volume} />}
    </>
  );
}

export function ImageContent({ clip, box, gl }: Pick<MediaContentProps<ImageClip>, 'clip' | 'box' | 'gl'>) {
  const { assets, canvas, options } = useRenderEnv();
  const asset = clip.assetId ? assets[clip.assetId] : undefined;
  const { enabled, canvasRef, draw } = useGlEffects(gl);
  if (!asset || asset.type !== 'image') {
    if (!options.showPlaceholders) return null;
    return <PlaceholderCard label={clip.placeholder?.label ?? 'Image'} kind="image" u={canvas.u} missing={!!clip.assetId} />;
  }
  return (
    <Framed asset={asset} clip={clip} box={box}>
      {(style) => (
        <GlStack enabled={enabled} canvasRef={canvasRef} mediaStyle={style}>
          {(hidden) => (
            <Img src={asset.src} crossOrigin={enabled ? 'anonymous' : undefined} onImageFrame={enabled ? draw : undefined} pauseWhenLoading style={{ ...style, opacity: hidden ? 0 : 1 }} />
          )}
        </GlStack>
      )}
    </Framed>
  );
}

/** Audio clips, and the audio of video clips on hidden tracks. */
export function AudioPlayback({ clip, frame, track, mix, audible }: { clip: AudioClip | VideoClip; frame: number; track: Track; mix: AudioMix; audible: boolean }) {
  const { assets, canvas, options, rendering } = useRenderEnv();
  const asset = clip.assetId ? assets[clip.assetId] : undefined;
  if (!audible || !asset || (asset.type !== 'audio' && asset.type !== 'video') || clip.audio.muted) return null;
  const override = options.audioOverrides[clip.id];
  if (!override && clip.type === 'video' && (needsTimeRemap(clip) || asset.hasAudio === false)) return null;
  const gain = clipVolume(clip, asset, frame, canvas.fps, track.volume, mix);
  const volume = rendering ? gain : Math.min(1, gain);
  if (override) return <Audio src={override} volume={volume} />;
  return <Audio src={asset.src} volume={volume} playbackRate={clip.speed} trimBefore={clip.trimStart * canvas.fps} pauseWhenBuffering />;
}
