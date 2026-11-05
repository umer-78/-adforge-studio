'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/motion';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * A number that counts to its value: up from zero the first time, then from the old value to the
 * new one whenever it changes. Screen readers and reduced motion get the final value straight away.
 */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString(), duration = 1100, className }: { value: number; format?: (v: number) => string; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (value - a) * easeOut(t);
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      <span aria-hidden>{format(reduce ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
