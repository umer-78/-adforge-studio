'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clapperboard, FlaskConical, Megaphone, Play, RefreshCw, Save, Send, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CAPTION_STYLES, formatUsd } from '@adforge/core';
import { VideoPlayer } from '@/components/app/media-player';
import { useVoices } from '@/components/app/voice-picker';
import { DIMENSION_LABEL, type Dimension } from '@/components/growth/labels';
import { isBusy, JobLine, StatusPill } from '@/components/growth/shared';
import { useVariantBatch } from '@/components/growth/use-growth';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { VariantBatchView, VariantView } from '@/lib/types';
import { cn, qs } from '@/lib/utils';

type Editable = Pick<VariantView, 'label' | 'hook' | 'cta' | 'voiceStyle' | 'captionStyleId' | 'musicMood' | 'firstShot' | 'hypothesis'>;
const FIELD_FOR: Partial<Record<Dimension, keyof Editable>> = { hook: 'hook', cta: 'cta', voice: 'voiceStyle', music: 'musicMood', caption_style: 'captionStyleId', first_shot: 'firstShot' };

export function VariantBatchDetail({ id }: { id: string }) {
  const q = useVariantBatch(id);
  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.isError || !q.data) return <EmptyState title="Batch not found" description={q.error ? errorMessage(q.error) : 'It may have been deleted.'} action={<Button asChild variant="outline"><Link href="/variants">Back to Variants</Link></Button>} />;
  return <Loaded b={q.data} />;
}

