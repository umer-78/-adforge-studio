import 'server-only';
import { KEY_PROVIDERS, budgetStatus, features, hasServerKey, openAccessEmail, type KeyProvider, type ServiceClient } from '@adforge/core/server';
import { JOB_LABELS, isRecord, type JobRow, type JobType } from '@adforge/core';
import type { JobView, Me } from '@/lib/types';
import type { Caller } from './api';

/** Which AI/publishing providers have a key, from the workspace's own keys or the server env. */
export async function providerStatus(sb: ServiceClient, workspaceId: string): Promise<Record<KeyProvider, boolean>> {
  const { data } = await sb.from('provider_credentials').select('provider').eq('workspace_id', workspaceId);
  const own = new Set((data ?? []).map((r) => r.provider));
  return Object.fromEntries(KEY_PROVIDERS.map((p) => [p, own.has(p) || hasServerKey(p)])) as Record<KeyProvider, boolean>;
}

export async function loadMe(sb: ServiceClient, caller: Caller): Promise<Me> {
  const [{ data: ws }, { data: profile }, providers, budget] = await Promise.all([
    sb.from('workspaces').select('*').eq('id', caller.workspaceId).single(),
    sb.from('profiles').select('full_name, avatar_url').eq('id', caller.userId).maybeSingle(),
    providerStatus(sb, caller.workspaceId),
    budgetStatus(sb, caller.workspaceId),
  ]);
  if (!ws) throw new Error('Workspace not found');
  const f = features();
  return {
    user: { id: caller.userId, email: caller.email, name: profile?.full_name ?? null, avatarUrl: profile?.avatar_url ?? null },
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      role: caller.role,
      monthlyBudgetUsd: Number(ws.monthly_budget_usd),
      budgetHardStop: ws.budget_hard_stop,
      aiLabelDefault: ws.ai_label_default,
      settings: isRecord(ws.settings) ? ws.settings : {},
    },
    features: {
      storage: f.storage,
      maxUploadBytes: f.maxUploadBytes,
      mux: f.mux,
      llm: providers.anthropic,
      embeddings: providers.openai,
      fal: providers.fal,
      replicate: providers.replicate,
      agnes: providers.agnes,
      elevenlabs: providers.elevenlabs,
      transcription: providers.elevenlabs || providers.openai,
      encryption: f.encryption,
      social: { ...f.social, ayrshare: providers.ayrshare },
      ads: f.ads,
      adLibrary: f.adLibrary,
    },
    providers,
    budget,
    openAccess: !!openAccessEmail(),
  };
}

/** Job views keyed by id, for showing progress on the objects that started them. */
export async function jobViewMap(sb: ServiceClient, workspaceId: string, ids: (string | null | undefined)[]): Promise<Record<string, JobView>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {};
  const { data, error } = await sb.from('jobs').select('*').eq('workspace_id', workspaceId).in('id', unique);
  if (error) throw new Error(`Could not load jobs: ${error.message}`);
  return Object.fromEntries((data ?? []).map((j) => [j.id, toJobView(j)]));
}

export function toJobView(j: JobRow): JobView {
  return {
    id: j.id,
    type: j.type,
    label: JOB_LABELS[j.type as JobType] ?? j.type,
    status: j.status as JobView['status'],
    progress: Number(j.progress ?? 0),
    progressMessage: j.progress_message,
    error: j.error,
    attempts: j.attempts,
    createdAt: j.created_at,
    startedAt: j.started_at,
    completedAt: j.completed_at,
    payload: isRecord(j.payload) ? j.payload : {},
    result: isRecord(j.result) ? j.result : null,
  };
}
