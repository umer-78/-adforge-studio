'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Capability, GenParamsInput } from '@adforge/core';
import { CostSummary, useEstimate } from '@/components/generate/cost-estimate';
import { rememberModel } from '@/components/generate/use-studio-model';
import { Button } from '@/components/ui/button';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import type { GenerationView, ModelView } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface RunInput {
  capability: Capability;
  params: GenParamsInput;
  variants?: number;
  sourceRef?: Record<string, unknown>;
  consentId?: string | null;
  projectId?: string | null;
}

/**
 * Price, budget and the run button for a studio composer. The price shown is the price
 * charged: the server refuses to start if it went up in the meantime.
 */
export function RunBar({
  model,
  input,
  problems,
  label,
  icon = <Sparkles className="size-4" />,
  onStarted,
  className,
}: {
  model: ModelView | undefined;
  input: RunInput;
  problems: string[];
  label: string;
  icon?: ReactNode;
  onStarted?: (items: GenerationView[]) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const variants = input.variants ?? 1;
  const est = useEstimate(model?.id, input.params, variants);
  const [busy, setBusy] = useState(false);
  const all = [...(model && !model.available ? [`Add a ${model.provider === 'elevenlabs' ? 'ElevenLabs' : model.provider} key in Settings → Providers to use ${model.label}.`] : []), ...problems];
  const over = !!est.data && !est.data.withinBudget;
  const run = async () => {
    if (!model || !est.data) return;
    setBusy(true);
    try {
      const r = await api.post<{ items: GenerationView[] }>('/generate', {
        capability: input.capability,
        modelId: model.id,
        params: input.params,
        variants,
        confirmCostUsd: est.data.estimate.usd,
        ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
        ...(input.consentId ? { consentId: input.consentId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
      rememberModel(input.capability, model.id);
      void qc.invalidateQueries({ queryKey: ['generations'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(r.items.length > 1 ? `Started ${r.items.length} takes` : 'Started');
      onStarted?.(r.items);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'price_changed') void est.refetch();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn('space-y-3 border-t pt-4', className)}>
      {all[0] ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleAlert className="mt-px size-3.5 shrink-0" /> {all[0]}
        </p>
      ) : (
        <CostSummary data={est.data} loading={est.isFetching} error={est.error ? errorMessage(est.error) : null} />
      )}
      <Button variant="brand" size="lg" className="w-full" loading={busy} disabled={!model || !!all.length || !est.data || est.isFetching || over} onClick={() => void run()}>
        {icon} {label}
      </Button>
    </div>
  );
}
