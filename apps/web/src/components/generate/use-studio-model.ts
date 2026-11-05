'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Capability } from '@adforge/core';
import { api } from '@/lib/api-client';
import type { ModelView } from '@/lib/types';

/** Remembers the last model used per capability in this browser. */
export function rememberModel(cap: string, id?: string): string | null {
  try {
    if (id) localStorage.setItem(`af:model:${cap}`, id);
    return localStorage.getItem(`af:model:${cap}`);
  } catch {
    return null;
  }
}

export function pickDefaultModel(models: ModelView[], cap: Capability): string | undefined {
  const saved = rememberModel(cap);
  const usable = models.filter((m) => m.available);
  return (usable.find((m) => m.id === saved) ?? usable.find((m) => m.recommended) ?? usable[0] ?? models.find((m) => m.recommended) ?? models[0])?.id;
}

export function useModels(capability: Capability) {
  return useQuery({ queryKey: ['models', capability], queryFn: () => api.get<{ items: ModelView[] }>(`/models?capability=${capability}`).then((r) => r.items), staleTime: 60_000 });
}

/** Models for one capability plus the selected one, defaulting to the best usable model. */
export function useStudioModel(capability: Capability) {
  const models = useModels(capability);
  const [modelId, setModelId] = useState<string>();
  useEffect(() => {
    if (models.data && (!modelId || !models.data.some((m) => m.id === modelId))) setModelId(pickDefaultModel(models.data, capability));
  }, [models.data, modelId, capability]);
  return { models: models.data ?? [], loading: models.isLoading, model: models.data?.find((m) => m.id === modelId), modelId, setModelId };
}
