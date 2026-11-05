'use client';

import { produce } from 'immer';
import { create } from 'zustand';
import { parseTimeline, timelineOps, type Clip, type TimelineData } from '@adforge/core';
import type { AssetView, TimelineDetailView } from '@/lib/types';

const HISTORY_LIMIT = 150;
/** Edits sharing a coalesce key within this window undo as one step (drags, sliders, typing). */
const COALESCE_MS = 1200;
export const MIN_ZOOM = 0.04;
export const MAX_ZOOM = 40;

export interface EditOptions {
  coalesce?: string;
}

export interface ClipboardEntry {
  clip: Clip;
  trackIndex: number;
  /** Frames after the earliest copied clip. */
  offset: number;
}

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

export interface EditorState {
  id: string | null;
  name: string;
  timeline: TimelineData;
  assets: Record<string, AssetView>;
  /** Server version the local changes are based on. */
  version: number;
  /** Bumped on every local change; compared with savedRevision to know what is unsaved. */
  revision: number;
  savedRevision: number;
  saveStatus: SaveStatus;
  saveError: string | null;
  past: TimelineData[];
  future: TimelineData[];
  lastEdit: { key: string; at: number } | null;
  selection: string[];
  pxPerFrame: number;
  snapping: boolean;
  soloTrackIds: string[];
  clipboard: ClipboardEntry[];

  load: (detail: TimelineDetailView) => void;
  /** Applies a change to the timeline as one undoable step. Returns false when nothing changed. */
  edit: (recipe: (tl: TimelineData) => void, opts?: EditOptions) => boolean;
  undo: () => void;
  redo: () => void;
  rename: (name: string) => void;
  mergeAssets: (views: AssetView[]) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
  setZoom: (pxPerFrame: number) => void;
  setSnapping: (on: boolean) => void;
  toggleSolo: (trackId: string) => void;
  copySelection: () => number;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (version: number, revision: number) => void;
}

const empty = parseTimeline({});

function liveSelection(tl: TimelineData, selection: string[]): string[] {
  if (!selection.length) return selection;
  const ids = new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  const next = selection.filter((id) => ids.has(id));
  return next.length === selection.length ? selection : next;
}

export const useEditor = create<EditorState>()((set, get) => ({
  id: null,
  name: '',
  timeline: empty,
  assets: {},
  version: 0,
  revision: 0,
  savedRevision: 0,
  saveStatus: 'saved',
  saveError: null,
  past: [],
  future: [],
  lastEdit: null,
  selection: [],
  pxPerFrame: 4,
  snapping: true,
  soloTrackIds: [],
  clipboard: [],

  load: (detail) =>
    set({
      id: detail.id,
      name: detail.name,
      timeline: parseTimeline(detail.data),
      assets: detail.assets,
      version: detail.version,
      revision: 0,
      savedRevision: 0,
      saveStatus: 'saved',
      saveError: null,
      past: [],
      future: [],
      lastEdit: null,
      selection: [],
      soloTrackIds: [],
    }),

  edit: (recipe, opts = {}) => {
    const s = get();
    const next = produce(s.timeline, (draft) => {
      recipe(draft as TimelineData);
    });
    if (next === s.timeline) return false;
    const now = Date.now();
    const coalesced = !!opts.coalesce && s.lastEdit?.key === opts.coalesce && now - s.lastEdit.at < COALESCE_MS;
    set({
      timeline: next,
      past: coalesced ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), s.timeline],
      future: [],
      lastEdit: opts.coalesce ? { key: opts.coalesce, at: now } : null,
      revision: s.revision + 1,
      selection: liveSelection(next, s.selection),
      saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'pending',
    });
    return true;
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({
      timeline: prev,
      past: s.past.slice(0, -1),
      future: [s.timeline, ...s.future].slice(0, HISTORY_LIMIT),
      lastEdit: null,
      revision: s.revision + 1,
      selection: liveSelection(prev, s.selection),
      saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'pending',
    });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({
      timeline: next,
      past: [...s.past, s.timeline].slice(-HISTORY_LIMIT),
      future: s.future.slice(1),
      lastEdit: null,
      revision: s.revision + 1,
      selection: liveSelection(next, s.selection),
      saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'pending',
    });
  },

  rename: (name) => {
    const s = get();
    if (name === s.name) return;
    set({ name, revision: s.revision + 1, saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'pending' });
  },

  mergeAssets: (views) => {
    if (!views.length) return;
    set((s) => ({ assets: { ...s.assets, ...Object.fromEntries(views.map((v) => [v.id, v])) } }));
  },

  select: (ids, mode = 'replace') =>
    set((s) => {
      if (mode === 'replace') return { selection: [...new Set(ids)] };
      if (mode === 'add') return { selection: [...new Set([...s.selection, ...ids])] };
      const current = new Set(s.selection);
      for (const id of ids) {
        if (current.has(id)) current.delete(id);
        else current.add(id);
      }
      return { selection: [...current] };
    }),

  setZoom: (pxPerFrame) => set({ pxPerFrame: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerFrame)) }),
  setSnapping: (on) => set({ snapping: on }),
  toggleSolo: (trackId) =>
    set((s) => ({ soloTrackIds: s.soloTrackIds.includes(trackId) ? s.soloTrackIds.filter((t) => t !== trackId) : [...s.soloTrackIds, trackId] })),

  copySelection: () => {
    const { timeline: tl, selection } = get();
    const picked = selection.map((id) => timelineOps.findClip(tl, id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!picked.length) return 0;
    const first = Math.min(...picked.map((p) => p.clip.start));
    set({
      clipboard: picked.map((p) => ({ clip: JSON.parse(JSON.stringify(p.clip)) as Clip, trackIndex: tl.tracks.indexOf(p.track), offset: p.clip.start - first })),
    });
    return picked.length;
  },

  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
  markSaved: (version, revision) =>
    set((s) => {
      const savedRevision = Math.max(s.savedRevision, revision);
      return { version, savedRevision, saveError: null, saveStatus: savedRevision >= s.revision ? 'saved' : 'pending' };
    }),
}));

/** The clip objects currently selected, in timeline order. */
export function selectedClips(s: Pick<EditorState, 'timeline' | 'selection'>): { trackId: string; clip: Clip }[] {
  const ids = new Set(s.selection);
  const out: { trackId: string; clip: Clip }[] = [];
  for (const t of s.timeline.tracks) for (const c of t.clips) if (ids.has(c.id)) out.push({ trackId: t.id, clip: c });
  return out;
}
