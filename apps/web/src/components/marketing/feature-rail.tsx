'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, type ReactNode } from 'react';

gsap.registerPlugin(ScrollTrigger);

/**
 * On wide screens the section pins and its cards slide sideways as you scroll down. On phones, and
 * for people who prefer reduced motion, the cards are a row you swipe through.
 */
export function FeatureRail({ heading, children, id }: { heading: ReactNode; children: ReactNode; id?: string }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = section.current;
    const t = track.current;
    if (!s || !t) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)', () => {
      s.setAttribute('data-pinned', '');
      const distance = () => Math.max(0, t.scrollWidth - t.clientWidth);
      gsap.to(t, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: s,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.7,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
          },
        },
      });
      return () => s.removeAttribute('data-pinned');
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={section} id={id} className="rail relative flex flex-col justify-center overflow-hidden py-24 lg:min-h-svh lg:py-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">{heading}</div>
      <div ref={track} className="rail-track mt-10 flex gap-5 px-4 pb-4 sm:px-8 lg:mt-12 lg:px-[max(2rem,calc((100vw-80rem)/2+2rem))]">
        {children}
      </div>
      <div className="mx-auto mt-6 hidden w-full max-w-7xl px-8 lg:block" aria-hidden>
        <div className="h-px w-full bg-border">
          <div ref={bar} className="h-px origin-left scale-x-0 bg-gradient-to-r from-brand-from to-brand-to" />
        </div>
      </div>
    </section>
  );
}
