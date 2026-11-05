'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Box, FolderOpen, Layers, Music, Palette, Pause, Play, Plus, Search, Shapes, Sparkles, Type, Upload, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FONT_FAMILIES, formatDuration, googleFontsHref, MOTION_TEMPLATES, SFX_CATEGORIES, type MotionTemplateDef } from '@adforge/core';
import { AssetThumb } from '@/components/app/asset-card';
import { sfxCategoryLabel } from '@/components/music/add-audio-dialog';
import { LICENSE_STATE, useMusic, useSfx } from '@/components/music/use-music';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api-client';
import { useBrandKits } from '@/lib/hooks/use-brand-kits';
import type { AssetView, Page } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cn, qs } from '@/lib/utils';
import { addAdjustment, addAsset, addBuiltinSfx, addMotion, addShape, addText, addWatermark } from './actions';
import { SHAPES, TEXT_PRESETS } from './presets';
import { useEditor } from './store';
import { endDrag, startDrag, type DragItem } from './utils';

type Tab = 'media' | 'text' | 'motion' | 'audio' | 'elements' | 'brand';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'motion', label: 'Motion', icon: Box },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'brand', label: 'Brand', icon: Palette },
];

const ALL_FONTS_HREF = googleFontsHref(FONT_FAMILIES.map((f) => f.family));

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Draggable tile: drag onto the timeline, or click the button to add at the playhead. */
function Draggable({ item, onAdd, children, className, title }: { item: DragItem; onAdd: () => void; children: ReactNode; className?: string; title?: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => startDrag(e, item)}
      onDragEnd={endDrag}
      onDoubleClick={onAdd}
      title={title}
      className={cn('group/tile relative cursor-grab overflow-hidden rounded-lg border bg-surface-2 transition hover:border-primary/50 active:cursor-grabbing', className)}
    >
      {children}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add to timeline"
        className="absolute top-1.5 right-1.5 z-[2] flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition group-hover/tile:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function MediaPanel() {
  const [tab, setTab] = useState<Tab>('media');
  return (
    <div className="flex h-full min-h-0">
      {ALL_FONTS_HREF && <link rel="stylesheet" href={ALL_FONTS_HREF} precedence="default" />}
      <nav className="flex w-[3.75rem] shrink-0 flex-col items-center gap-1 border-r py-2" aria-label="Media panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn('flex w-12 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground', tab === t.id && 'bg-accent text-foreground')}
            aria-pressed={tab === t.id}
          >
            <t.icon className={cn('size-4', tab === t.id && 'text-primary')} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {tab === 'media' && <MediaTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'motion' && <MotionTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'elements' && <ElementsTab />}
        {tab === 'brand' && <BrandTab />}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-[13px]" />
    </div>
  );
}

