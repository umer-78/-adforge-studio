'use client';

import { useEffect, useRef } from 'react';
import { isLowPowerDevice } from '@/lib/motion';

const INTERACTIVE = 'a, button, [role="button"], summary, label, [data-cursor="link"]';

/**
 * A ring that trails the pointer and grows over things you can click. The system cursor stays as
 * it is. Only for a mouse or trackpad, never with reduced motion or on low-power devices.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ring = ref.current;
    if (!ring || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches || isLowPowerDevice()) return;
    let x = -100;
    let y = -100;
    let cx = x;
    let cy = y;
    let raf = 0;
    let seen = false;
    const frame = () => {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      ring.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.1 ? requestAnimationFrame(frame) : 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        seen = true;
        cx = x;
        cy = y;
      }
      const target = e.target instanceof Element ? e.target : null;
      const field = target?.closest('input, textarea, select, [contenteditable="true"]');
      ring.dataset.state = field ? 'hidden' : target?.closest(INTERACTIVE) ? 'link' : 'idle';
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const leave = () => {
      ring.dataset.state = 'hidden';
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, []);
  return <div ref={ref} className="cursor-ring" data-state="hidden" aria-hidden />;
}
