'use client';

import { useEffect, useRef } from 'react';
import type { PlaybackView } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Plays HLS (self-hosted or Mux) with hls.js where the browser lacks native HLS, otherwise a file URL. */
export function VideoPlayer({ playback, src, poster, className, autoPlay, muted, loop, controls = true, onTime, videoRef }: {
  playback?: PlaybackView | null;
  src?: string | null;
  poster?: string | null;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onTime?: (t: number) => void;
  videoRef?: (el: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const url = playback?.src ?? src ?? null;
  const isHls = playback?.kind === 'hls' || playback?.kind === 'mux' || (url?.includes('.m3u8') ?? false);

  useEffect(() => {
    const video = ref.current;
    if (!video || !url) return;
    let destroy: (() => void) | undefined;
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      let cancelled = false;
      void import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          video.src = url;
          return;
        }
        const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20 });
        hls.loadSource(url);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      });
      return () => {
        cancelled = true;
        destroy?.();
      };
    }
    video.src = url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [url, isHls]);

  return (
    <video
      ref={(el) => {
        ref.current = el;
        videoRef?.(el);
      }}
      poster={playback?.poster ?? poster ?? undefined}
      className={cn('size-full bg-black object-contain', className)}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline
      preload="metadata"
      onTimeUpdate={onTime ? (e) => onTime(e.currentTarget.currentTime) : undefined}
    />
  );
}

export function AudioPlayer({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null;
  return <audio src={src} controls preload="none" className={cn('h-9 w-full', className)} />;
}
