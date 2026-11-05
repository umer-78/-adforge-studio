'use client';

import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WaveformData {
  durationS: number;
  peaks: number[];
}

const BARS = 160;
const PLAY_EVENT = 'af:audio-play';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The worker's peak file for an asset. Keyed by asset id because signed URLs change. */
export function useWaveform(assetId: string | undefined, url: string | null | undefined) {
  return useQuery({
    queryKey: ['waveform', assetId],
    enabled: !!assetId && !!url,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: async (): Promise<WaveformData | null> => {
      const res = await fetch(url!);
      if (!res.ok) return null;
      const data = (await res.json()) as Partial<WaveformData>;
      return Array.isArray(data.peaks) && data.peaks.length ? { durationS: Number(data.durationS) || 0, peaks: data.peaks.map((p) => Number(p) || 0) } : null;
    },
  });
}

/** Folds the peak list into a fixed number of bars, normalized so quiet tracks still read. */
function bars(peaks: number[]): number[] {
  const out: number[] = [];
  const step = peaks.length / BARS;
  for (let i = 0; i < BARS; i++) {
    let max = 0;
    for (let j = Math.floor(i * step); j < Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1) && j < peaks.length; j++) max = Math.max(max, peaks[j]!);
    out.push(max);
  }
  const top = Math.max(...out, 0.05);
  return out.map((v) => Math.max(0.04, v / top));
}

/**
 * A play button over the track's waveform: click or drag to seek. Beat times, when known,
 * show as markers. Starting one player pauses any other on the page.
 */
export function WaveformPlayer({
  assetId,
  src,
  waveformUrl,
  durationS,
  beats = [],
  className,
  height = 44,
}: {
  assetId: string;
  src: string | null | undefined;
  waveformUrl: string | null | undefined;
  durationS?: number | null;
  beats?: number[];
  className?: string;
  height?: number;
}) {
  const clipId = `played-${useId().replace(/:/g, '')}`;
  const audio = useRef<HTMLAudioElement>(null);
  const raf = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(durationS ?? 0);
  const wave = useWaveform(assetId, waveformUrl);
  const heights = useMemo(() => (wave.data ? bars(wave.data.peaks) : null), [wave.data]);
  const total = length || wave.data?.durationS || durationS || 0;
  const progress = total ? Math.min(1, time / total) : 0;

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<HTMLAudioElement>).detail !== audio.current) audio.current?.pause();
    };
    document.addEventListener(PLAY_EVENT, onOther);
    return () => {
      document.removeEventListener(PLAY_EVENT, onOther);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const tick = () => {
    if (audio.current) setTime(audio.current.currentTime);
    raf.current = requestAnimationFrame(tick);
  };

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  const seekTo = (e: PointerEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
    el.currentTime = t;
    setTime(t);
  };

  if (!src) return null;
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          document.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: audio.current }));
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(tick);
        }}
        onPause={() => {
          setPlaying(false);
          cancelAnimationFrame(raf.current);
        }}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
          cancelAnimationFrame(raf.current);
        }}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
      />
      <Button type="button" size="icon" variant={playing ? 'brand' : 'secondary'} className="size-9 shrink-0 rounded-full" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </Button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        className="relative min-w-0 flex-1 cursor-pointer touch-none select-none"
        style={{ height }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekTo(e)}
        onKeyDown={(e) => {
          const el = audio.current;
          if (!el) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggle();
          }
          if (e.key === 'ArrowRight') el.currentTime = Math.min(total, el.currentTime + 5);
          if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5);
          setTime(el.currentTime);
        }}
      >
        {heights ? (
          <svg viewBox={`0 0 ${BARS * 3} 100`} preserveAspectRatio="none" className="size-full" aria-hidden>
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={progress * BARS * 3} height="100" />
              </clipPath>
            </defs>
            {[false, true].map((played) => (
              <g key={String(played)} className={played ? 'fill-primary' : 'fill-muted-foreground/35'} clipPath={played ? `url(#${clipId})` : undefined}>
                {heights.map((h, i) => (
                  <rect key={i} x={i * 3} y={50 - h * 48} width="2" height={Math.max(2, h * 96)} rx="1" />
                ))}
              </g>
            ))}
            {total > 0 &&
              beats.map((b, i) => (
                <line key={i} x1={(b / total) * BARS * 3} x2={(b / total) * BARS * 3} y1="0" y2="100" className="stroke-amber-400/60" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
          </svg>
        ) : (
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {clock(time)} / {clock(total)}
      </span>
    </div>
  );
}
