'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { LOTTIE_DRAW_END, LOTTIE_ICONS, LOTTIE_LOOP_END, type LottieIconName } from './lottie-icons';

type Player = {
  playSegments: (segments: [number, number] | [number, number][], forceFlag?: boolean) => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
  pause: () => void;
  play: () => void;
  destroy: () => void;
  loop: boolean | number;
  addEventListener: (name: 'complete', cb: () => void) => void;
};

/**
 * An animated line icon. Draws itself in when it scrolls into view, idles on a loop while visible,
 * replays on hover, and shows the finished drawing for people who prefer reduced motion.
 * The player (the light SVG build, no eval) loads only when an icon is first on screen.
 */
export function LottieIcon({ name, className, label }: { name: LottieIconName; className?: string; label?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let player: Player | null = null;
    let disposed = false;
    let drawn = false;
    let visible = false;

    const idle = () => {
      if (!player || !visible) return;
      player.loop = true;
      player.playSegments([LOTTIE_DRAW_END, LOTTIE_LOOP_END], true);
    };
    const drawIn = () => {
      if (!player) return;
      player.loop = false;
      player.playSegments([0, LOTTIE_DRAW_END], true);
    };

    const load = async () => {
      const { default: lottie } = await import('lottie-web/build/player/esm/lottie_light.min.js');
      if (disposed) return;
      player = lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        // A fresh copy each time: the player rewrites shape data in place.
        animationData: JSON.parse(JSON.stringify(LOTTIE_ICONS[name])),
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false },
      }) as unknown as Player;
      player.addEventListener('complete', () => {
        drawn = true;
        idle();
      });
      if (reduce) player.goToAndStop(LOTTIE_DRAW_END, true);
      else if (visible) drawIn();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        if (!player) {
          if (visible) void load();
          return;
        }
        if (reduce) return;
        if (!visible) player.pause();
        else if (drawn) idle();
        else drawIn();
      },
      { rootMargin: '120px' },
    );
    io.observe(el);

    const replay = () => {
      if (!reduce && player) drawIn();
    };
    const card = el.closest<HTMLElement>('[data-lottie-hover]') ?? el;
    card.addEventListener('pointerenter', replay);

    return () => {
      disposed = true;
      io.disconnect();
      card.removeEventListener('pointerenter', replay);
      player?.destroy();
    };
  }, [name]);

  return <div ref={host} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn('size-10 text-primary [&_path]:stroke-current [&_path[fill]:not([fill=none])]:fill-current', className)} />;
}