function MediaTab() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const query = useDebounced(q);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const list = useInfiniteQuery({
    queryKey: ['assets', 'editor-media', type, query],
    queryFn: ({ pageParam }) => api.get<Page<AssetView>>(`/assets${qs({ type: type === 'all' ? undefined : type, q: query || undefined, limit: 40, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []).filter((a) => a.type !== 'model3d' && !a.tags.includes('lut'));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox value={q} onChange={setQ} placeholder="Search your library" />
        </div>
        <Tip content="Upload files">
          <Button size="icon-sm" variant="secondary" onClick={() => input.current?.click()} aria-label="Upload files">
            <Upload />
          </Button>
        </Tip>
        <input
          ref={input}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void startUploads(files, { queryClient: qc });
            e.target.value = '';
          }}
        />
      </div>
      <Segmented
        size="sm"
        value={type}
        onChange={setType}
        options={[
          { value: 'all', label: 'All' },
          { value: 'video', label: 'Video' },
          { value: 'image', label: 'Photo' },
          { value: 'audio', label: 'Audio' },
        ]}
      />
      {list.isPending ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title={query ? 'Nothing matches' : 'Your library is empty'} description="Upload, record or generate files, then drag them onto the timeline." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((a) => (
            <Draggable key={a.id} item={{ kind: 'asset', asset: a }} onAdd={() => addAsset(a)} title={a.name}>
              <AssetThumb asset={a} className="aspect-square" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-[10px] text-white">
                <div className="truncate font-medium">{a.name}</div>
                {a.durationS != null && <div className="opacity-75">{formatDuration(a.durationS)}</div>}
              </div>
            </Draggable>
          ))}
        </div>
      )}
      {list.hasNextPage && (
        <Button variant="ghost" size="sm" className="w-full" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  );
}

function TextTab() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Drag a style onto the timeline, or press + to add it at the playhead.</p>
      <div className="grid grid-cols-1 gap-2">
        {TEXT_PRESETS.map((p) => (
          <Draggable key={p.id} item={{ kind: 'text', presetId: p.id }} onAdd={() => addText(p.id)} className="flex min-h-16 flex-col justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 px-3 py-2.5">
            <span className="text-[10px] font-medium tracking-wide text-white/50 uppercase">{p.label}</span>
            <span
              className="truncate text-lg leading-tight"
              style={{
                fontFamily: `"${p.style.fontFamily ?? 'Geist'}", sans-serif`,
                fontWeight: p.style.fontWeight ?? 700,
                fontStyle: p.style.italic ? 'italic' : undefined,
                textTransform: p.style.uppercase ? 'uppercase' : undefined,
                color: p.style.color && p.style.color !== '#0B0B12' ? p.style.color : '#FFFFFF',
                background: p.style.backgroundColor ?? (p.id === 'highlight' ? p.style.highlightColor : undefined),
                padding: p.style.backgroundColor || p.id === 'highlight' ? '0 0.35em' : undefined,
                borderRadius: p.style.backgroundColor ? 999 : undefined,
                textShadow: p.style.shadowColor && (p.style.shadowBlur ?? 0) > 20 ? `0 0 ${(p.style.shadowBlur ?? 0) / 2}px ${p.style.shadowColor}` : undefined,
                alignSelf: 'flex-start',
                maxWidth: '100%',
              }}
            >
              {p.id === 'highlight' ? <span style={{ color: '#0B0B12' }}>{p.text}</span> : p.text}
            </span>
          </Draggable>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<MotionTemplateDef['category'], string> = { title: 'Titles', commerce: 'Commerce', social: 'Social', brand: 'Brand', data: 'Data', utility: 'Utility' };

function MotionTab() {
  const [category, setCategory] = useState<'all' | MotionTemplateDef['category']>('all');
  const categories = [...new Set(MOTION_TEMPLATES.map((t) => t.category))];
  const list = MOTION_TEMPLATES.filter((t) => category === 'all' || t.category === category);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(['all', ...categories] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] transition', category === c ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {list.map((t) => (
          <Draggable key={t.id} item={{ kind: 'motion', templateId: t.id }} onAdd={() => addMotion(t.id)} className="flex items-start gap-2.5 p-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30">
              <Sparkles className="size-4 text-violet-100" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{t.name}</span>
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{t.description}</span>
            </span>
          </Draggable>
        ))}
      </div>
    </div>
  );
}

let previewAudio: HTMLAudioElement | null = null;

/** One shared preview player for the panel, so starting a sound stops the last one. */
function PreviewButton({ src }: { src: string | null | undefined }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const stop = () => setPlaying(false);
    window.addEventListener('af:panel-preview', stop);
    return () => window.removeEventListener('af:panel-preview', stop);
  }, []);
  if (!src) return null;
  return (
    <button
      type="button"
      aria-label={playing ? 'Stop preview' : 'Play preview'}
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary transition hover:bg-primary/25"
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new Event('af:panel-preview'));
        if (playing) {
          previewAudio?.pause();
          return;
        }
        previewAudio?.pause();
        previewAudio = new Audio(src);
        previewAudio.onended = () => setPlaying(false);
        void previewAudio.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }}
    >
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
    </button>
  );
}

function AudioTab() {
  const [kind, setKind] = useState<'music' | 'sfx' | 'voice'>('music');
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  useEffect(() => () => previewAudio?.pause(), []);
  return (
    <div className="space-y-3">
      <Segmented
        size="sm"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'music', label: 'Music' },
          { value: 'sfx', label: 'Effects' },
          { value: 'voice', label: 'Voice' },
        ]}
      />
      <SearchBox value={q} onChange={setQ} placeholder={kind === 'music' ? 'Mood, genre or title' : kind === 'sfx' ? 'Whoosh, pop, riser…' : 'Search voice-overs'} />
      {kind === 'music' && <MusicList q={query} />}
      {kind === 'sfx' && <SfxList q={query} />}
      {kind === 'voice' && <VoiceList q={query} />}
    </div>
  );
}

function AudioRow({ title, meta, src, item, onAdd, badge }: { title: string; meta: string; src: string | null | undefined; item: DragItem; onAdd: () => void; badge?: ReactNode }) {
  return (
    <Draggable item={item} onAdd={onAdd} className="flex items-center gap-2 p-2 pr-9">
      <PreviewButton src={src} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {meta}
          {badge}
        </span>
      </span>
    </Draggable>
  );
}

function MusicList({ q }: { q: string }) {
  const [cleared, setCleared] = useState(true);
  const music = useMusic('all', q, { cleared });
  const items = music.data?.pages.flatMap((p) => p.items).filter((m) => m.asset) ?? [];
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        Only tracks cleared for ads
        <Switch checked={cleared} onCheckedChange={setCleared} />
      </label>
      {music.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Music />} title="No music yet" description="Add licensed tracks or generate music in Music & SFX." />
      ) : (
        items.map((m) => (
          <AudioRow
            key={m.id}
            title={m.title}
            meta={[m.mood, m.genre, m.durationS ? formatDuration(m.durationS) : null, m.bpm ? `${Math.round(m.bpm)} bpm` : null].filter(Boolean).join(' · ')}
            src={m.asset!.url}
            item={{ kind: 'asset', asset: m.asset! }}
            onAdd={() => addAsset(m.asset!)}
            badge={m.licenseState !== 'cleared' ? <span className={cn('rounded px-1 text-[10px]', LICENSE_STATE[m.licenseState].tone)}>{LICENSE_STATE[m.licenseState].label}</span> : null}
          />
        ))
      )}
      {music.hasNextPage && (
        <Button variant="ghost" size="sm" className="w-full" loading={music.isFetchingNextPage} onClick={() => void music.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  );
}

function SfxList({ q }: { q: string }) {
  const [category, setCategory] = useState<string | null>(null);
  const sfx = useSfx(q, category);
  const mine = sfx.data?.mine ?? [];
  const builtin = sfx.data?.builtin ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {[null, ...SFX_CATEGORIES.filter((c) => c !== 'generated')].map((c) => (
          <button key={c ?? 'all'} type="button" onClick={() => setCategory(c)} className={cn('rounded-full border px-2 py-0.5 text-[11px] transition', category === c ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {c ? sfxCategoryLabel(c) : 'All'}
          </button>
        ))}
      </div>
      {sfx.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : (
        <>
          {mine.map((s) =>
            s.asset ? <AudioRow key={s.id} title={s.name} meta={`${sfxCategoryLabel(s.category)}${s.durationS ? ` · ${s.durationS.toFixed(1)}s` : ''}`} src={s.asset.url} item={{ kind: 'asset', asset: s.asset }} onAdd={() => addAsset(s.asset!)} /> : null,
          )}
          {builtin.map((s) => (
            <AudioRow
              key={s.id}
              title={s.name}
              meta={`${sfxCategoryLabel(s.category)}${s.durationS ? ` · ${s.durationS.toFixed(1)}s` : ''} · Built in`}
              src={s.url}
              item={{ kind: 'sfx', builtinId: s.builtinId!, name: s.name, durationS: s.durationS }}
              onAdd={() => void addBuiltinSfx(s.builtinId!)}
            />
          ))}
          {!mine.length && !builtin.length && <EmptyState icon={<AudioLines />} title="No sounds match" />}
        </>
      )}
    </div>
  );
}

function VoiceList({ q }: { q: string }) {
  const voices = useQuery({
    queryKey: ['assets', 'editor-voice', q],
    queryFn: () => api.get<Page<AssetView>>(`/assets${qs({ type: 'audio', role: q ? undefined : 'voice', q: q || undefined, limit: 60 })}`),
  });
  const items = (voices.data?.items ?? []).filter((a) => !q || a.role === 'voice' || a.source === 'recording');
  if (voices.isPending) return <Skeleton className="h-40 rounded-lg" />;
  if (!items.length) return <EmptyState icon={<AudioLines />} title="No voice-overs yet" description="Make one in Voice-over, or record yourself." />;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <AudioRow key={a.id} title={a.name} meta={a.durationS ? formatDuration(a.durationS) : 'Processing…'} src={a.url} item={{ kind: 'asset', asset: a }} onAdd={() => addAsset(a)} />
      ))}
    </div>
  );
}

function ElementsTab() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Shapes</div>
        <div className="grid grid-cols-3 gap-2">
          {SHAPES.map((s) => (
            <Draggable key={s.shape} item={{ kind: 'shape', shape: s.shape }} onAdd={() => addShape(s.shape)} className="flex aspect-square flex-col items-center justify-center gap-1.5">
              <ShapeIcon shape={s.shape} />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </Draggable>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Layers</div>
        <Draggable item={{ kind: 'adjustment' }} onAdd={() => addAdjustment()} className="flex items-start gap-2.5 p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-zinc-500/25">
            <Layers className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Adjustment layer</span>
            <span className="text-[11px] text-muted-foreground">Color grade, blur or film look on everything below it.</span>
          </span>
        </Draggable>
      </div>
    </div>
  );
}

function ShapeIcon({ shape }: { shape: (typeof SHAPES)[number]['shape'] }) {
  const cls = 'size-8 text-primary';
  switch (shape) {
    case 'rect':
      return <span className={cn(cls, 'rounded-md bg-current')} />;
    case 'ellipse':
      return <span className={cn(cls, 'rounded-full bg-current')} />;
    case 'triangle':
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <path d="M12 3 22 21H2Z" fill="currentColor" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <path d="m12 2 2.9 6.9 7.1.6-5.4 4.7 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.5l7.1-.6Z" fill="currentColor" />
        </svg>
      );
    case 'line':
      return <span className="h-1 w-8 rounded-full bg-primary" />;
  }
}

function BrandTab() {
  const kits = useBrandKits();
  const kit = kits.data?.find((k) => k.isDefault) ?? kits.data?.[0];
  const selection = useEditor((s) => s.selection);
  if (kits.isPending) return <Skeleton className="h-48 rounded-lg" />;
  if (!kit) return <EmptyState icon={<Palette />} title="No brand kit yet" description={<>Set up colors, fonts and your logo in <a href="/settings/brand" className="text-primary hover:underline">Settings → Brand kits</a>.</>} />;

  // Applies a brand color to the selected text, shape or caption clips.
  const applyColor = (hex: string) =>
    useEditor.getState().edit((d) => {
      for (const t of d.tracks)
        for (const c of t.clips) {
          if (!selection.includes(c.id)) continue;
          if (c.type === 'text') c.style.color = hex;
          if (c.type === 'shape') c.fill = hex;
          if (c.type === 'captions') c.overrides.activeColor = hex;
        }
    });
  const applyFont = (family: string) =>
    useEditor.getState().edit((d) => {
      for (const t of d.tracks)
        for (const c of t.clips) {
          if (!selection.includes(c.id)) continue;
          if (c.type === 'text') c.style.fontFamily = family;
          if (c.type === 'captions') c.overrides.fontFamily = family;
        }
    });
  const files = [
    { label: 'Logo', asset: kit.logo },
    { label: 'Intro', asset: kit.intro },
    { label: 'Outro', asset: kit.outro },
    { label: 'Watermark', asset: kit.watermarkAsset, add: (a: AssetView) => addWatermark(a, kit.watermark) },
  ].filter((f): f is { label: string; asset: AssetView; add?: (a: AssetView) => string | null } => !!f.asset);

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{kit.name}</div>
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {files.map((f) => (
            <Draggable key={f.label} item={{ kind: 'asset', asset: f.asset }} onAdd={() => (f.add ?? addAsset)(f.asset)} title={f.add ? `${f.asset.name}: adds it over the whole edit, placed as set in the brand kit` : f.asset.name}>
              <AssetThumb asset={f.asset} className="aspect-square" fit="contain" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-medium text-white">{f.label}</div>
            </Draggable>
          ))}
        </div>
      )}
      {kit.colors.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Colors {selection.length ? '· click to apply to the selection' : ''}</div>
          <div className="flex flex-wrap gap-2">
            {kit.colors.map((c) => (
              <button key={c} type="button" title={c} aria-label={`Apply ${c}`} disabled={!selection.length} onClick={() => applyColor(c)} className="size-8 rounded-full border shadow-sm transition enabled:hover:scale-110 disabled:opacity-80" style={{ background: c }} />
            ))}
          </div>
        </div>
      )}
      {(kit.fonts.display || kit.fonts.body) && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Fonts</div>
          {[kit.fonts.display, kit.fonts.body]
            .filter((f): f is string => !!f)
            .map((f) => (
              <button key={f} type="button" disabled={!selection.length} onClick={() => applyFont(f)} className="block w-full truncate rounded-lg border px-3 py-2 text-left text-lg transition enabled:hover:border-primary/50 disabled:opacity-80" style={{ fontFamily: `"${f}", sans-serif` }}>
                {f}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
