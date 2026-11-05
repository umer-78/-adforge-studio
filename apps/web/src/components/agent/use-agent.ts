'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { AgentEstimateView, AgentPlanEstimateView, AgentRunView, AgentStepId, Page } from '@/lib/types';
import { qs } from '@/lib/utils';

const live = (r: AgentRunView) => r.status === 'running';

export function useAgentRuns() {
  return useQuery({
    queryKey: ['agent', 'runs'],
    queryFn: () => api.get<Page<AgentRunView>>('/agent/runs?limit=60'),
    refetchInterval: (q) => (q.state.data?.items.some(live) ? 4000 : false),
  });
}

export function useAgentRun(id: string) {
  return useQuery({
    queryKey: ['agent', 'run', id],
    queryFn: () => api.get<AgentRunView>(`/agent/runs/${id}`),
    refetchInterval: (q) => (q.state.data && live(q.state.data) ? 2500 : false),
  });
}

export interface PlanInput {
  durationS: number;
  aspect: string;
  style: string;
  videoModelId?: string;
  productId?: string;
}

/** Ballpark for the whole run, before anything starts. */
export function usePlanEstimate(input: PlanInput) {
  const key = useDebounced(qs({ ...input }), 300);
  return useQuery({
    queryKey: ['agent', 'plan-estimate', key],
    queryFn: () => api.get<AgentPlanEstimateView>(`/agent/estimate${key}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}

/** Live price of a step with the edits on screen. */
export function useStepEstimate(runId: string, mode: 'approve' | 'redo', step: AgentStepId | null, edits: Record<string, unknown>, enabled = true) {
  const key = useDebounced(JSON.stringify({ mode, step, edits }), 300);
  return useQuery({
    queryKey: ['agent', 'estimate', runId, key],
    queryFn: () => api.post<AgentEstimateView>(`/agent/runs/${runId}/estimate`, JSON.parse(key) as Record<string, unknown>),
    enabled: enabled && !!step,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

export interface Decision {
  decision: 'approve' | 'reject' | 'reopen' | 'skip' | 'cancel';
  step?: AgentStepId;
  edits?: Record<string, unknown>;
  note?: string;
}

/** Approve, redo, finish early or cancel; the run view updates in place. */
export function useDecision(runId: string, onDone?: (run: AgentRunView) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Decision) => api.post<AgentRunView>(`/agent/runs/${runId}/decision`, d as unknown as Record<string, unknown>),
    onSuccess: (run) => {
      qc.setQueryData(['agent', 'run', runId], run);
      qc.invalidateQueries({ queryKey: ['agent', 'runs'] });
      onDone?.(run);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ['agent', 'run', runId] });
    },
  });
}

export function useRunPatch(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<AgentRunView>(`/agent/runs/${runId}`, body),
    onSuccess: (run) => {
      qc.setQueryData(['agent', 'run', runId], run);
      qc.invalidateQueries({ queryKey: ['agent', 'runs'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
