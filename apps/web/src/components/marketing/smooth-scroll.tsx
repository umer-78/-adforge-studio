'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { isLowPowerDevice, prefersReducedMotion } from '@/lib/motion';

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling for the marketing pages, driven by GSAP's ticker so scroll-linked animations
 * stay in step. Also runs the page-wide helpers, again on every page change:
 *   [data-reveal]  fades and lifts in when it enters the viewport (stagger with --reveal-index)
 *   [data-speed]   parallax layer; positive values drift up faster than the scroll
 * Nothing moves for people who prefer reduced motion, and low-power devices keep native scrolling.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-motion-ready', '');
    if (prefersReducedMotion() || isLowPowerDevice()) return;

    const lenis = new Lenis({ autoRaf: false, anchors: { offset: -72 }, lerp: 0.11, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // Media and fonts change layout after first paint; re-measure pinned sections once they settle.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    void document.fonts?.ready.then(refresh);
    return () => {
      window.removeEventListener('load', refresh);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const reveals = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')];
    if (prefersReducedMotion()) {
      reveals.forEach((el) => el.setAttribute('data-revealed', ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-revealed', '');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    reveals.forEach((el) => io.observe(el));

    const ctx = gsap.context(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-speed]')) {
        const speed = Number(el.dataset.speed) || 0;
        gsap.fromTo(el, { yPercent: speed * 12 }, { yPercent: -speed * 12, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: true } });
      }
    });
    return () => {
      io.disconnect();
      ctx.revert();
    };
  }, [pathname]);

  return <>{children}</>;
}
