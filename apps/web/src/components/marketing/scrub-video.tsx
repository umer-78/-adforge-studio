'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

gsap.registerPlugin(ScrollTrigger);

export interface ScrubStep {
  title: string;
  body: string;
}

/**
 * The video plays as you scroll: the section holds still while scroll position drives the frame,
 * and each step lights up as the ad reaches it. The file has a keyframe on every frame, so seeking
 * stays smooth. With reduced motion the steps are a plain list beside the poster frame.
 */
export function ScrubVideo({ src, poster, steps, label }: { src: string; poster: string; steps: ScrubStep[]; label: string }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const still = useReducedMotion();

  useEffect(() => {
    const s = section.current;
    const v = video.current;
    if (!s || !v || still) return;
    let target = 0;
    let shown = 0;
    let raf = 0;
    const seek = () => {
      raf = 0;
      if (!v.duration) return;
      shown += (target - shown) * 0.25;
      if (Math.abs(target - shown) < 0.002) shown = target;
      // Stop short of the template's closing fade, so the last step shows the finished ad.
      if (!v.seeking) v.currentTime = shown * Math.max(0, v.duration - 0.45);
      if (shown !== target) raf = requestAnimationFrame(seek);
    };
    // Mobile browsers load video data only after a play() call; prime it once, muted.
    const prime = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        prime.disconnect();
        void v.play().then(() => v.pause()).catch(() => undefined);
      },
      { rootMargin: '400px' },
    );
    prime.observe(s);
    const trigger = ScrollTrigger.create({
      trigger: s,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        target = self.progress;
        setActive(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
        if (!raf) raf = requestAnimationFrame(seek);
      },
    });
    return () => {
      prime.disconnect();
      trigger.kill();
      cancelAnimationFrame(raf);
    };
  }, [steps.length, still]);

  return (
    <section ref={section} className={cn('relative', still ? 'py-24' : 'h-[300vh]')} aria-label={label}>
      <div className={cn('flex items-center', !still && 'sticky top-0 h-svh')}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
          <ol className="order-2 space-y-2 lg:order-1">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className={cn(
                  'relative rounded-2xl border border-transparent py-4 pr-4 pl-14 transition-[opacity,background-color,border-color] duration-500',
                  still || i === active ? 'border-border bg-surface/70 opacity-100' : 'opacity-45',
                  // Phones show only the current step under the video, so the whole scene fits.
                  !still && i !== active && 'max-lg:hidden',
                )}
              >
                <span
                  className={cn(
                    'absolute top-4 left-4 grid size-7 place-items-center rounded-full border font-mono text-xs transition-colors duration-500',
                    still || i <= active ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-medium tracking-tight">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="order-1 mx-auto h-[min(54svh,620px)] lg:order-2 lg:h-[min(64svh,620px)]">
            <div className="relative aspect-[9/16] h-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_40px_120px_-30px_rgba(124,92,255,0.5)]">
              <video ref={video} src={src} poster={poster} muted playsInline preload="auto" aria-label={label} className="absolute inset-0 size-full object-cover" />
              {!still && (
                <div className="absolute inset-x-6 bottom-5 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
                  <div className="h-full origin-left rounded-full bg-white/80 transition-transform duration-300" style={{ transform: `scaleX(${(active + 1) / steps.length})` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
