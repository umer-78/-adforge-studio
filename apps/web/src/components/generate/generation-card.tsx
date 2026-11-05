'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Clapperboard, Columns2, Download, Ellipsis, ExternalLink, Film, Pause, Play, RotateCcw, Shuffle, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, type Capability } from '@adforge/core';
import { AudioPlayer, VideoPlayer } from '@/components/app/media-player';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import { toAspect, useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView, GenerationView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { CostSummary, formatEta, type EstimateResponse } from './cost-estimate';

const NEEDS_CONSENT = new Set(['avatar', 'lipsync', 'dub']);
const ACTIVE = new Set(['queued', 'running']);

export function GenerationCard({ gen, onRemix, onCompare }: { gen: GenerationView; onRemix?: (g: GenerationView) => void; onCompare?: () => void }) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [rerun, setRerun] = useState(false);
  const editor = useOpenInEditor();
  const out = gen.outputs[Math.min(index, gen.outputs.length - 1)] ?? null;
  const active = ACTIVE.has(gen.status);
  const cancel = useMutation({
    mutationFn: () => api.post(`/generations/${gen.id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['generations'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const favorite = useMutation({
    mutationFn: (a: AssetView) => api.patch(`/assets/${a.id}`, { isFavorite: !a.isFavorite }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['generations'] }),
  });

  return (
    <div className="group overflow-hidden rounded-2xl border bg-card">
      <div className="relative aspect-[4/5] bg-black/90">
        {gen.status === 'succeeded' && out ? (
          <OutputPreview asset={out} />
        ) : active ? (
          <Generating gen={gen} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className={cn('text-sm font-medium', gen.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{gen.status === 'failed' ? 'Generation failed' : gen.status === 'canceled' ? 'Canceled' : 'No output'}</span>
            {gen.error && <p className="line-clamp-4 text-xs text-muted-foreground">{gen.error}</p>}
            {onRemix && (
              <Button size="sm" variant="secondary" onClick={() => onRemix(gen)}>
                <RotateCcw className="size-3.5" /> Edit and retry
              </Button>
            )}
          </div>
        )}
        {gen.outputs.length > 1 && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {gen.outputs.map((o, i) => (
              <button key={o.id} type="button" aria-label={`Output ${i + 1}`} onClick={() => setIndex(i)} className={cn('size-2 rounded-full bg-white/40 transition', i === index && 'w-5 bg-white')} />
            ))}
          </div>
        )}
        {gen.variantGroup && gen.variantIndex != null && <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">Variant {gen.variantIndex + 1}</span>}
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-[13px] text-foreground/90" title={gen.prompt ?? ''}>
          {gen.prompt || <span className="text-muted-foreground">No prompt</span>}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{gen.modelLabel}</span>
          <span>·</span>
          <span className="tabular-nums">{formatUsd(gen.costActualUsd ?? gen.costEstimateUsd)}</span>
          <span>·</span>
          <span className="shrink-0">{timeAgo(gen.createdAt)}</span>
          <div className="ml-auto flex items-center gap-0.5">
            {active ? (
              <Button size="xs" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                <X className="size-3.5" /> Cancel
              </Button>
            ) : (
              <>
                {out && (
                  <Button size="icon-xs" variant="ghost" aria-label={out.isFavorite ? 'Unfavorite' : 'Favorite'} onClick={() => favorite.mutate(out)}>
                    <Star className={cn('size-3.5', out.isFavorite && 'fill-warning text-warning')} />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="ghost" aria-label="More">
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {out && (out.type === 'video' || out.type === 'image') && (
                      <DropdownMenuItem onSelect={() => editor.mutate({ assetIds: [out.id], name: gen.prompt?.slice(0, 60) || 'Generated clip', aspect: toAspect(gen.params.aspect) })}>
                        <Clapperboard /> Use in editor
                      </DropdownMenuItem>
                    )}
                    {out?.type === 'image' && (
                      <DropdownMenuItem asChild>
                        <Link href={`/generate?mode=i2v&image=${out.id}`}>
                          <Film /> Animate this image
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {out?.type === 'model3d' && (
                      <DropdownMenuItem asChild>
                        <Link href={`/motion?model=${out.id}`}>
                          <Box /> Open in 3D studio
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {onRemix && (
                      <DropdownMenuItem onSelect={() => onRemix(gen)}>
                        <Shuffle /> Remix settings
                      </DropdownMenuItem>
                    )}
                    {!NEEDS_CONSENT.has(gen.capability) && (
                      <DropdownMenuItem onSelect={() => setRerun(true)}>
                        <RotateCcw /> Regenerate
                      </DropdownMenuItem>
                    )}
                    {onCompare && (
                      <DropdownMenuItem onSelect={onCompare}>
                        <Columns2 /> Compare variants
                      </DropdownMenuItem>
                    )}
                    {out && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a href={`/api/assets/${out.id}/download`}>
                            <Download /> Download
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/library/${out.id}`}>
                            <ExternalLink /> Open in library
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
      <RegenerateDialog gen={gen} open={rerun} onOpenChange={setRerun} />
    </div>
  );
}

function OutputPreview({ asset }: { asset: AssetView }) {
  if (asset.type === 'video') return <VideoPlayer playback={asset.playback} src={asset.proxyUrl ?? asset.url} poster={asset.thumbnailUrl} loop className="bg-black" />;
  if (asset.type === 'image')
    return (
      <a href={asset.url ?? '#'} target="_blank" rel="noreferrer" className="block size-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.thumbnailUrl ?? asset.url ?? ''} alt={asset.name} className="size-full object-contain" />
      </a>
    );
  if (asset.type === 'audio')
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/25 via-surface to-brand-to/20 p-4">
        <div className="text-center text-sm font-medium">{asset.name}</div>
        <AudioPlayer src={asset.url} className="w-full" />
      </div>
    );
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Box className="size-10 text-primary" />
      <Link href={`/motion?model=${asset.id}`} className="text-sm font-medium text-primary hover:underline">
        Open 3D model
      </Link>
    </div>
  );
}

