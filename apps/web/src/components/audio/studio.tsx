'use client';

import { useState, type ReactNode } from 'react';
import type { Capability } from '@adforge/core';
import { pickDefaultModel, useModels } from '@/components/generate/use-studio-model';
import { cn } from '@/lib/utils';
import { useOnChange } from '@/lib/hooks/use-on-change';

/** The best usable model for a capability, kept when it still fits. */
export function useCapabilityModel(capability: Capability) {
  const models = useModels(capability);
  const [modelId, setModelId] = useState<string>();
  useOnChange([models.data, modelId, capability], () => {
    if (models.data && (!modelId || !models.data.some((m) => m.id === modelId))) setModelId(pickDefaultModel(models.data, capability));
  });
  return { models: models.data ?? [], model: models.data?.find((m) => m.id === modelId), modelId, setModelId };
}

/** The sticky settings card on the left of an audio studio tab. */
export function Composer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-4 self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-20', className)}>{children}</div>;
}

/** A label with the control's current value on the right, for sliders. */
export function Labeled({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}

export const studioColumns = 'grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]';
