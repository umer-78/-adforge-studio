'use client';

import { useEffect, useRef } from 'react';

/**
 * A number that counts up from zero the first time it scrolls into view. The server renders the
 * final value, so it is right without scripts and for people who prefer reduced motion.
 */
export function CountUp({ value, className, ms = 1600 }: { value: number; className?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / ms);
          el.textContent = String(Math.round(value * (1 - Math.pow(1 - t, 4))));
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, ms]);
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
