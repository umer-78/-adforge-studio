'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Download, ExternalLink, Send, X } from 'lucide-react';
import Link from 'next/link';
import { licenseIssueMessage, type LicenseIssue } from '@adforge/core';
import { VideoPlayer } from '@/components/app/media-player';
import { Button } from '@/components/ui/button';
import { Notice, Progress } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api-client';
import type { RenderView } from '@/lib/types';
import { cn } from '@/lib/utils';

const ACTIVE = new Set(['queued', 'running']);

export function useRender(id: string | null | undefined) {
  return useQuery({
    queryKey: ['renders', id],
    enabled: !!id,
    queryFn: () => api.get<RenderView>(`/renders/${id}`),
    refetchInterval: (q) => (!q.state.data || ACTIVE.has(q.state.data.status) || (q.state.data.status === 'succeeded' && q.state.data.output?.status !== 'ready') ? 2500 : false),
  });
}

/** Progress of one export, then the finished video with download and next steps. */
export function RenderStatus({ id, className, onDismiss }: { id: string; className?: string; onDismiss?: () => void }) {
  const qc = useQueryClient();
  const r = useRender(id);
  const cancel = useMutation({
    mutationFn: () => api.post(`/renders/${id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['renders'] }),
  });
  const render = r.data;
  if (!render) return <div className={cn('h-16 animate-pulse rounded-xl bg-muted', className)} />;
  const out = render.output;
  return (
    <div className={cn('space-y-3 rounded-xl border bg-card p-3', className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          {render.presetLabel} · {render.width}×{render.height}
        </span>
        {onDismiss && !ACTIVE.has(render.status) && (
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
            <X />
          </Button>
        )}
      </div>
      {ACTIVE.has(render.status) ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {render.status === 'queued' ? 'Waiting for a renderer' : `Rendering ${Math.round(render.progress)}%`}
          <Progress value={render.progress} indeterminate={render.status === 'queued'} className="h-1 flex-1" />
          <Button size="xs" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        </div>
      ) : render.status === 'failed' ? (
        <Notice tone="error" title="The export failed">
          {render.error ?? 'Something went wrong while rendering.'}
        </Notice>
      ) : render.status === 'canceled' ? (
        <p className="text-xs text-muted-foreground">Canceled.</p>
      ) : out ? (
        <div className="space-y-3">
          <div className="mx-auto max-h-[50vh] overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${render.width} / ${render.height}` }}>
            <VideoPlayer playback={out.playback} src={out.proxyUrl ?? out.url} poster={out.thumbnailUrl} className="size-full" />
          </div>
          {render.licenseIssues.length > 0 && (
            <Notice tone="warning" title="Not ready to publish">
              {licenseIssueMessage(render.licenseIssues as LicenseIssue[])}
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="brand" asChild>
              <a href={`/api/assets/${out.id}/download`}>
                <Download className="size-4" /> Download
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/publish?asset=${out.id}`}>
                <Send className="size-4" /> Publish
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/library/${out.id}`}>
                <ExternalLink className="size-4" /> Open in library
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleAlert className="size-3.5" /> Finished, but the file is still being processed.
        </p>
      )}
      {cancel.error && <p className="text-xs text-destructive">{errorMessage(cancel.error)}</p>}
    </div>
  );
}
