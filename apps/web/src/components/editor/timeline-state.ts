'use client';

import { createContext, useContext, type RefObject } from 'react';
import { create } from 'zustand';
import type { TimelineData } from '@adforge/core';

export const HEADER_W = 188;
export const RULER_H = 28;
/** Pixels within which a dragged edge snaps to a clip edge, marker or the playhead. */
export const SNAP_PX = 8;

/** Transient drag feedback, kept out of the document until the pointer is released. */
export const useTimelineUi = create<{
  drag: { ids: string[]; delta: number; trackId: string | null; ok: boolean } | null;
  trim: { id: string; start: number; duration: number } | null;
  snap: number | null;
  drop: { trackId: string | null; frame: number } | null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
}>()(() => ({ drag: null, trim: null, snap: null, drop: null, marquee: null }));

export interface Row {
  id: string;
  top: number;
  height: number;
}

export interface Geometry {
  px: number;
  fps: number;
  rows: Row[];
  scroller: RefObject<HTMLDivElement | null>;
}

export const GeometryContext = createContext<Geometry | null>(null);

export function useGeometry(): Geometry {
  const g = useContext(GeometryContext);
  if (!g) throw new Error('useGeometry must be used inside the timeline');
  return g;
}

export function frameAtClientX(g: Geometry, clientX: number): number {
  const el = g.scroller.current;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.round((clientX - rect.left + el.scrollLeft - HEADER_W) / g.px));
}

/** Content-space y (below the ruler) for a pointer position. */
export function contentY(g: Geometry, clientY: number): number {
  const el = g.scroller.current;
  if (!el) return 0;
  return clientY - el.getBoundingClientRect().top + el.scrollTop - RULER_H;
}

export function trackAtClientY(g: Geometry, clientY: number): string | null {
  const y = contentY(g, clientY);
  return g.rows.find((r) => y >= r.top && y < r.top + r.height)?.id ?? null;
}

/**
 * Finds the shift that lands one of `candidates` on a snap point (clip edges, markers,
 * playhead, zero), within SNAP_PX. Returns null when nothing is close enough.
 */
export function findSnap(tl: TimelineData, candidates: number[], exclude: ReadonlySet<string>, playhead: number, px: number): { shift: number; at: number } | null {
  const threshold = SNAP_PX / px;
  const points = new Set<number>([0, Math.round(playhead)]);
  for (const t of tl.tracks)
    for (const c of t.clips) {
      if (exclude.has(c.id)) continue;
      points.add(c.start);
      points.add(c.start + c.duration);
    }
  for (const m of tl.markers) points.add(m.frame);
  let best: { shift: number; at: number } | null = null;
  for (const c of candidates)
    for (const p of points) {
      const d = p - c;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: p };
    }
  return best;
}
