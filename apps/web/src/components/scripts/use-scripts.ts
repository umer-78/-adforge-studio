'use client';

import { useQuery } from '@tanstack/react-query';
import { SCRIPT_BEATS, type AspectRatio } from '@adforge/core';
import { api } from '@/lib/api-client';
import type { CharacterView, ScriptDetailView, ScriptView } from '@/lib/types';
import { qs } from '@/lib/utils';

export function useScripts(filters: { q?: string; status?: string; format?: string }) {
  return useQuery({
    queryKey: ['scripts', filters],
    queryFn: () => api.get<{ items: ScriptView[]; nextCursor: string | null }>(`/scripts${qs({ q: filters.q, status: filters.status, format: filters.format, limit: 60 })}`),
    // Scripts are written by the worker; poll while any is still being written.
    refetchInterval: (query) => (query.state.data?.items.some((s) => s.status === 'generating') ? 2500 : false),
  });
}

export function useScript(id: string) {
  return useQuery({
    queryKey: ['script', id],
    queryFn: () => api.get<ScriptDetailView>(`/scripts/${id}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      if (d.status === 'generating') return 2000;
      const busy = [...Object.values(d.pending.frames), ...Object.values(d.pending.voices)].some((p) => p.status === 'queued' || p.status === 'running');
      return busy ? 3000 : false;
    },
  });
}

export function useCharacters() {
  return useQuery({ queryKey: ['characters'], queryFn: () => api.get<{ items: CharacterView[] }>('/characters').then((r) => r.items), staleTime: 30_000 });
}

export type Beat = (typeof SCRIPT_BEATS)[number];

export const BEAT_STYLE: Record<Beat, { label: string; className: string }> = {
  hook: { label: 'Hook', className: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30' },
  problem: { label: 'Problem', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  agitate: { label: 'Agitate', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  solution: { label: 'Solution', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  demo: { label: 'Demo', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  proof: { label: 'Proof', className: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  offer: { label: 'Offer', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  cta: { label: 'CTA', className: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
  other: { label: 'Other', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

/** The usual frame shape for each platform's feed. */
export function platformAspect(platform: string | null | undefined): AspectRatio {
  switch (platform) {
    case 'youtube':
      return '16:9';
    case 'linkedin':
    case 'x':
      return '1:1';
    case 'facebook':
    case 'meta':
    case 'pinterest':
      return '4:5';
    default:
      return '9:16';
  }
}

export const formatSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s * 10) / 10}s`);

/** Spoken text with the line's emotion as an Eleven v3 audio tag, unless the text already starts with one. */
export function spokenWithEmotion(text: string, emotion: string | null | undefined): string {
  const t = text.trim();
  if (!emotion || /^\[[^\]]+\]/.test(t) || /^neutral$/i.test(emotion.trim())) return t;
  return `[${emotion.trim().toLowerCase()}] ${t}`;
}
