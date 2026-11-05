'use client';

import { useEffect } from 'react';

const MIN_MS = 900;
const MAX_MS = 2600;

/** Waits for what the first screen needs, counts up to it, then lifts the preloader. */
export function PreloaderController() {
  useEffect(() => {
    const root = document.documentElement;
    const overlay = document.getElementById('af-preloader');
    if (!overlay || !root.classList.contains('preloading')) return;
    const count = overlay.querySelector<HTMLElement>('[data-preloader-count]');
    const bar = overlay.querySelector<HTMLElement>('[data-preloader-bar]');
    const started = performance.now();
    let target = 0.15;
    let shown = 0;
    let raf = 0;
    let done = false;

    // Each finished step raises the target; the counter eases toward it.
    const steps: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => (document.readyState === 'complete' ? resolve() : window.addEventListener('load', () => resolve(), { once: true }))),
      ...[...document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('[data-preload]')].map(
        (el) =>
          new Promise<void>((resolve) => {
            if (el instanceof HTMLImageElement ? el.complete : el.readyState >= 2) return resolve();
            el.addEventListener(el instanceof HTMLImageElement ? 'load' : 'loadeddata', () => resolve(), { once: true });
            el.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    ];
    let finished = 0;
    for (const step of steps)
      void step.then(() => {
        finished += 1;
        target = Math.max(target, 0.15 + (0.85 * finished) / steps.length);
      });

    const finish = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem('af-preloaded', '1');
      } catch {
        // Private mode: the preloader simply shows again next visit.
      }
      // The curtain lifts in CSS once this class is gone; the hero animations start with it.
      root.classList.remove('preloading');
    };

    const frame = (now: number) => {
      const elapsed = now - started;
      const goal = elapsed >= MAX_MS ? 1 : target;
      shown += (goal - shown) * 0.12;
      if (goal - shown < 0.004) shown = goal;
      const pct = Math.round(shown * 100);
      if (count) count.textContent = String(pct);
      if (bar) bar.style.transform = `scaleX(${shown})`;
      if (shown >= 1 && elapsed >= MIN_MS) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
