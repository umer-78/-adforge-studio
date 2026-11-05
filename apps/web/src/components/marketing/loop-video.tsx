'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A short muted loop. Plays only while on screen, and stays on its poster frame for people who
 * ask the system to reduce motion. `priority` loads it up front and holds the preloader for it.
 */
export function LoopVideo({ src, poster, className, label, priority }: { src: string; poster: string; className?: string; label?: string; priority?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const sync = () => {
      if (visible && !reduce.matches) void video.play().catch(() => undefined);
      else video.pause();
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      sync();
    }, { threshold: 0.15 });
    io.observe(video);
    reduce.addEventListener('change', sync);
    return () => {
      io.disconnect();
      reduce.removeEventListener('change', sync);
    };
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload={priority ? 'auto' : 'metadata'}
      data-preload={priority || undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('object-cover', className)}
    />
  );
}
