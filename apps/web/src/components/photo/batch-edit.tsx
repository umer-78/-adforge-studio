'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, type Capability } from '@adforge/core';
import { AssetThumb } from '@/components/app/asset-card';
import { AssetPicker } from '@/components/app/asset-picker';
import type { EstimateResponse } from '@/components/generate/cost-estimate';
import { ModelPicker } from '@/components/generate/model-picker';
import { RecentGenerations } from '@/components/generate/recent-generations';
import { normalizeSettings, SettingsControls, type Settings } from '@/components/generate/settings-controls';
import { useStudioModel } from '@/components/generate/use-studio-model';
import { Button } from '@/components/ui/button';
import { Field, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';

const OPS: { value: Capability; label: string }[] = [
  { value: 'remove_bg_image', label: 'Remove background' },
  { value: 'upscale_image', label: 'Upscale' },
  { value: 'i2i', label: 'Edit with words' },
];
const MAX = 20;

/** Applies one edit to many photos; the total price is shown before anything runs. */
export function BatchEditTool() {
  const qc = useQueryClient();
  const [op, setOp] = useState<Capability>('remove_bg_image');
  const [photos, setPhotos] = useState<AssetView[]>([]);
  const [picker, setPicker] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [quote, setQuote] = useState<{ total: number; each: number[]; withinBudget: boolean } | null>(null);
  const [done, setDone] = useState(0);
  const { models, model, modelId, setModelId } = useStudioModel(op);
  const [settings, setSettings] = useState<Settings>({});
  useEffect(() => {
    if (model) setSettings((prev) => normalizeSettings(model, prev));
  }, [model]);
  useEffect(() => setQuote(null), [op, photos, prompt, settings, modelId]);

  const paramsFor = (a: AssetView) => ({ ...settings, prompt: op === 'i2i' ? prompt : '', imageAssetId: a.id });

  const price = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(photos.map((a) => api.post<EstimateResponse>('/generate/estimate', { modelId, params: paramsFor(a), variants: 1 })));
      const each = results.map((r) => r.estimate.usd);
      const total = each.reduce((s, x) => s + x, 0);
      const budget = results[0]?.budget;
      return { total, each, withinBudget: !budget?.hardStop || budget.spentUsd + total <= budget.budgetUsd };
    },
    onSuccess: setQuote,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!quote || !model) return;
      setDone(0);
      const failures: string[] = [];
      for (const [i, a] of photos.entries()) {
        try {
          await api.post('/generate', { capability: op, modelId: model.id, params: paramsFor(a), variants: 1, confirmCostUsd: quote.each[i] ?? 0, sourceRef: { tool: 'batch' } });
        } catch (e) {
          failures.push(`${a.name}: ${errorMessage(e)}`);
        }
        setDone(i + 1);
      }
      void qc.invalidateQueries({ queryKey: ['generations'] });
      if (failures.length) toast.error(`${failures.length} of ${photos.length} did not start. ${failures[0]}`);
      else toast.success(`Started ${photos.length} edits`);
    },
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-2xl border bg-card p-5">
          <Field label="Edit">
            <Segmented value={op} onChange={setOp} options={OPS} />
          </Field>
          <Field label="Model">
            <ModelPicker models={models} value={modelId} onChange={setModelId} />
          </Field>
          {op === 'i2i' && (
            <Field label="Instruction" hint="Applied to every photo, e.g. a seasonal background or a color grade.">
              <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Place the product on a snowy wooden table with warm string lights behind it" />
            </Field>
          )}
          {model && <SettingsControls model={model} value={settings} onChange={setSettings} />}
          <div className="space-y-3 border-t pt-4">
            {quote ? (
              <div className="flex items-center justify-between text-sm">
                <span>
                  {photos.length} photos · <span className="font-semibold">{formatUsd(quote.total)}</span>
                </span>
                {!quote.withinBudget && <span className="text-xs text-destructive">Over budget</span>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Check the total before running.</p>
            )}
            {run.isPending && <Progress value={(done / Math.max(1, photos.length)) * 100} />}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={!photos.length || !model?.available || (op === 'i2i' && !prompt.trim())} loading={price.isPending} onClick={() => price.mutate()}>
                Check price
              </Button>
              <Button variant="brand" className="flex-1" disabled={!quote || !quote.withinBudget || run.isPending} loading={run.isPending} onClick={() => run.mutate()}>
                <Layers className="size-4" /> Run batch
              </Button>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Photos <span className="font-normal text-muted-foreground">({photos.length}/{MAX})</span>
            </h3>
            <Button size="sm" variant="secondary" onClick={() => setPicker(true)}>
              <Plus className="size-4" /> Add photos
            </Button>
          </div>
          {photos.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              {photos.map((a, i) => (
                <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border">
                  <AssetThumb asset={a} className="size-full" hoverPlay={false} />
                  {quote && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">{formatUsd(quote.each[i])}</span>}
                  <button type="button" aria-label="Remove" onClick={() => setPhotos((p) => p.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 hidden size-5 items-center justify-center rounded-full bg-black/65 text-white group-hover:flex">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setPicker(true)} className="flex h-48 w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
              Choose up to {MAX} photos from your library
            </button>
          )}
        </div>
      </div>
      <AssetPicker open={picker} onOpenChange={setPicker} types={['image']} multiple max={MAX} initial={photos} title="Photos to edit" onPick={setPhotos} />
      <RecentGenerations capabilities={['remove_bg_image', 'upscale_image', 'i2i']} limit={9} title="Recent batch results" />
    </div>
  );
}