/** Particles drifting over a gradient while the provider works, with live progress. */
function Generating({ gen }: { gen: GenerationView }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = (now - new Date(gen.createdAt).getTime()) / 1000;
  const eta = gen.etaSeconds ?? 60;
  const pct = gen.progress > 0 ? gen.progress : Math.min(92, (elapsed / eta) * 100);
  const left = Math.max(0, eta - elapsed);
  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-4 overflow-hidden p-6">
      <div className="absolute inset-0 animate-[float_8s_ease-in-out_infinite] bg-[radial-gradient(circle_at_30%_30%,color-mix(in_oklab,var(--brand-from)_45%,transparent),transparent_55%),radial-gradient(circle_at_70%_70%,color-mix(in_oklab,var(--brand-to)_40%,transparent),transparent_55%)] opacity-70 blur-2xl" />
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="absolute size-1 rounded-full bg-white/60"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, animation: `float ${4 + (i % 5)}s ease-in-out ${i * 0.3}s infinite` }}
          />
        ))}
      </div>
      <Spinner className="relative size-6 text-white" />
      <div className="relative w-full max-w-48 space-y-2 text-center">
        <Progress value={pct} />
        <div className="text-xs text-white/80">
          {gen.status === 'queued' ? 'Queued' : 'Generating'} · {Math.round(pct)}%{left > 5 ? ` · ${formatEta(left)} left` : ''}
        </div>
      </div>
    </div>
  );
}

function RegenerateDialog({ gen, open, onOpenChange }: { gen: GenerationView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!open) return;
    setEstimate(null);
    setError(null);
    params.current = { ...gen.params, seed: Math.floor(Math.random() * 2_000_000_000) };
    api
      .post<EstimateResponse>('/generate/estimate', { modelId: gen.model, params: params.current, variants: 1 })
      .then(setEstimate)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [open, gen]);
  const run = useMutation({
    mutationFn: () => api.post('/generate', { capability: gen.capability as Capability, modelId: gen.model, params: params.current, variants: 1, confirmCostUsd: estimate?.estimate.usd ?? 0, sourceRef: { regenerateOf: gen.id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['generations'] });
      toast.success('Regenerating with a new seed');
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'price_changed') {
        const details = e.details as { estimate?: EstimateResponse['estimate'] } | undefined;
        if (details?.estimate && estimate) setEstimate({ ...estimate, estimate: details.estimate });
      }
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate</DialogTitle>
          <DialogDescription>Same prompt and settings with a new seed, so you get a different take.</DialogDescription>
        </DialogHeader>
        <CostSummary data={estimate ?? undefined} error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!estimate || (estimate.budget.hardStop && !estimate.withinBudget)} loading={run.isPending} onClick={() => run.mutate()}>
            Regenerate{estimate ? ` for ${formatUsd(estimate.estimate.usd)}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Variants side by side, played in sync. */
export function CompareDialog({ gens, open, onOpenChange }: { gens: GenerationView[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [playing, setPlaying] = useState(false);
  const outs = gens.flatMap((g) => g.outputs.slice(0, 1).map((o) => ({ g, o })));
  const keep = useMutation({
    mutationFn: (a: AssetView) => api.patch(`/assets/${a.id}`, { isFavorite: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['generations'] });
      toast.success('Marked as favorite');
    },
  });
  const all = (fn: (v: HTMLVideoElement) => void) => videos.current.forEach(fn);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Compare variants</DialogTitle>
          <DialogDescription>Play them together, then star the keeper.</DialogDescription>
        </DialogHeader>
        <div className={cn('grid gap-3', outs.length <= 2 ? 'grid-cols-2' : outs.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}>
          {outs.map(({ g, o }) => (
            <div key={o.id} className="space-y-2">
              <div className="aspect-[9/16] max-h-[60vh] overflow-hidden rounded-xl bg-black">
                {o.type === 'video' ? (
                  <video
                    ref={(el) => {
                      if (el) videos.current.set(o.id, el);
                      else videos.current.delete(o.id);
                    }}
                    src={o.proxyUrl ?? o.url ?? undefined}
                    poster={o.thumbnailUrl ?? undefined}
                    muted
                    loop
                    playsInline
                    className="size-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.url ?? ''} alt={o.name} className="size-full object-contain" />
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Variant {(g.variantIndex ?? 0) + 1}</span>
                <Button size="xs" variant={o.isFavorite ? 'secondary' : 'outline'} onClick={() => keep.mutate(o)}>
                  <Star className={cn('size-3.5', o.isFavorite && 'fill-warning text-warning')} /> Keep
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-start">
          <Button
            variant="secondary"
            onClick={() => {
              if (playing) all((v) => v.pause());
              else all((v) => void v.play().catch(() => undefined));
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? 'Pause all' : 'Play all'}
          </Button>
          <Button variant="ghost" onClick={() => all((v) => (v.currentTime = 0))}>
            <RotateCcw className="size-4" /> Restart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
