'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Ellipsis, FolderPlus, Mic, Music, Pause, Play, Plus, Scissors, Search, Trash2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatDuration, MUSIC_GENRES, MUSIC_MOODS, SFX_CATEGORIES } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { AudioFeed } from '@/components/audio/audio-feed';
import { RunBar } from '@/components/audio/run-bar';
import { Composer, Labeled, studioColumns, useCapabilityModel } from '@/components/audio/studio';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useDictation } from '@/lib/hooks/use-dictation';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView, SfxView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AddAudioDialog, sfxCategoryLabel } from './add-audio-dialog';
import { LICENSE_STATE, useSfx } from './use-music';

function Chips({ options, value, onChange }: { options: readonly string[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? null : o)}
          className={cn('rounded-full border px-2.5 py-1 text-xs transition', value === o ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary/50 hover:text-foreground')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function DictateButton({ onText }: { onText: (text: string) => void }) {
  const dict = useDictation((text, final) => final && onText(text.trim()));
  return (
    <Button type="button" size="icon-sm" variant={dict.listening ? 'brand' : 'ghost'} className="absolute top-2 right-2" aria-label="Dictate" onClick={dict.toggle} loading={dict.busy}>
      <Mic className="size-4" />
    </Button>
  );
}

const append = (prev: string, text: string) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${text}`;

/* ---------------------------------- Music ---------------------------------- */

type MusicMode = 'instrumental' | 'song' | 'logo';
const TEMPO: Record<string, string> = { any: '', slow: 'slow tempo, around 80 BPM', medium: 'mid tempo, around 105 BPM', fast: 'fast tempo, around 128 BPM' };
const LENGTHS = [6, 15, 30, 60];

export function MusicPanel({ initialPrompt = '' }: { initialPrompt?: string }) {
  const { model } = useCapabilityModel('music');
  const [mode, setMode] = useState<MusicMode>('instrumental');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [genre, setGenre] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>('Upbeat');
  const [tempo, setTempo] = useState('any');
  const [length, setLength] = useState(30);
  const [lyrics, setLyrics] = useState('');
  const [takes, setTakes] = useState('1');
  const logo = mode === 'logo';
  const durationS = logo ? Math.min(10, Math.max(3, length)) : length;
  useEffect(() => {
    if (logo && length > 10) setLength(5);
    if (!logo && length < 6) setLength(15);
  }, [logo, length]);

  const description = [
    logo ? 'A short, memorable sonic logo that ends an ad: a clear melodic motif that resolves, crisp and brandable' : null,
    [mood, genre].filter(Boolean).join(' ').toLowerCase() || null,
    prompt.trim() || null,
    TEMPO[tempo] || null,
    !logo ? `Made to sit under an ad voice-over${durationS <= 15 ? ', with an instant start and a clean ending' : ', builds and ends cleanly'}` : null,
  ]
    .filter(Boolean)
    .join('. ');
  const params = {
    prompt: description,
    durationS,
    instrumental: mode !== 'song',
    ...(mode === 'song' && lyrics.trim() ? { lyrics: lyrics.trim() } : {}),
  };
  const problems = [!prompt.trim() && !genre && !mood ? 'Describe the track or pick a mood or genre.' : '', description.length + lyrics.length > 4500 ? 'Shorten the description or lyrics.' : ''].filter(Boolean);

  return (
    <div className={studioColumns}>
      <Composer>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'instrumental', label: 'Instrumental' },
            { value: 'song', label: 'Song with vocals' },
            { value: 'logo', label: 'Audio logo' },
          ]}
        />
        <Field label="Describe the track">
          <div className="relative">
            <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000} className="pr-11" placeholder={logo ? 'Bright marimba and a soft synth swell, optimistic, three notes' : 'Warm acoustic guitar and claps, feel-good summer morning, builds into a confident drop'} />
            <DictateButton onText={(t) => setPrompt((v) => append(v, t))} />
          </div>
        </Field>
        <Field label="Mood">
          <Chips options={MUSIC_MOODS} value={mood} onChange={setMood} />
        </Field>
        <Field label="Genre">
          <Chips options={MUSIC_GENRES} value={genre} onChange={setGenre} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tempo">
            <Segmented size="sm" value={tempo} onChange={setTempo} options={[{ value: 'any', label: 'Any' }, { value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Mid' }, { value: 'fast', label: 'Fast' }]} />
          </Field>
          <Field label="Takes">
            <Segmented size="sm" value={takes} onChange={setTakes} options={['1', '2'].map((v) => ({ value: v, label: v }))} />
          </Field>
        </div>
        {logo ? (
          <Labeled label="Length" value={`${durationS}s`}>
            <Slider min={3} max={10} step={1} value={[durationS]} onValueChange={([v]) => setLength(v ?? 5)} />
          </Labeled>
        ) : (
          <div className="space-y-2">
            <Labeled label="Length" value={formatDuration(durationS)}>
              <Slider min={6} max={300} step={1} value={[durationS]} onValueChange={([v]) => setLength(v ?? 30)} />
            </Labeled>
            <div className="flex gap-1.5">
              {LENGTHS.map((s) => (
                <button key={s} type="button" onClick={() => setLength(s)} className={cn('rounded-md border px-2 py-0.5 text-[11px] tabular-nums transition', durationS === s ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}>
                  {s}s ad
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'song' && (
          <Field label="Lyrics" hint="Leave empty and the model writes them from your description.">
            <Textarea rows={5} value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={3000} placeholder={'[Verse]\nWake up, it’s a brand-new day…\n[Chorus]\n…'} />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">Original tracks, cleared for commercial use on paid ElevenLabs plans. No copyrighted songs or artist names: describe the sound instead.</p>
        <RunBar model={model} input={{ capability: 'music', params, variants: Number(takes), sourceRef: { mood, genre, audioLogo: logo } }} problems={problems} label={logo ? 'Generate audio logo' : 'Generate music'} icon={<Music className="size-4" />} />
      </Composer>
      <div className="min-w-0 space-y-3">
        <Notice tone="info" action={<Button size="xs" variant="outline" asChild><Link href="/music?tab=library">My music</Link></Button>}>
          Every track lands in My music with its license, tempo and beat markers, ready to drop under an edit.
        </Notice>
        <AudioFeed capabilities={['music']} emptyTitle="No tracks yet" emptyDescription="Pick a mood and a length that matches your ad. Takes play here as soon as they are ready." />
      </div>
    </div>
  );
}

/* ------------------------------ Sound effects ------------------------------ */

const IDEAS = ['Whoosh transition, fast and airy', 'Cash register ka-ching', 'Soda can opening with fizz', 'Phone notification, friendly double chime', 'Deep cinematic bass impact', 'Small crowd cheering and clapping', 'Keyboard typing, fast', 'Camera shutter click'];
const SFX_LENGTHS = [{ value: 'auto', label: 'Auto' }, ...['1', '2', '5', '10'].map((v) => ({ value: v, label: `${v}s` }))];

export function SfxPanel() {
  const { model } = useCapabilityModel('sfx');
  const [prompt, setPrompt] = useState('');
  const [length, setLength] = useState('auto');
  const [loop, setLoop] = useState(false);
  const [influence, setInfluence] = useState(0.4);
  const [takes, setTakes] = useState('2');
  const [view, setView] = useState<'library' | 'generated'>('library');
  const params = { prompt: prompt.trim(), ...(length !== 'auto' ? { durationS: Number(length) } : {}), promptInfluence: influence, ...(loop ? { loop: true } : {}) };
  const problems = [!prompt.trim() ? 'Describe the sound.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <Field label="Describe the sound">
          <div className="relative">
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} className="pr-11" placeholder="Ice cubes dropping into a glass, then a soda pour" />
            <DictateButton onText={(t) => setPrompt((v) => append(v, t))} />
          </div>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button key={i} type="button" onClick={() => setPrompt(i)} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/60 hover:text-primary">
              {i}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Length">
            <Segmented size="sm" value={length} onChange={setLength} options={SFX_LENGTHS} />
          </Field>
          <Field label="Takes">
            <Segmented size="sm" value={takes} onChange={setTakes} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))} />
          </Field>
        </div>
        <Labeled label="Follow the words" value={influence < 0.34 ? 'Loosely' : influence < 0.67 ? 'Balanced' : 'Closely'}>
          <Slider min={0} max={1} step={0.05} value={[influence]} onValueChange={([v]) => setInfluence(v ?? 0.4)} />
        </Labeled>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Seamless loop</span>
            <span className="block text-xs text-muted-foreground">For ambiences and beds that repeat.</span>
          </span>
          <Switch checked={loop} onCheckedChange={setLoop} />
        </label>
        <RunBar model={model} input={{ capability: 'sfx', params, variants: Number(takes), sourceRef: { category: 'generated' } }} problems={problems} label="Generate sound" icon={<Zap className="size-4" />} onStarted={() => setView('generated')} />
      </Composer>
      <div className="min-w-0 space-y-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'library', label: 'Sound library' },
            { value: 'generated', label: 'Generated' },
          ]}
        />
        {view === 'library' ? <SfxLibrary /> : <AudioFeed capabilities={['sfx']} emptyTitle="No generated sounds yet" emptyDescription="Describe a sound and generate a few takes. They are added to your effects automatically." />}
      </div>
    </div>
  );
}

const PLAY_EVENT = 'af:audio-play';

/** One shared player for sound tiles: starting a sound stops the previous one. */
function useTilePlayer() {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    el.current = audio;
    const stop = () => setPlaying(null);
    audio.addEventListener('ended', stop);
    audio.addEventListener('pause', stop);
    const onOther = (e: Event) => {
      if ((e as CustomEvent<HTMLAudioElement>).detail !== audio) audio.pause();
    };
    document.addEventListener(PLAY_EVENT, onOther);
    return () => {
      audio.pause();
      audio.removeEventListener('ended', stop);
      audio.removeEventListener('pause', stop);
      document.removeEventListener(PLAY_EVENT, onOther);
    };
  }, []);
  const toggle = (id: string, url: string | null) => {
    const audio = el.current;
    if (!audio || !url) return;
    if (playing === id) {
      audio.pause();
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    document.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: audio }));
    void audio
      .play()
      .then(() => setPlaying(id))
      .catch(() => setPlaying(null));
  };
  return { playing, toggle };
}

function SfxLibrary() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q.trim(), 250);
  const list = useSfx(dq, category);
  const player = useTilePlayer();
  const mine = list.data?.mine ?? [];
  const builtin = list.data?.builtin ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sounds" className="h-8 pl-9" />
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add a sound
        </Button>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {[null, ...SFX_CATEGORIES].map((c) => (
          <button
            key={c ?? 'all'}
            type="button"
            onClick={() => setCategory(c)}
            className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs transition', category === c ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {c ? sfxCategoryLabel(c) : 'All'}
          </button>
        ))}
      </div>
      {list.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !mine.length && !builtin.length ? (
        <EmptyState icon={<Zap />} title="No sounds match" description="Try another word, or generate exactly the sound you need." />
      ) : (
        <>
          {mine.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your sounds</h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {mine.map((s) => (
                  <SfxTile key={s.id} sfx={s} playing={player.playing === s.id} onPlay={() => player.toggle(s.id, s.url)} />
                ))}
              </div>
            </section>
          )}
          {builtin.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Built-in · free for commercial use</h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {builtin.map((s) => (
                  <SfxTile key={s.id} sfx={s} playing={player.playing === s.id} onPlay={() => player.toggle(s.id, s.url)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <AddAudioDialog kind="sfx" open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function SfxTile({ sfx: s, playing, onPlay }: { sfx: SfxView; playing: boolean; onPlay: () => void }) {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const [removing, setRemoving] = useState(false);
  const state = LICENSE_STATE[s.licenseState];
  const toLibrary = useMutation({
    mutationFn: () => api.post<{ asset: AssetView }>('/sfx', { mode: 'builtin', builtinId: s.builtinId }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/sfx/${s.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets', 'sfx'] });
      toast.success('Removed from your sounds. The file is still in the Library.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const assetFor = async () => (s.asset ? s.asset : (await toLibrary.mutateAsync()).asset);
  const save = async () => {
    const a = await assetFor().catch(() => null);
    if (!a) return;
    void qc.invalidateQueries({ queryKey: ['assets'] });
    toast.success(`“${s.name}” is in your Library`, { action: { label: 'Open', onClick: () => window.location.assign(`/library/${a.id}`) } });
  };
  const edit = async () => {
    const a = await assetFor().catch(() => null);
    if (a) editor.mutate({ assetIds: [a.id], name: s.name });
  };
  return (
    <div className="group flex items-center gap-3 rounded-xl border bg-card p-2.5 transition hover:border-primary/40">
      <Button type="button" size="icon" variant={playing ? 'brand' : 'secondary'} className="size-10 shrink-0 rounded-full" aria-label={playing ? 'Stop' : `Play ${s.name}`} disabled={!s.url} onClick={onPlay}>
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={s.name}>
          {s.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{sfxCategoryLabel(s.category)}</span>
          {s.durationS ? <span className="tabular-nums">· {s.durationS < 10 ? `${s.durationS.toFixed(1)}s` : formatDuration(s.durationS)}</span> : null}
          {s.licenseState !== 'cleared' && (
            <Tip content={state.hint}>
              <span className={cn('rounded-full px-1.5 py-px font-medium', state.tone)}>{state.label}</span>
            </Tip>
          )}
        </div>
      </div>
      <div className="flex items-center opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Tip content="Put on a new edit">
          <Button size="icon-sm" variant="ghost" aria-label="Open in the editor" loading={editor.isPending || (toLibrary.isPending && !s.asset)} onClick={() => void edit()}>
            <Clapperboard className="size-4" />
          </Button>
        </Tip>
        {s.builtinId ? (
          <Tip content="Add to my library">
            <Button size="icon-sm" variant="ghost" aria-label="Add to my library" loading={toLibrary.isPending} onClick={() => void save()}>
              <FolderPlus className="size-4" />
            </Button>
          </Tip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {s.asset && (
                <DropdownMenuItem asChild>
                  <Link href={`/library/${s.asset.id}`}>Open in library</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem destructive onSelect={() => setRemoving(true)}>
                <Trash2 /> Remove from sounds
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Confirm open={removing} onOpenChange={setRemoving} title={`Remove “${s.name}”?`} description="The file stays in the Library and in any edit that uses it." confirmLabel="Remove" destructive onConfirm={() => remove.mutate()} />
    </div>
  );
}

/* ---------------------------------- Stems ---------------------------------- */

export function StemsPanel() {
  const { model } = useCapabilityModel('stems');
  const [input, setInput] = useState<AssetView | null>(null);
  const problems = [!input ? 'Pick a song or a video with music.' : input.status !== 'ready' ? 'Wait for the file to finish processing.' : ''].filter(Boolean);
  return (
    <div className={studioColumns}>
      <Composer>
        <p className="text-sm text-muted-foreground">Splits a track into vocals, drums, bass and everything else. Mute the vocals for a clean bed under your voice-over, or keep only the drums to cut to.</p>
        <AssetSlot label="Song or video" types={['audio', 'video']} value={input} onChange={setInput} required />
        <Notice tone="warning">Splitting a track does not change its license. Only split music you have the rights to use.</Notice>
        <RunBar model={model} input={{ capability: 'stems', params: { prompt: '', ...(input ? { audioAssetId: input.id } : {}) } }} problems={problems} label="Split into stems" icon={<Scissors className="size-4" />} />
      </Composer>
      <AudioFeed capabilities={['stems']} emptyTitle="No stems yet" emptyDescription="Each split gives you four files you can mix separately in the editor." />
    </div>
  );
}
