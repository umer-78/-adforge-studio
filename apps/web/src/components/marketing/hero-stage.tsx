'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, type CSSProperties } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { LoopVideo } from './loop-video';

gsap.registerPlugin(ScrollTrigger);

export interface HeroFrame {
  src: string;
  poster: string;
  label: string;
  side?: 'left' | 'right';
}

/**
 * Three phone frames in perspective. They lean toward the pointer, and as the hero scrolls away the
 * camera flies in: the stage flattens, grows and the side frames spread apart.
 */
export function HeroStage({ frames }: { frames: HeroFrame[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    const inner = tilt.current;
    if (!el || !inner || prefersReducedMotion()) return;
    const hero = el.closest('section') ?? el;
    const ctx = gsap.context(() => {
      gsap.to(el, { '--p': 1, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 } });
    });
    if (!window.matchMedia('(pointer: fine)').matches) return () => ctx.revert();
    const rx = gsap.quickTo(inner, 'rotationX', { duration: 0.9, ease: 'power3.out' });
    const ry = gsap.quickTo(inner, 'rotationY', { duration: 0.9, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      ry((e.clientX / window.innerWidth - 0.5) * 12);
      rx((0.5 - e.clientY / window.innerHeight) * 8);
    };
    const leave = () => {
      rx(0);
      ry(0);
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      ctx.revert();
      gsap.killTweensOf(inner);
    };
  }, []);

  return (
    <div ref={stage} className="hero-stage relative mx-auto h-[clamp(340px,58svh,600px)] w-full">
      <div ref={tilt} className="relative size-full [transform-style:preserve-3d]">
        <div className="hero-flight absolute inset-0">
          {frames.map((f, i) => (
            <div key={f.src} className="hero-frame" data-side={f.side}>
              <div className="frame-in" style={{ '--d': `${0.7 + (f.side ? 0.15 : 0) + i * 0.05}s` } as CSSProperties}>
                <div className="relative size-full overflow-hidden rounded-[clamp(18px,3cqh,30px)] border border-white/10 bg-black shadow-[0_40px_120px_-30px_rgba(124,92,255,0.5)]">
                  <LoopVideo src={f.src} poster={f.poster} label={f.label} priority={!f.side} className="absolute inset-0 size-full" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.1]" />
                  <div className="pointer-events-none absolute top-[2.2%] left-1/2 h-[1.4%] w-[26%] -translate-x-1/2 rounded-full bg-black/70 ring-1 ring-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
