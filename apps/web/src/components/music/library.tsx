'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AudioWaveform, Clapperboard, Download, Ellipsis, ExternalLink, Music, Pencil, Plus, Search, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDuration, MUSIC_GENRES, MUSIC_MOODS } from '@adforge/core';
import { WaveformPlayer } from '@/components/audio/waveform-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView, MusicView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AddAudioDialog, LicenseDialog } from './add-audio-dialog';
import { LICENSE_STATE, useMusic, type MusicFilter } from './use-music';

/** Every track you can put under an ad: generated ones and licensed ones you added. */
export function MusicLibrary() {
  const [filter, setFilter] = useState<MusicFilter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const list = useMusic(filter, dq);
  const [adding, setAdding] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'generated', label: 'Generated' },
            { value: 'added', label: 'Added' },
            { value: 'logos', label: 'Audio logos' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, genre or mood" className="h-8 pl-9" />
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add a licensed track
          </Button>
        </div>
      </div>
      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={<Music />}
          title={dq || filter !== 'all' ? 'No matching tracks' : 'No music yet'}
          description={dq || filter !== 'all' ? 'Try another search or filter.' : 'Generate an original track cleared for ads, or add music you have a license for.'}
          action={
            !dq && filter === 'all' ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="brand" size="sm" asChild>
                  <Link href="/music?tab=music">
                    <Sparkles className="size-4" /> Generate a track
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Add a licensed track
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <TrackRow key={m.id} track={m} />
          ))}
          {list.hasNextPage && (
            <Button variant="ghost" className="w-full" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      )}
      <AddAudioDialog kind="music" open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function TrackRow({ track: m }: { track: MusicView }) {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const [editing, setEditing] = useState(false);
  const [licensing, setLicensing] = useState<AssetView | null>(null);
  const [removing, setRemoving] = useState(false);
  const [findingBeats, setFindingBeats] = useState(false);
  const a = m.asset;
  const state = LICENSE_STATE[m.licenseState];
  useEffect(() => {
    if (m.beats.length) setFindingBeats(false);
  }, [m.beats.length]);
  const beats = useMutation({
    mutationFn: () => api.post(`/assets/${a!.id}/actions`, { action: 'detect', kind: 'beats' }),
    onSuccess: () => {
      setFindingBeats(true);
      toast.success('Finding the beat. Markers appear on the waveform in a few seconds.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/music/${m.id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assets', 'music'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/music/${m.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets', 'music'] });
      toast.success('Removed from your music. The file is still in the Library.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const facts = [m.genre, m.mood, m.bpm ? `${Math.round(m.bpm)} BPM` : null, m.musicalKey, m.durationS ? formatDuration(m.durationS) : null].filter(Boolean);
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{m.title}</h3>
            {m.isAudioLogo && <Badge variant="secondary">Audio logo</Badge>}
            {m.generated && <Badge variant="outline">Generated</Badge>}
            <Tip content={m.license?.source ? `${state.hint} Source: ${m.license.source}.` : state.hint}>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', state.tone)}>
                {m.licenseState !== 'cleared' && <ShieldAlert className="size-3" />}
                {state.label}
              </span>
            </Tip>
          </div>
          {facts.length > 0 && <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>}
        </div>
        <div className="flex items-center gap-1">
          {a && m.licenseState !== 'cleared' && (
            <Button size="xs" variant="outline" onClick={() => setLicensing(a)}>
              Add license
            </Button>
          )}
          {a && !m.beats.length && (a.durationS ?? 0) >= 6 && (
            <Tip content="Find the beat so cuts can snap to it in the editor">
              <Button size="xs" variant="ghost" loading={beats.isPending || findingBeats} disabled={a.status !== 'ready'} onClick={() => beats.mutate()}>
                <AudioWaveform className="size-3.5" /> Find beats
              </Button>
            </Tip>
          )}
          {a && (
            <Tip content="Put on a new edit">
              <Button size="icon-sm" variant="ghost" aria-label="Open in the editor" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [a.id], name: m.title.slice(0, 80) })}>
                <Clapperboard className="size-4" />
              </Button>
            </Tip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => patch.mutate({ isAudioLogo: !m.isAudioLogo })}>
                <Music /> {m.isAudioLogo ? 'Not an audio logo' : 'Mark as audio logo'}
              </DropdownMenuItem>
              {a && (
                <>
                  <DropdownMenuItem onSelect={() => setLicensing(a)}>
                    <ShieldAlert /> {m.license ? 'Change license' : 'Add license'}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/assets/${a.id}/download`}>
                      <Download /> Download
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/library/${a.id}`}>
                      <ExternalLink /> Open in library
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setRemoving(true)}>
                <Trash2 /> Remove from music
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {a ? (
        a.status === 'ready' || a.url ? (
          <WaveformPlayer assetId={a.id} src={a.url} waveformUrl={a.waveformUrl} durationS={a.durationS} beats={m.beats} className="mt-3" />
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{a.status === 'failed' ? (a.processingError ?? 'This file could not be processed.') : 'Processing…'}</p>
        )
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">The file was deleted.</p>
      )}
      <EditTrackDialog track={m} open={editing} onOpenChange={setEditing} />
      <LicenseDialog asset={licensing} open={!!licensing} onOpenChange={(v) => !v && setLicensing(null)} />
      <Confirm open={removing} onOpenChange={setRemoving} title="Remove this track from your music?" description="The file stays in the Library and in any edit that uses it." confirmLabel="Remove" destructive onConfirm={() => remove.mutate()} />
    </div>
  );
}

const NONE = '__none';

function EditTrackDialog({ track: m, open, onOpenChange }: { track: MusicView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(m.title);
  const [genre, setGenre] = useState(m.genre ?? NONE);
  const [mood, setMood] = useState(m.mood ?? NONE);
  const [key, setKey] = useState(m.musicalKey ?? '');
  const [bpm, setBpm] = useState(m.bpm ? String(Math.round(m.bpm)) : '');
  const [lyrics, setLyrics] = useState(m.lyrics ?? '');
  const [logo, setLogo] = useState(m.isAudioLogo);
  useEffect(() => {
    if (!open) return;
    setTitle(m.title);
    setGenre(m.genre ?? NONE);
    setMood(m.mood ?? NONE);
    setKey(m.musicalKey ?? '');
    setBpm(m.bpm ? String(Math.round(m.bpm)) : '');
    setLyrics(m.lyrics ?? '');
    setLogo(m.isAudioLogo);
  }, [open, m]);
  const bpmValue = bpm.trim() ? Number(bpm) : null;
  const bad = !title.trim() || (bpmValue != null && (!Number.isFinite(bpmValue) || bpmValue < 30 || bpmValue > 300));
  const options = (list: readonly string[], current: string) => [{ value: NONE, label: 'Not set' }, ...[...new Set([...(current !== NONE ? [current] : []), ...list])].map((v) => ({ value: v, label: v }))];
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/music/${m.id}`, {
        title: title.trim(),
        genre: genre === NONE ? null : genre,
        mood: mood === NONE ? null : mood,
        musicalKey: key.trim() || null,
        bpm: bpmValue,
        lyrics: lyrics.trim() || null,
        isAudioLogo: logo,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets', 'music'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Genre">
              <Select value={genre} onValueChange={setGenre} options={options(MUSIC_GENRES, genre)} />
            </Field>
            <Field label="Mood">
              <Select value={mood} onValueChange={setMood} options={options(MUSIC_MOODS, mood)} />
            </Field>
            <Field label="Tempo (BPM)" hint="Found automatically when the beat is detected.">
              <Input value={bpm} onChange={(e) => setBpm(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="120" />
            </Field>
            <Field label="Key">
              <Input value={key} onChange={(e) => setKey(e.target.value)} maxLength={12} placeholder="A minor" />
            </Field>
          </div>
          {!m.instrumental && (
            <Field label="Lyrics">
              <Textarea rows={5} value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={5000} />
            </Field>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Audio logo</span>
            <Switch checked={logo} onCheckedChange={setLogo} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={save.isPending} disabled={bad} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
