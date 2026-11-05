'use client';

import { TimelineComposition } from '@adforge/compositions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Thumbnail } from '@remotion/player';
import { LayoutTemplate, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildTemplate, timelineOps, type AspectRatio } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { api, errorMessage } from '@/lib/api-client';
import type { TemplateView } from '@/lib/types';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<TemplateView['category'], string> = { ugc: 'UGC', product: 'Product', promo: 'Promo', story: 'Story', 'social-proof': 'Social proof', mine: 'Mine' };
const OPTIONS = { showPlaceholders: true, soloTrackIds: [] as string[] };

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ items: TemplateView[] }>('/templates').then((r) => r.items), staleTime: 5 * 60_000 });
}

/** A real frame of a built-in template, drawn by the same renderer the export uses. */
function TemplateFrame({ id, aspect }: { id: string; aspect: AspectRatio }) {
  const tl = useMemo(() => buildTemplate(id, aspect), [id, aspect]);
  const duration = Math.max(1, timelineOps.timelineDuration(tl));
  const props = useMemo(() => ({ timeline: tl, assets: {}, options: OPTIONS }), [tl]);
  return (
    <Thumbnail
      component={TimelineComposition}
      inputProps={props}
      frameToDisplay={Math.min(duration - 1, Math.round(tl.fps * 1.2))}
      durationInFrames={duration}
      fps={tl.fps}
      compositionWidth={tl.width}
      compositionHeight={tl.height}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function TemplateGallery({ aspect, onUse, busyId, compact }: { aspect: AspectRatio; onUse: (t: TemplateView) => void; busyId?: string | null; compact?: boolean }) {
  const qc = useQueryClient();
  const templates = useTemplates();
  const [category, setCategory] = useState<'all' | TemplateView['category']>('all');
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['templates'] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const items = templates.data ?? [];
  const categories = (['ugc', 'product', 'promo', 'story', 'social-proof', 'mine'] as const).filter((c) => items.some((t) => t.category === c));
  const shown = category === 'all' ? items : items.filter((t) => t.category === category);
  const [w, h] = aspect.split(':').map(Number) as [number, number];

  if (templates.isError) return <Notice tone="error">{errorMessage(templates.error)}</Notice>;
  return (
    <div className="space-y-4">
      {categories.length > 1 && <Segmented size="sm" value={category} onChange={setCategory} options={[{ value: 'all' as const, label: 'All' }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />}
      {templates.isPending ? (
        <div className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5')}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
          ))}
        </div>
      ) : !shown.length ? (
        <EmptyState icon={<LayoutTemplate className="size-5" />} title="No templates here" description="Save any edit as a template from the editor's menu." />
      ) : (
        <div className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5')}>
          {shown.map((t) => (
            <div key={t.id} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-primary/40">
              <button type="button" onClick={() => onUse(t)} disabled={!!busyId} className="relative block w-full overflow-hidden bg-black" style={{ aspectRatio: t.builtin ? `${w} / ${h}` : (t.aspect ?? '9:16').replace(':', ' / ') }} aria-label={`Use ${t.name}`}>
                {t.builtin ? (
                  <TemplateFrame id={t.id} aspect={aspect} />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/30 via-surface to-brand/20 p-3 text-center">
                    <LayoutTemplate className="size-6 text-primary" />
                    <span className="text-xs font-medium">{t.name}</span>
                  </div>
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">{busyId === t.id ? 'Opening…' : 'Use template'}</span>
              </button>
              <div className="flex flex-1 items-start gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="line-clamp-2 text-[11px] text-muted-foreground">
                    {Math.round(t.durationS)}s{t.aspect && !t.builtin ? ` · ${t.aspect}` : ''} · {t.description || CATEGORY_LABEL[t.category]}
                  </div>
                </div>
                {!t.builtin && (
                  <Confirm title={`Delete “${t.name}”?`} description="Edits made from it are not affected." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync(t.id)}>
                    <Button size="icon-xs" variant="ghost" aria-label="Delete template">
                      <Trash2 />
                    </Button>
                  </Confirm>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
