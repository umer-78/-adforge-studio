'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { JOB_LABELS, type JobType } from '@adforge/core';
import { supabaseBrowser, supabaseConfigured } from '@/lib/supabase/browser';

/** Query keys to refresh when a table changes. */
const TABLE_KEYS: Record<string, string[]> = {
  assets: ['assets', 'asset', 'stats'],
  jobs: ['jobs', 'stats'],
  generations: ['generations', 'me'],
  renders: ['renders', 'timeline'],
  posts: ['posts', 'calendar', 'stats'],
  post_targets: ['posts', 'calendar'],
  products: ['products'],
  ad_blueprints: ['clones'],
  variant_batches: ['variants'],
  agent_runs: ['agent'],
  ads: ['campaigns', 'ads'],
  competitors: ['competitors'],
  inspiration_ads: ['inspiration'],
};

const NOTIFY_SUCCESS: Partial<Record<JobType, string>> = {
  'render.timeline': 'Render finished',
  'ai.finalize': 'Generation saved to your library',
  'publish.post': 'Published',
  'product.import': 'Product imported',
  'script.write': 'Script ready',
  'variants.render': 'Variants rendered',
  'ad.clone': 'Ad structure ready',
  'ads.launch': 'Ads created (paused)',
  'media.reframe': 'Reframed copy saved',
  'audio.process': 'Audio processed',
  'media.score': 'Ad score ready',
  'media.detect': 'Detection finished',
};

/** One realtime channel per workspace: refreshes cached queries and surfaces finished jobs. */
export function useRealtimeSync(workspaceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId || !supabaseConfigured()) return;
    const sb = supabaseBrowser();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      for (const key of pending) void qc.invalidateQueries({ queryKey: [key] });
      pending.clear();
    };
    const channel = sb.channel(`workspace:${workspaceId}`);
    for (const [table, keys] of Object.entries(TABLE_KEYS)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        for (const k of keys) pending.add(k);
        if (table === 'jobs' && payload.eventType === 'UPDATE') {
          const job = payload.new as { type: JobType; status: string; error: string | null };
          const old = payload.old as { status?: string };
          if (old.status !== job.status) {
            if (job.status === 'succeeded' && NOTIFY_SUCCESS[job.type]) toast.success(NOTIFY_SUCCESS[job.type]!);
            if (job.status === 'failed') toast.error(`${JOB_LABELS[job.type] ?? 'Job'} failed`, { description: job.error ?? undefined });
          }
        }
        clearTimeout(timer);
        timer = setTimeout(flush, 350);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}
