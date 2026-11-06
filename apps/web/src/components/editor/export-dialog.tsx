'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Film } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EXPORT_PRESETS, EXPORT_PRESETS_BY_ID, licenseIssueMessage, presetSize, safeZoneIssueMessages, safeZoneIssues, safeZonesFor, type ExportPreset } from '@adforge/core';
import { RenderStatus } from '@/components/app/render-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Notice, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import type { ExportPreflightView, RenderView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { saveNow } from './autosave';
import { useEditor } from './store';

const GROUPS: ExportPreset['group'][] = ['Social', 'Web', 'Master', 'Preview'];
const ACTIVE = new Set(['queued', 'running']);

/** The preset that matches the edit's shape, so one click gives the right file. */
function suggestedPreset(width: number, height: number): string {
  const r = width / height;
  const near = (x: number) => Math.abs(r - x) < 0.01;
  if (near(9 / 16)) return 'tiktok-reels';
  if (near(4 / 5)) return 'feed-4x5';
  if (near(1)) return 'square';
  if (near(16 / 9)) return 'youtube-1080';
  return 'source-1080';
}

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[90vh] overflow-y-auto">
        {open && <ExportBody />}
      </DialogContent>
    </Dialog>
  );
}

function ExportBody() {
  const qc = useQueryClient();
  const id = useEditor((s) => s.id)!;
  const width = useEditor((s) => s.timeline.width);
  const height = useEditor((s) => s.timeline.height);
  const transparent = useEditor((s) => s.timeline.background === 'transparent');
  const timeline = useEditor((s) => s.timeline);
  const [presetId, setPresetId] = useState(() => (transparent ? 'prores-4444' : suggestedPreset(width, height)));
  const [started, setStarted] = useState<string[]>([]);
  const preset = EXPORT_PRESETS_BY_ID[presetId] ?? EXPORT_PRESETS[0]!;

  // Save first, so the check and the export use exactly what is on screen.
  const preflight = useQuery({
    queryKey: ['timeline-preflight', id],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      await saveNow();
      const status = useEditor.getState().saveStatus;
      if (status === 'conflict') throw new Error('This edit was changed somewhere else. Resolve that first, then export.');
      if (status === 'error') throw new Error(useEditor.getState().saveError ?? 'The edit could not be saved.');
      return api.get<ExportPreflightView>(`/timelines/${id}/preflight`);
    },
  });
  const renders = useQuery({
    queryKey: ['renders', 'timeline', id],
    queryFn: () => api.get<{ items: RenderView[] }>(`/renders?timelineId=${id}&limit=12`).then((r) => r.items),
    refetchInterval: (q) => (q.state.data?.some((r) => ACTIVE.has(r.status)) ? 4000 : false),
  });
  const start = useMutation({
    mutationFn: async () => {
      await saveNow();
      return api.post<RenderView>('/renders', { timelineId: id, presetId: preset.id });
    },
    onSuccess: (r) => {
      setStarted((list) => [r.id, ...list]);
      void qc.invalidateQueries({ queryKey: ['renders', 'timeline', id] });
    },
  });

  const p = preflight.data;
  const blockers = p ? [p.empty && 'The edit is empty. Add something to the timeline first.', p.emptySlots.length > 0 && `Fill the empty media slots first: ${p.emptySlots.slice(0, 4).join(', ')}${p.emptySlots.length > 4 ? '…' : ''}.`, p.missingFiles > 0 && `${p.missingFiles} file${p.missingFiles > 1 ? 's' : ''} used in this edit ${p.missingFiles > 1 ? 'were' : 'was'} deleted. Replace ${p.missingFiles > 1 ? 'them' : 'it'} first.`, p.failedFiles.length > 0 && `“${p.failedFiles[0]}” could not be processed. Replace it first.`].filter((x): x is string => !!x) : [];
  const tooLong = !!p && !!preset.maxDurationS && p.durationS > preset.maxDurationS + 0.01;
  const size = presetSize(preset, { width, height });
  const reshaped = Math.abs(size.width / size.height - width / height) > 0.01;
  // Re-laid-out layers move, so the check only runs when the file keeps the edit's shape.
  const zoneMessages = useMemo(() => (reshaped ? [] : safeZoneIssueMessages(safeZoneIssues(timeline, safeZonesFor(size.width, size.height)))), [reshaped, timeline, size.width, size.height]);
  const history = (renders.data ?? []).filter((r) => !started.includes(r.id));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export</DialogTitle>
        <DialogDescription>Renders the saved edit in full quality. You can keep editing while it runs.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 md:grid-cols-[1fr_17rem]">
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group} className="space-y-1.5">
              <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group}</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {EXPORT_PRESETS.filter((x) => x.group === group).map((x) => {
                  const s = presetSize(x, { width, height });
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setPresetId(x.id)}
                      className={cn('rounded-xl border px-3 py-2 text-left transition', x.id === preset.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:border-foreground/30')}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                        {x.label}
                        <span className="font-mono text-[10px] text-muted-foreground uppercase">{x.format}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.width}×{s.height} · {x.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {preflight.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16" />
            </div>
          ) : preflight.isError ? (
            <Notice tone="error" title="Can't export yet">
              {errorMessage(preflight.error)}
            </Notice>
          ) : (
            <>
              {blockers.map((b) => (
                <Notice key={b} tone="error">
                  {b}
                </Notice>
              ))}
              {tooLong && p && (
                <Notice tone="warning">
                  {preset.label} allows up to {preset.maxDurationS}s; this edit is {Math.round(p.durationS)}s. Pick another preset or shorten the edit.
                </Notice>
              )}
              {p && p.processingFiles.length > 0 && <Notice tone="info">{p.processingFiles.length} file{p.processingFiles.length > 1 ? 's are' : ' is'} still processing. The export waits for them.</Notice>}
              {p && p.licenseIssues.length > 0 && (
                <Notice tone="warning" title="Fine to download, not to publish">
                  {licenseIssueMessage(p.licenseIssues)}
                </Notice>
              )}
              {zoneMessages.length > 0 && (
                <Notice tone="warning" title="Text the app may cover">
                  <ul className="space-y-0.5">
                    {zoneMessages.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-muted-foreground">Turn on safe zones under the preview to see where.</p>
                </Notice>
              )}
              {reshaped && <Notice tone="info">This preset has a different shape from your edit ({width}×{height}), so layers are re-laid out to fit. Check the result before posting.</Notice>}
              {transparent && preset.id !== 'prores-4444' && <Notice tone="info">Your edit has a transparent background. Only ProRes 4444 keeps it; other formats render it black.</Notice>}
              {p && !blockers.length && !tooLong && (
                <p className="text-xs text-muted-foreground">
                  {Math.round(p.durationS * 10) / 10}s at {size.width}×{size.height}. Larger sizes and ProRes take longer to render.
                </p>
              )}
            </>
          )}
          {start.error && <Notice tone="error">{errorMessage(start.error)}</Notice>}
          {started.map((rid) => (
            <RenderStatus key={rid} id={rid} onDismiss={() => setStarted((l) => l.filter((x) => x !== rid))} />
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-1.5 border-t pt-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Earlier exports</div>
          <div className="divide-y rounded-xl border">
            {history.map((r) => (
              <button key={r.id} type="button" onClick={() => setStarted((l) => [r.id, ...l])} className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-accent/50">
                <Film className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {r.presetLabel} · {r.width}×{r.height}
                </span>
                {r.licenseIssues.length > 0 && <CircleAlert className="size-3.5 text-amber-400" aria-label="Audio not cleared for ads" />}
                <span className={cn(r.status === 'failed' && 'text-destructive', ACTIVE.has(r.status) && 'text-primary')}>{r.status === 'succeeded' ? 'Ready' : r.status === 'running' ? `${Math.round(r.progress)}%` : r.status[0]!.toUpperCase() + r.status.slice(1)}</span>
                <span className="w-20 text-right text-muted-foreground">{timeAgo(r.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="brand" loading={start.isPending} disabled={!p || blockers.length > 0 || tooLong} onClick={() => start.mutate()}>
          Export {preset.label}
        </Button>
      </DialogFooter>
    </>
  );
}
