import { AudioLines, Box, Captions, Film, Image as ImageIcon, Layers, Shapes, Type, type LucideIcon } from 'lucide-react';
import type { Clip, ClipType, TrackKind } from '@adforge/core';
import type { AssetView } from '@/lib/types';

/** m:ss.ff, or h:mm:ss.ff past an hour. */
export function timecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.round(frame));
  const totalS = Math.floor(f / fps);
  const ff = String(f % Math.round(fps)).padStart(2, '0');
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = String(totalS % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}.${ff}` : `${m}:${s}.${ff}`;
}

export const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(frames / fps < 10 ? 1 : 0)}s`;

export const CLIP_ICON: Record<ClipType, LucideIcon> = {
  video: Film,
  image: ImageIcon,
  audio: AudioLines,
  text: Type,
  captions: Captions,
  shape: Shapes,
  motion: Box,
  adjustment: Layers,
};

/** Timeline colours per clip type: fill, border and the selected ring. */
export const CLIP_TONE: Record<ClipType, string> = {
  video: 'bg-sky-500/25 border-sky-400/50',
  image: 'bg-teal-500/25 border-teal-400/50',
  audio: 'bg-emerald-500/20 border-emerald-400/45',
  text: 'bg-amber-500/25 border-amber-400/50',
  captions: 'bg-yellow-500/20 border-yellow-400/45',
  shape: 'bg-fuchsia-500/20 border-fuchsia-400/45',
  motion: 'bg-violet-500/25 border-violet-400/55',
  adjustment: 'bg-zinc-400/15 border-zinc-300/40',
};

export const TRACK_HEIGHT: Record<TrackKind, number> = { video: 60, overlay: 44, text: 36, audio: 52 };

export const TRACK_LABEL: Record<TrackKind, string> = { video: 'Video', overlay: 'Overlay', text: 'Text', audio: 'Audio' };

export const VISUAL_TYPES: ReadonlySet<ClipType> = new Set(['video', 'image', 'text', 'captions', 'shape', 'motion']);

export function clipLabel(clip: Clip, assets: Record<string, AssetView>): string {
  if (clip.name) return clip.name;
  switch (clip.type) {
    case 'video':
    case 'image':
    case 'audio':
      if (clip.placeholder) return clip.placeholder.label;
      return (clip.assetId && assets[clip.assetId]?.name) || 'Missing file';
    case 'text':
      return clip.text.replace(/\s+/g, ' ').trim() || 'Text';
    case 'captions':
      return clip.words.length ? clip.words.slice(0, 8).map((w) => w.text).join(' ') : 'Captions';
    case 'shape':
      return clip.shape.charAt(0).toUpperCase() + clip.shape.slice(1);
    case 'motion':
      return clip.templateId;
    case 'adjustment':
      return 'Adjustment layer';
  }
}

/** Drag payloads from the media panel. The data is kept here too because drop targets cannot read it during dragover. */
export type DragItem =
  | { kind: 'asset'; asset: AssetView }
  | { kind: 'text'; presetId: string }
  | { kind: 'motion'; templateId: string }
  | { kind: 'shape'; shape: 'rect' | 'ellipse' | 'triangle' | 'line' | 'star' }
  | { kind: 'adjustment' }
  | { kind: 'sfx'; builtinId: string; name: string; durationS: number | null };

export const DRAG_MIME = 'application/x-adforge-item';
let dragging: DragItem | null = null;

export function startDrag(e: React.DragEvent, item: DragItem) {
  dragging = item;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(DRAG_MIME, item.kind);
  e.dataTransfer.setData('text/plain', item.kind === 'asset' ? item.asset.name : item.kind);
}

export function currentDrag(): DragItem | null {
  return dragging;
}

export function endDrag() {
  dragging = null;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.closest('[role="dialog"],[role="menu"],[role="listbox"]');
}