function Loaded({ b }: { b: VariantBatchView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<number, Partial<Editable>>>({});
  const [name, setName] = useState(b.name);
  const update = (next: VariantBatchView) => {
    qc.setQueryData(['variant', b.id], next);
    qc.invalidateQueries({ queryKey: ['variants'] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<VariantBatchView>(`/variants/${b.id}`, body),
    onSuccess: (next) => {
      update(next);
      setEdits({});
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const render = useMutation({ mutationFn: () => api.post<VariantBatchView>(`/variants/${b.id}/render`), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const replan = useMutation({ mutationFn: () => api.post<VariantBatchView>(`/variants/${b.id}/replan`), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({
    mutationFn: () => api.delete(`/variants/${b.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['variants'] });
      router.push('/variants');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const dirty = Object.keys(edits).length > 0;
  const editable = b.status === 'ready';
  const todo = b.variants.filter((v) => v.status === 'planned' || v.status === 'failed').length;
  const done = b.variants.filter((v) => v.status === 'done' && v.assetId);
  const canReplan = b.status !== 'planning' && b.variants.every((v) => v.status === 'planned' || v.status === 'failed');
  const busy = b.status === 'planning' || b.status === 'rendering' || isBusy(b.job);
  const saveEdits = () =>
    patch.mutate({
      updates: Object.entries(edits).map(([index, e]) => ({
        index: Number(index),
        ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'string' ? (k === 'label' || k === 'hypothesis' ? v.trim() : v.trim() || null) : v])),
      })),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href="/variants" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Variants
          </Link>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== b.name && patch.mutate({ name: name.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              maxLength={200}
              aria-label="Batch name"
              className="h-auto max-w-xl border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:px-2"
            />
            <StatusPill status={b.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {b.sourceTimelineId ? (
              <Link href={`/editor/${b.sourceTimelineId}`} className="hover:text-primary">
                From {b.sourceTimelineName ?? 'edit'}
              </Link>
            ) : (
              <span>Source edit deleted</span>
            )}
            <span>·</span>
            <span>Varies {b.dimensions.map((d) => DIMENSION_LABEL[d as Dimension]?.label.toLowerCase() ?? d).join(', ')}</span>
            {b.costEstimateUsd != null && (
              <>
                <span>·</span>
                <span>≈ {formatUsd(b.costEstimateUsd)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReplan && (
            <Confirm title="Plan these variants again?" description="Your edits to the current plan are replaced. Planning is charged again." confirmLabel="Plan again" onConfirm={() => replan.mutateAsync()}>
              <Button variant="outline" size="sm" disabled={busy}>
                <RefreshCw className="size-4" /> Plan again
              </Button>
            </Confirm>
          )}
          <Confirm title="Delete this batch?" description="Rendered videos stay in your library and any posts or ads made from them keep running." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
            <Button variant="ghost" size="icon-sm" aria-label="Delete batch" disabled={busy}>
              <Trash2 className="size-4" />
            </Button>
          </Confirm>
        </div>
      </div>

      {b.status === 'planning' && (
        <div className="rounded-2xl border bg-card p-5">
          <JobLine job={b.job} label="Planning variants" />
        </div>
      )}
      {b.status === 'failed' && b.error && <Notice tone="error" title="Something went wrong">{b.error}</Notice>}

      {b.variants.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4">
          <div className="min-w-0 flex-1 text-sm">
            {b.status === 'rendering' ? (
              <span>
                Rendering… {done.length}/{b.variants.length} ready
              </span>
            ) : todo ? (
              <span>
                Review the plan, then render {todo} variant{todo === 1 ? '' : 's'}. Each renders as its own edit.
              </span>
            ) : (
              <span>All {b.variants.length} variants are rendered. Test them against each other.</span>
            )}
          </div>
          {dirty && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEdits({})}>
                Discard
              </Button>
              <Button size="sm" loading={patch.isPending} onClick={saveEdits}>
                <Save className="size-4" /> Save changes
              </Button>
            </>
          )}
          {todo > 0 && (
            <Button variant="brand" size="sm" loading={render.isPending} disabled={dirty || busy} onClick={() => render.mutate()}>
              <Play className="size-4" /> Render {todo}
            </Button>
          )}
          {done.length >= 2 && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/publish${qs({ assets: done.map((v) => v.assetId!).join(','), abGroup: b.abGroup })}`}>
                  <Send className="size-4" /> Post as A/B test
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/ads/new${qs({ batch: b.id })}`}>
                  <Megaphone className="size-4" /> Launch as ads
                </Link>
              </Button>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {b.variants.map((v, i) => (
          <VariantCard
            key={`${i}-${v.label}`}
            index={i}
            v={v}
            batch={b}
            editable={editable && v.status === 'planned'}
            edit={edits[i] ?? {}}
            onEdit={(e) => setEdits((all) => ({ ...all, [i]: { ...all[i], ...e } }))}
            onRemove={b.variants.length > 2 && editable && !dirty && v.status === 'planned' ? () => patch.mutate({ remove: [i] }) : undefined}
          />
        ))}
        {b.status === 'planning' &&
          !b.variants.length &&
          Array.from({ length: b.count }, (_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    </div>
  );
}

function VariantCard({ index, v, batch, editable, edit, onEdit, onRemove }: { index: number; v: VariantView; batch: VariantBatchView; editable: boolean; edit: Partial<Editable>; onEdit: (e: Partial<Editable>) => void; onRemove?: () => void }) {
  const voices = useVoices();
  const val = <K extends keyof Editable>(k: K): Editable[K] => (k in edit ? (edit[k] as Editable[K]) : v[k]);
  const dims = batch.dimensions as Dimension[];
  const voiceName = v.voiceId ? (voices.data?.find((x) => x.providerVoiceId === v.voiceId)?.name ?? 'Voice') : null;
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card animate-in fade-in slide-in-from-bottom-2', Object.keys(edit).length > 0 && 'border-primary/50')} style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
      {v.asset ? (
        <VideoPlayer playback={v.asset.playback} src={v.asset.proxyUrl ?? v.asset.url} poster={v.asset.thumbnailUrl} className="aspect-[9/16] max-h-96 w-full bg-black" />
      ) : v.status === 'building' || v.status === 'rendering' ? (
        <div className="flex aspect-[9/16] max-h-96 w-full flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" /> {v.status === 'building' ? 'Building the edit…' : 'Rendering…'}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          {editable ? (
            <Input value={val('label')} onChange={(e) => onEdit({ label: e.target.value })} maxLength={40} className="h-8 max-w-48 font-medium" aria-label="Variant name" />
          ) : (
            <div className="font-medium">{v.label}</div>
          )}
          <StatusPill status={v.status} className="ml-auto" />
          {onRemove && (
            <Confirm title={`Remove ${v.label}?`} description="It is dropped from the plan before rendering." confirmLabel="Remove" destructive onConfirm={onRemove}>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${v.label}`}>
                <X className="size-3.5" />
              </Button>
            </Confirm>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5 text-xs">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {editable ? <Textarea rows={2} value={val('hypothesis')} onChange={(e) => onEdit({ hypothesis: e.target.value })} maxLength={500} className="min-h-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0" aria-label="Hypothesis" /> : <span>{v.hypothesis || 'No hypothesis.'}</span>}
        </div>
        {dims.map((d) => {
          const key = FIELD_FOR[d];
          if (!key) return null;
          const label = DIMENSION_LABEL[d].label;
          if (d === 'caption_style')
            return (
              <Field key={d} label={label}>
                {editable ? (
                  <Select value={val('captionStyleId') ?? 'none'} onValueChange={(x) => onEdit({ captionStyleId: x === 'none' ? null : x })} size="sm" options={[{ value: 'none', label: 'Keep the original' }, ...CAPTION_STYLES.map((c) => ({ value: c.id, label: c.label }))]} />
                ) : (
                  <p className="text-sm">{CAPTION_STYLES.find((c) => c.id === v.captionStyleId)?.label ?? 'Original'}</p>
                )}
              </Field>
            );
          if (d === 'voice')
            return (
              <Field key={d} label={voiceName ? `Voice: ${voiceName}` : label} hint={editable ? 'How this voice should deliver the lines' : undefined}>
                {editable ? <Input value={val('voiceStyle') ?? ''} onChange={(e) => onEdit({ voiceStyle: e.target.value })} maxLength={300} className="h-8" /> : <p className="text-sm">{v.voiceStyle ?? '–'}</p>}
              </Field>
            );
          const max = key === 'cta' ? 120 : key === 'musicMood' ? 80 : 300;
          return (
            <Field key={d} label={label}>
              {editable ? (
                key === 'hook' || key === 'firstShot' ? (
                  <Textarea rows={2} value={(val(key) as string | null) ?? ''} onChange={(e) => onEdit({ [key]: e.target.value })} maxLength={max} />
                ) : (
                  <Input value={(val(key) as string | null) ?? ''} onChange={(e) => onEdit({ [key]: e.target.value })} maxLength={max} className="h-8" />
                )
              ) : (
                <p className="text-sm">{(v[key] as string | null) ?? '–'}</p>
              )}
            </Field>
          );
        })}
        {v.notes.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {v.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {v.status === 'failed' && v.error && <p className="text-xs text-destructive">{v.error}</p>}
        {(v.timelineId || v.assetId) && (
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
            {v.timelineId && (
              <Button variant="ghost" size="xs" asChild>
                <Link href={`/editor/${v.timelineId}`}>
                  <Clapperboard className="size-3.5" /> Edit
                </Link>
              </Button>
            )}
            {v.assetId && (
              <Button variant="ghost" size="xs" asChild>
                <Link href={`/library/${v.assetId}`}>Open in library</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
