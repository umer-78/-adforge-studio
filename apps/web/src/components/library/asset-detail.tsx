'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ArrowLeft, AudioLines, Box, Clapperboard, Copy, Crop, Download, ExternalLink, Ellipsis, Film, FolderInput, Gauge, ScanSearch, Send, Share2, ShieldAlert, ShieldCheck, Smartphone, Sparkles, Star, Tag, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { creditsCaption, formatBytes, formatDuration, formatUsd, isRecord, mergeCredits, LICENSE_KINDS, licenseIssueMessage, type AdScore, type LicenseIssue } from '@adforge/core';
import { AssetThumb } from '@/components/app/asset-card';
import { FeedPreviewButton } from '@/components/preview/feed-preview';
import { VideoPlayer } from '@/components/app/media-player';
import { WaveformPlayer } from '@/components/audio/waveform-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { toAspect, useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView } from '@/lib/types';
import { cn, copyText, timeAgo } from '@/lib/utils';
import { MoveDialog, TagDialog } from './organize-dialogs';
import { ShareDialog } from './share-dialog';

interface Segment {
  start: number;
  end: number;
  text: string;
}
interface Detail {
  asset: AssetView;
  transcript: string | null;
  transcriptLanguage: string | null;
  segments: Segment[] | null;
  meta: {
    codec: string | null;
    audioCodec: string | null;
    bitrate: number | null;
    hasAudio: boolean | null;
    analysis: Record<string, unknown> | null;
    score: AdScore | null;
    scenes: { start: number; end: number }[] | null;
    beats: number[] | null;
    bpm: number | null;
    loudnessLufs: number | null;
    silences: { start: number; end: number }[] | null;
    licenseIssues: LicenseIssue[] | null;
    sourceUrl: string | null;
    reframes: Record<string, string> | null;
  };
  versions: { id: string; version: number; note: string | null; size_bytes: number; created_at: string }[];
  license: { id: string; kind: string; commercial_use: boolean; source: string | null; provider: string | null; terms_url: string | null; notes: string | null; expires_at: string | null; attribution: string | null } | null;
  generation: { id: string; capability: string; model: string; provider: string; prompt: string | null; cost_actual_usd: number | null; cost_estimate_usd: number | null; created_at: string } | null;
  derived: { id: string; name: string; type: string; created_at: string }[];
}

const LICENSE_LABEL: Record<string, string> = { generated: 'AI generated (provider terms)', owned: 'I own it', licensed: 'Licensed', royalty_free: 'Royalty free', public_domain: 'Public domain', unknown: 'Unknown' };

