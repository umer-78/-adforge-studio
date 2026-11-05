'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Copy, Film, Image as ImageIcon, Mic, Search, Square, Trash2, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { EnhancedPrompt } from '@adforge/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useDictation } from '@/lib/hooks/use-dictation';
import { cn, copyText, timeAgo } from '@/lib/utils';

interface PromptRow {
  id: string;
  title: string | null;
  idea: string;
  mode: 'ad' | 'cinematic';
  platform: string | null;
  prompt: string;
  negative_prompt: string | null;
  structured: Partial<EnhancedPrompt>;
  is_saved: boolean;
  created_at: string;
}
type Result = EnhancedPrompt & { id: string | null };

const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest'];

export function PromptsView() {
  const qc = useQueryClient();
  const [idea, setIdea] = useState('');
  const [mode, setMode] = useState<'ad' | 'cinematic'>('ad');
  const [platform, setPlatform] = useState('tiktok');
  const [aspect, setAspect] = useState('9:16');
  const [duration, setDuration] = useState('15');
  const [result, setResult] = useState<Result | null>(null);
  const [parentId, setParentId] = useState<string | undefined>();
  const [tab, setTab] = useState<'saved' | 'history'>('history');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const dict = useDictation((text, final) => final && setIdea((v) => `${v}${v && !/\s$/.test(v) ? ' ' : ''}${text.trim()}`));

  const list = useQuery({ queryKey: ['prompts', tab, dq], queryFn: () => api.get<{ items: PromptRow[] }>(`/prompts?${tab === 'saved' ? 'saved=1&' : ''}${dq ? `q=${encodeURIComponent(dq)}` : ''}`).then((r) => r.items) });
  const enhance = useMutation({
    mutationFn: (input: { idea: string; parentId?: string }) => api.post<Result>('/prompts/enhance', { idea: input.idea, mode, platform: mode === 'ad' ? platform : undefined, aspect, durationS: Number(duration), parentId: input.parentId, save: true }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const save = useMutation({
    mutationFn: (v: { id: string; isSaved: boolean }) => api.patch(`/prompts/${v.id}`, { isSaved: v.isSaved }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['prompts'] }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/prompts/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['prompts'] }) });
  const fromRow = (r: PromptRow) => {
    setIdea(r.idea);
    setMode(r.mode);
    if (r.structured?.prompt) setResult({ ...(r.structured as EnhancedPrompt), id: r.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const current = result?.id ? list.data?.find((r) => r.id === result.id) : undefined;

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <Field label="Your idea">
            <div className="relative">
              <Textarea rows={6} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="girl unboxing our matte black water bottle at the gym, surprised it keeps ice for 24h" className="pr-12 text-[15px]" />
              <Button type="button" size="icon-sm" variant={dict.listening ? 'brand' : 'ghost'} className="absolute top-2 right-2" aria-label="Dictate" onClick={dict.toggle} loading={dict.busy}>
                {dict.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
              </Button>
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mode">
              <Segmented value={mode} onChange={setMode} options={[{ value: 'ad', label: 'Ad' }, { value: 'cinematic', label: 'Cinematic' }]} />
            </Field>
            {mode === 'ad' && (
              <Field label="Platform">
                <Select value={platform} onValueChange={setPlatform} options={PLATFORMS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} />
              </Field>
            )}
            <Field label="Aspect">
              <Segmented size="sm" value={aspect} onChange={setAspect} options={['9:16', '1:1', '4:5', '16:9'].map((a) => ({ value: a, label: a }))} />
            </Field>
            <Field label="Length">
              <Segmented size="sm" value={duration} onChange={setDuration} options={['6', '15', '30', '60'].map((d) => ({ value: d, label: `${d}s` }))} />
            </Field>
          </div>
          <Button variant="brand" className="w-full" size="lg" loading={enhance.isPending} disabled={idea.trim().length < 2} onClick={() => (setParentId(undefined), enhance.mutate({ idea }))}>
            <WandSparkles className="size-4" /> Enhance
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          {enhance.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32" />
              <Skeleton className="h-20" />
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{result.title}</h2>
                <div className="flex gap-1">
                  {result.id && (
                    <Button size="icon-sm" variant="ghost" aria-label="Save to library" onClick={() => save.mutate({ id: result.id!, isSaved: !current?.is_saved })}>
                      {current?.is_saved ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label="Copy" onClick={() => void copyText(result.prompt).then(() => toast.success('Copied'))}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {result.hook && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <span className="font-medium text-primary">Hook (0–3 s): </span>
                  {result.hook}
                </div>
              )}
              <p className="rounded-xl bg-surface-2 p-4 text-[15px] leading-relaxed">{result.prompt}</p>
              {result.negativePrompt && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">Avoid: </span>
                  {result.negativePrompt}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {Object.entries(result.style).map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-2">
                    <div className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
              {result.shotList.length > 0 && (
                <ol className="space-y-1 text-sm">
                  {result.shotList.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <Badge variant="outline">{s.durationS}s</Badge>
                      <span>{s.shot}</span>
                      <span className="text-muted-foreground">· {s.camera}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Variations</div>
                {result.variations.map((v, i) => (
                  <button key={i} type="button" className="w-full rounded-lg border p-2.5 text-left text-[13px] transition hover:border-primary/50" onClick={() => setResult({ ...result, prompt: v, variations: [result.prompt, ...result.variations.filter((x) => x !== v)] })}>
                    {v}
                  </button>
                ))}
              </div>
              {result.notes && <p className="text-xs text-muted-foreground">{result.notes}</p>}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button variant="brand" size="sm" asChild>
                  <Link href={`/generate?mode=t2v&prompt=${encodeURIComponent(result.prompt)}`}>
                    <Film className="size-4" /> Make the video
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/photo?prompt=${encodeURIComponent(result.prompt)}`}>
                    <ImageIcon className="size-4" /> Make an image
                  </Link>
                </Button>
                <Button variant="outline" size="sm" loading={enhance.isPending} onClick={() => (setParentId(result.id ?? undefined), enhance.mutate({ idea: result.prompt, parentId: result.id ?? parentId }))}>
                  <WandSparkles className="size-4" /> Improve again
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={<WandSparkles />} title="Your enhanced prompt appears here" description="Type or dictate a rough idea. You get a production-ready prompt, a shot list and three alternative angles." className="h-full border-0" />
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'history', label: 'History' }, { value: 'saved', label: 'Saved' }]} />
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts" className="pl-9" />
          </div>
        </div>
        {list.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !list.data?.length ? (
          <EmptyState title={tab === 'saved' ? 'No saved prompts' : 'No prompts yet'} description={tab === 'saved' ? 'Bookmark the prompts that work to reuse them later.' : 'Every prompt you enhance is kept here.'} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data.map((r) => (
              <div key={r.id} className={cn('group flex flex-col gap-2 rounded-xl border bg-card p-4', result?.id === r.id && 'border-primary')}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="text-left text-sm font-medium hover:text-primary" onClick={() => fromRow(r)}>
                    {r.title ?? r.idea.slice(0, 60)}
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="icon-xs" variant="ghost" aria-label={r.is_saved ? 'Unsave' : 'Save'} onClick={() => save.mutate({ id: r.id, isSaved: !r.is_saved })}>
                      {r.is_saved ? <BookmarkCheck className="size-3.5 text-primary" /> : <Bookmark className="size-3.5" />}
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Delete" className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{r.prompt}</p>
                <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <Badge variant="outline">{r.mode}</Badge>
                  {r.platform && <span>{r.platform}</span>}
                  <span className="ml-auto">{timeAgo(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