export function AssetDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const editor = useOpenInEditor();
  const video = useRef<HTMLVideoElement | null>(null);
  const [dialog, setDialog] = useState<'share' | 'move' | 'tag' | 'license' | null>(null);
  const q = useQuery({
    queryKey: ['asset', id],
    queryFn: () => api.get<Detail>(`/assets/${id}`),
    refetchInterval: (qq) => (qq.state.data && qq.state.data.asset.status !== 'ready' && qq.state.data.asset.status !== 'failed' ? 4000 : false),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['asset', id] });
    void qc.invalidateQueries({ queryKey: ['assets'] });
  };
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch(`/assets/${id}`, body), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/assets/${id}/actions`, body),
    onSuccess: () => toast.success('Started. You can follow it in the jobs tray.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const trash = useMutation({
    mutationFn: (permanent: boolean) => api.delete(`/assets/${id}${permanent ? '?permanent=1' : ''}`),
    onSuccess: (_d, permanent) => {
      invalidate();
      if (permanent) router.push('/library/trash');
      else toast.success('Moved to trash');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({ mutationFn: () => api.post(`/assets/${id}/restore`), onSuccess: invalidate });

  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.error || !q.data) return <EmptyState title="File not found" description={q.error ? errorMessage(q.error) : undefined} action={<Button asChild><Link href="/library">Back to library</Link></Button>} />;
  const { asset: a, meta } = q.data;
  const seek = (t: number) => {
    if (video.current) {
      video.current.currentTime = t;
      void video.current.play().catch(() => undefined);
    }
  };
  const isMedia = a.type === 'video' || a.type === 'audio';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back">
          <Link href={a.deletedAt ? '/library/trash' : '/library'}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <InlineName value={a.name} onSave={(name) => patch.mutate({ name })} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {a.deletedAt ? (
            <>
              <Button variant="secondary" size="sm" loading={restore.isPending} onClick={() => restore.mutate()}>
                <ArchiveRestore className="size-4" /> Restore
              </Button>
              <Confirm title="Delete forever?" description="The file and all its derived copies are removed from storage." confirmLabel="Delete forever" destructive onConfirm={() => trash.mutate(true)}>
                <Button variant="destructive" size="sm">
                  <Trash2 className="size-4" /> Delete forever
                </Button>
              </Confirm>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon-sm" aria-label="Favorite" onClick={() => patch.mutate({ isFavorite: !a.isFavorite })}>
                <Star className={cn('size-4', a.isFavorite && 'fill-warning text-warning')} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('share')}>
                <Share2 className="size-4" /> Share
              </Button>
              {(a.type === 'video' || a.type === 'image') && <FeedPreviewButton asset={a} />}
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/assets/${a.id}/download`}>
                  <Download className="size-4" /> Download
                </a>
              </Button>
              {(a.type === 'video' || a.type === 'image') && (
                <Button variant="brand" size="sm" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [a.id], name: a.name, aspect: a.width && a.height ? toAspect(a.width >= a.height ? (a.width / a.height > 1.5 ? '16:9' : '1:1') : a.height / a.width > 1.5 ? '9:16' : '4:5') : '9:16' })}>
                  <Clapperboard className="size-4" /> Edit
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More actions">
                    <Ellipsis className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {a.type === 'video' && (
                    <DropdownMenuItem asChild>
                      <Link href={`/publish?asset=${a.id}`}>
                        <Send /> Publish
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {(a.type === 'video' || a.type === 'image') && (
                    <DropdownMenuItem asChild>
                      <Link href={`/motion?tab=devices&screen=${a.id}`}>
                        <Smartphone /> Put on a device
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {a.type === 'image' && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`/generate?mode=i2v&image=${a.id}`}>
                          <Film /> Animate
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/motion?tab=model&image=${a.id}`}>
                          <Box /> Make a 3D model
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {a.type === 'video' && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`/generate?mode=upscale_video&video=${a.id}`}>
                          <Wand2 /> Upscale to 4K
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/generate?mode=interpolate&video=${a.id}`}>
                          <Gauge /> Smooth slow motion
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog('move')}>
                    <FolderInput /> Move
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog('tag')}>
                    <Tag /> Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog('license')}>
                    <ShieldCheck /> License
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => trash.mutate(false)}>
                    <Trash2 /> Move to trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border bg-black">
            {a.status !== 'ready' ? (
              <div className="relative flex aspect-video items-center justify-center">
                <AssetThumb asset={a} className="absolute inset-0" hoverPlay={false} />
              </div>
            ) : a.type === 'video' ? (
              <div className="flex max-h-[72vh] justify-center bg-black">
                <VideoPlayer playback={a.playback} src={a.proxyUrl ?? a.url} poster={a.thumbnailUrl} videoRef={(el) => (video.current = el)} className="max-h-[72vh] w-auto max-w-full" />
              </div>
            ) : a.type === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url ?? ''} alt={a.name} className="mx-auto max-h-[72vh] object-contain" />
            ) : a.type === 'audio' ? (
              <div className="space-y-4 bg-gradient-to-br from-primary/20 via-surface to-brand-to/15 p-6">
                <WaveformPlayer assetId={a.id} src={a.url} waveformUrl={a.waveformUrl} durationS={a.durationS} beats={meta.beats ?? []} height={112} />
              </div>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 text-white/80">
                <Box className="size-12 text-primary" />
                <Button asChild variant="secondary">
                  <Link href={`/motion?model=${a.id}`}>Open in 3D studio</Link>
                </Button>
              </div>
            )}
          </div>
          {a.status === 'failed' && <Notice tone="error" title="Processing failed" action={<Button size="sm" onClick={() => action.mutate({ action: 'reprocess' })}>Try again</Button>}>{a.processingError}</Notice>}
          {meta.licenseIssues?.length ? (
            <Notice tone="warning" title="Check the rights before publishing">
              {licenseIssueMessage(meta.licenseIssues)}
            </Notice>
          ) : null}
          {isMedia && <Transcript detail={q.data} onSeek={seek} onTranscribe={() => action.mutate({ action: 'analyze', steps: ['transcribe'] })} pending={action.isPending} />}
        </div>

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">
              Details
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex-1">
              AI & tools
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              Versions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="space-y-4">
            <InfoGrid
              rows={[
                ['Type', a.mimeType],
                ['Size', formatBytes(a.sizeBytes)],
                a.durationS != null ? ['Duration', formatDuration(a.durationS)] : null,
                a.width && a.height ? ['Resolution', `${a.width} × ${a.height}`] : null,
                a.fps ? ['Frame rate', `${Math.round(a.fps * 100) / 100} fps`] : null,
                meta.codec ? ['Codec', `${meta.codec}${meta.audioCodec ? ` / ${meta.audioCodec}` : ''}`] : null,
                meta.loudnessLufs != null ? ['Loudness', `${meta.loudnessLufs.toFixed(1)} LUFS`] : null,
                meta.bpm ? ['Tempo', `${Math.round(meta.bpm)} BPM`] : null,
                ['Source', a.source],
                ['Added', new Date(a.createdAt).toLocaleString()],
              ]}
            />
            <Field label="Description">
              <Textarea key={a.updatedAt} defaultValue={a.description ?? ''} rows={3} placeholder="Notes for your team" onBlur={(e) => e.target.value !== (a.description ?? '') && patch.mutate({ description: e.target.value || null })} />
            </Field>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[13px] font-medium">
                Tags
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDialog('tag')}>
                  Edit
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.tags.length ? a.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>) : <span className="text-xs text-muted-foreground">No tags</span>}
              </div>
            </div>
            <LicenseCard license={q.data.license} type={a.type} credits={a.credits} onEdit={() => setDialog('license')} />
            {q.data.generation && (
              <div className="space-y-2 rounded-xl border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="size-4 text-primary" /> Generated with {q.data.generation.model}
                </div>
                {q.data.generation.prompt && <p className="text-xs text-muted-foreground">{q.data.generation.prompt}</p>}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatUsd(q.data.generation.cost_actual_usd ?? q.data.generation.cost_estimate_usd)}</span>
                  <Link className="font-medium text-primary hover:underline" href={`/${['t2i', 'i2i', 'upscale_image', 'remove_bg_image'].includes(q.data.generation.capability) ? 'photo' : 'generate'}?mode=${q.data.generation.capability}&prompt=${encodeURIComponent(q.data.generation.prompt ?? '')}`}>
                    Remix
                  </Link>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="ai" className="space-y-4">
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">AI analysis</span>
                <Button size="xs" variant="secondary" loading={action.isPending && action.variables?.action === 'analyze'} onClick={() => action.mutate({ action: 'analyze', steps: ['transcribe', 'tags', 'embed'] })}>
                  <ScanSearch className="size-3.5" /> {a.aiCaption ? 'Re-analyze' : 'Analyze'}
                </Button>
              </div>
              {a.aiCaption ? <p className="text-sm text-foreground/90">{a.aiCaption}</p> : <p className="text-xs text-muted-foreground">Describes the file, tags it and makes it searchable by meaning.</p>}
              {!!a.aiTags.length && (
                <div className="flex flex-wrap gap-1">
                  {a.aiTags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {!!a.colors.length && (
                <div className="flex gap-1.5 pt-1">
                  {a.colors.map((c) => (
                    <span key={c} title={c} className="size-6 rounded-md border" style={{ background: c }} />
                  ))}
                </div>
              )}
            </div>
            {(a.type === 'video' || a.type === 'image') && <ScoreCard score={meta.score} onScore={(platform) => action.mutate({ action: 'score', platform })} pending={action.isPending && action.variables?.action === 'score'} />}
            {a.type === 'video' && (
              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Crop className="size-4" /> Auto-reframe
                </div>
                <p className="text-xs text-muted-foreground">Follows the subject to make a copy for each platform shape.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['9:16', '1:1', '4:5', '16:9'] as const).map((ar) => (
                    <Button key={ar} size="xs" variant={meta.reframes?.[ar] ? 'secondary' : 'outline'} onClick={() => (meta.reframes?.[ar] ? router.push(`/library/${meta.reframes[ar]}`) : action.mutate({ action: 'reframe', aspect: ar }))}>
                      {ar}
                      {meta.reframes?.[ar] ? ' ✓' : ''}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {isMedia && (
              <div className="space-y-2 rounded-xl border p-3">
                <div className="text-sm font-medium">Detect</div>
                <div className="flex flex-wrap gap-1.5">
                  {a.type === 'video' && (
                    <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'detect', kind: 'scenes' })}>
                      Scenes {meta.scenes ? `(${meta.scenes.length})` : ''}
                    </Button>
                  )}
                  <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'detect', kind: 'silence' })}>
                    Silences {meta.silences ? `(${meta.silences.length})` : ''}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'detect', kind: 'beats' })}>
                    Beats {meta.beats ? `(${meta.beats.length})` : ''}
                  </Button>
                </div>
                {meta.scenes && a.type === 'video' && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {meta.scenes.slice(0, 40).map((s, i) => (
                      <button key={i} type="button" onClick={() => seek(s.start)} className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                        {formatDuration(s.start)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isMedia && (
              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AudioLines className="size-4" /> Audio clean-up
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'audio', op: 'normalize', targetLufs: -14 })}>
                    Normalize to -14 LUFS
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'audio', op: 'denoise' })}>
                    Remove noise
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'audio', op: 'isolate' })}>
                    Isolate voice
                  </Button>
                  {a.type === 'audio' && (
                    <Button size="xs" variant="outline" onClick={() => action.mutate({ action: 'audio', op: 'stems' })}>
                      Split stems
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Results are saved as new versions linked to this file. Voice isolation and stems use your ElevenLabs key.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="history" className="space-y-4">
            {a.parentAssetId && (
              <Link href={`/library/${a.parentAssetId}`} className="block rounded-xl border p-3 text-sm hover:bg-accent">
                Made from another file → <span className="text-primary">open original</span>
              </Link>
            )}
            <div className="space-y-1">
              <div className="text-[13px] font-medium">Made from this file</div>
              {q.data.derived.length ? (
                q.data.derived.map((d) => (
                  <Link key={d.id} href={`/library/${d.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                    <span className="truncate">{d.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(d.created_at)}</span>
                  </Link>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Edits, upscales, reframes and clean-ups show up here.</p>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-[13px] font-medium">Earlier versions</div>
              {q.data.versions.length ? (
                q.data.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                    <span>
                      v{v.version} {v.note && <span className="text-muted-foreground">· {v.note}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(v.size_bytes)} · {timeAgo(v.created_at)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">This is version {a.version}.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <ShareDialog open={dialog === 'share'} onOpenChange={(v) => setDialog(v ? 'share' : null)} assetId={a.id} name={a.name} />
      <MoveDialog ids={[a.id]} open={dialog === 'move'} onOpenChange={(v) => setDialog(v ? 'move' : null)} onDone={invalidate} />
      <TagDialog ids={[a.id]} open={dialog === 'tag'} onOpenChange={(v) => setDialog(v ? 'tag' : null)} onDone={invalidate} />
      <LicenseDialog assetId={a.id} open={dialog === 'license'} onOpenChange={(v) => setDialog(v ? 'license' : null)} onDone={invalidate} />
    </div>
  );
}

function InlineName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button type="button" className="min-w-0 truncate text-left text-xl font-semibold tracking-tight hover:text-foreground/80" onClick={() => setEditing(true)} title="Rename">
        {value}
      </button>
    );
  return (
    <Input
      autoFocus
      defaultValue={value}
      className="h-9 max-w-md text-lg font-semibold"
      onBlur={(e) => {
        setEditing(false);
        const v = e.target.value.trim();
        if (v && v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function InfoGrid({ rows }: { rows: ([string, string] | null)[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border p-3 text-sm">
      {rows
        .filter((r): r is [string, string] => !!r)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate text-right">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Transcript({ detail, onSeek, onTranscribe, pending }: { detail: Detail; onSeek: (t: number) => void; onTranscribe: () => void; pending: boolean }) {
  const segs = detail.segments ?? [];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Transcript {detail.transcriptLanguage && <span className="font-normal text-muted-foreground">· {detail.transcriptLanguage}</span>}</h3>
        {!detail.transcript && (
          <Button size="xs" variant="secondary" loading={pending} onClick={onTranscribe}>
            Transcribe
          </Button>
        )}
      </div>
      {segs.length ? (
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm scrollbar-thin">
          {segs.map((s, i) => (
            <button key={i} type="button" onClick={() => onSeek(s.start)} className="flex w-full gap-3 rounded-md px-2 py-1 text-left hover:bg-accent">
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatDuration(s.start)}</span>
              <span>{s.text}</span>
            </button>
          ))}
        </div>
      ) : detail.transcript ? (
        <p className="text-sm whitespace-pre-wrap">{detail.transcript}</p>
      ) : (
        <p className="text-xs text-muted-foreground">No transcript yet. Transcripts make speech searchable and power captions and edit-by-text.</p>
      )}
    </div>
  );
}

function ScoreCard({ score, onScore, pending }: { score: AdScore | null; onScore: (platform: string) => void; pending: boolean }) {
  const [platform, setPlatform] = useState('tiktok');
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Ad score</span>
        <div className="flex items-center gap-1.5">
          <Select size="sm" className="w-32" value={platform} onValueChange={setPlatform} options={['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest'].map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} />
          <Button size="xs" variant="secondary" loading={pending} onClick={() => onScore(platform)}>
            {score ? 'Rescore' : 'Score'}
          </Button>
        </div>
      </div>
      {score && isRecord(score.scores) ? (
        <>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums">{Math.round(score.overall)}</span>
            <span className="pb-1 text-xs text-muted-foreground">/ 100 · {score.outlook}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(score.scores).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[90px_1fr_24px] items-center gap-2 text-xs">
                <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                <Progress value={(Number(v) / 10) * 100} />
                <span className="text-right tabular-nums">{Number(v)}</span>
              </div>
            ))}
          </div>
          {!!score.issues?.length && (
            <ul className="space-y-1.5 text-xs">
              {score.issues.slice(0, 5).map((i, n) => (
                <li key={n} className="rounded-lg bg-surface-2 p-2">
                  <span className={cn('font-medium', i.severity === 'high' ? 'text-destructive' : i.severity === 'medium' ? 'text-warning' : 'text-muted-foreground')}>{i.severity}</span> {i.problem} <span className="text-muted-foreground">→ {i.fix}</span>
                </li>
              ))}
            </ul>
          )}
          {!!score.hookAlternatives?.length && (
            <div className="text-xs">
              <div className="mb-1 font-medium">Stronger hooks</div>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {score.hookAlternatives.slice(0, 3).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Rates the hook, clarity, pacing, branding and call to action, with fixes.</p>
      )}
    </div>
  );
}

function LicenseCard({ license, type, credits, onEdit }: { license: Detail['license']; type: string; credits: string[]; onEdit: () => void }) {
  const owed = mergeCredits(license?.attribution ? [license.attribution] : [], credits);
  const risky = type === 'audio' && (!license || license.kind === 'unknown' || !license.commercial_use);
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', risky && 'border-warning/50 bg-warning/5')}>
      {risky ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{license ? LICENSE_LABEL[license.kind] : 'No license recorded'}</div>
        <div className="text-xs text-muted-foreground">{license ? `${license.commercial_use ? 'Commercial use allowed' : 'Not cleared for commercial use'}${license.provider ? ` · ${license.provider}` : license.source && !/^https?:\/\//.test(license.source) ? ` · ${license.source}` : ''}${license.expires_at ? ` · until ${new Date(license.expires_at).toLocaleDateString()}` : ''}` : risky ? 'Publishing warns until you record the rights for this audio.' : 'Record where this came from and how you may use it.'}</div>
        {license && (license.terms_url || /^https?:\/\//.test(license.source ?? '')) && (
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {license.terms_url && (
              <a href={license.terms_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                License terms <ExternalLink className="size-3" />
              </a>
            )}
            {/^https?:\/\//.test(license.source ?? '') && (
              <a href={license.source!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Original file <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
        {owed.length > 0 && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{owed.length === 1 ? 'Credit required wherever you use it' : `${owed.length} credits required wherever you use it`}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  if (await copyText(creditsCaption(owed))) toast.success(owed.length === 1 ? 'Credit copied' : 'Credits copied');
                  else toast.error('Could not copy. Select the text instead.');
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs break-words text-muted-foreground">
              {owed.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Button size="xs" variant="ghost" onClick={onEdit}>
        {license ? 'Change' : 'Add'}
      </Button>
    </div>
  );
}

function LicenseDialog({ assetId, open, onOpenChange, onDone }: { assetId: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [kind, setKind] = useState<string>('owned');
  const [commercial, setCommercial] = useState(true);
  const [source, setSource] = useState('');
  const [terms, setTerms] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/licenses', { kind, commercialUse: commercial, source: source || null, termsUrl: terms || null, assetIds: [assetId] }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success('License saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rights for this file</DialogTitle>
        </DialogHeader>
        <Field label="Kind">
          <Select value={kind} onValueChange={setKind} options={LICENSE_KINDS.map((k) => ({ value: k, label: LICENSE_LABEL[k] }))} />
        </Field>
        <label className="flex items-center justify-between text-sm">
          Commercial use allowed
          <Switch checked={commercial} onCheckedChange={setCommercial} />
        </label>
        <Field label="Source">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Artlist, my own recording, client supplied…" />
        </Field>
        <Field label="License or terms URL">
          <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="https://" />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

