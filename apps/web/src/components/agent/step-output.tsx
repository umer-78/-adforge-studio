'use client';

import { Clapperboard, ExternalLink, FileText, Layers, Megaphone, Send, ShieldAlert, Trophy } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { optimizeReportSchema, researchBriefSchema, type OptimizeReport, type ResearchBrief } from '@adforge/core';
import { VideoPlayer } from '@/components/app/media-player';
import { PlatformIcon } from '@/components/app/platform-icon';
import { StatusPill } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import type { AgentRunView } from '@/lib/types';
import { cn } from '@/lib/utils';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);

export function researchBrief(run: AgentRunView): ResearchBrief | null {
  const parsed = researchBriefSchema.safeParse(run.steps.find((s) => s.id === 'research')?.output.brief);
  return parsed.success ? parsed.data : null;
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  );
}

function Bullets({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn('space-y-1 text-sm', className)}>
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function ResearchOutput({ run }: { run: AgentRunView }) {
  const brief = researchBrief(run);
  const out = run.steps.find((s) => s.id === 'research')?.output ?? {};
  if (!brief) return null;
  const inspiration = typeof out.inspirationCount === 'number' ? out.inspirationCount : 0;
  return (
    <div className="space-y-4">
      {brief.productSummary && <p className="text-sm leading-relaxed">{brief.productSummary}</p>}
      {brief.audiences.length > 0 && (
        <Section title="Audiences">
          <div className="grid gap-2 md:grid-cols-2">
            {brief.audiences.map((a) => (
              <div key={a.name} className="space-y-1.5 rounded-xl border bg-surface p-3 text-xs">
                <div className="text-sm font-medium">{a.name}</div>
                {a.painPoints.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Pains: </span>
                    {a.painPoints.join('; ')}
                  </p>
                )}
                {a.desires.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Wants: </span>
                    {a.desires.join('; ')}
                  </p>
                )}
                {a.objections.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Objections: </span>
                    {a.objections.join('; ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {brief.angles.length > 0 && (
        <Section title="Angles to test">
          <ol className="space-y-2">
            {brief.angles.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium tabular-nums">{i + 1}</span>
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium">
                    {a.name} <span className="font-normal text-muted-foreground">· {a.format}</span>
                  </div>
                  <p className="text-muted-foreground">“{a.hook}”</p>
                  {a.why && <p className="text-xs text-muted-foreground">{a.why}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {brief.keyMessages.length > 0 && (
          <Section title="Key messages">
            <Bullets items={brief.keyMessages} />
          </Section>
        )}
        {brief.competitorInsights.length > 0 && (
          <Section title={`From competitor ads${inspiration ? ` (${inspiration} studied)` : ''}`}>
            <Bullets items={brief.competitorInsights} />
          </Section>
        )}
      </div>
      {brief.complianceRisks.length > 0 && (
        <Notice tone="warning" title={<span className="inline-flex items-center gap-1.5"><ShieldAlert className="size-4" /> Claims to avoid</span>}>
          <Bullets items={brief.complianceRisks} className="text-xs" />
        </Notice>
      )}
    </div>
  );
}

export function ScriptOutput({ run }: { run: AgentRunView }) {
  const out = run.steps.find((s) => s.id === 'script')?.output ?? {};
  const slots = Array.isArray(out.slots) ? (out.slots as { key: string; beat?: string; prompt?: string; useRealFootage?: boolean }[]) : [];
  const scriptId = str(out.scriptId);
  const timelineId = str(out.timelineId);
  if (!scriptId && !str(out.spoken)) return null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-3">
          {str(out.hook) && (
            <Section title="Hook">
              <p className="text-base font-medium">“{str(out.hook)}”</p>
            </Section>
          )}
          {str(out.spoken) && (
            <Section title="Voice-over">
              <p className="text-sm leading-relaxed whitespace-pre-line">{str(out.spoken)}</p>
            </Section>
          )}
        </div>
        <div className="space-y-3 text-sm">
          {str(out.angle) && (
            <Section title="Angle">
              <p>{str(out.angle)}</p>
            </Section>
          )}
          {str(out.cta) && (
            <Section title="Call to action">
              <p>{str(out.cta)}</p>
            </Section>
          )}
          {typeof out.durationS === 'number' && (
            <Section title="Length">
              <p className="tabular-nums">{Math.round(out.durationS)} s</p>
            </Section>
          )}
          {str(out.musicMood) && (
            <Section title="Music mood">
              <p>{str(out.musicMood)}</p>
            </Section>
          )}
        </div>
      </div>
      {slots.length > 0 && (
        <Section title={`${slots.length} AI shot${slots.length === 1 ? '' : 's'} to generate`}>
          <ol className="space-y-1.5">
            {slots.map((s, i) => (
              <li key={s.key} className="flex gap-2 text-xs">
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="min-w-0">
                  {s.beat && <span className="mr-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] capitalize">{s.beat}</span>}
                  {s.prompt}
                  {s.useRealFootage && <span className="ml-1 text-warning">(real footage works best here)</span>}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {(str(out.caption) || strs(out.hashtags).length > 0) && (
        <Section title="Caption">
          <p className="text-sm text-muted-foreground">
            {str(out.caption)} {strs(out.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </p>
        </Section>
      )}
      <div className="flex flex-wrap gap-2">
        {scriptId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/scripts/${scriptId}`}>
              <FileText className="size-4" /> Open script
            </Link>
          </Button>
        )}
        {timelineId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/editor/${timelineId}`}>
              <Clapperboard className="size-4" /> Edit storyboard
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function GenerateOutput({ run }: { run: AgentRunView }) {
  const step = run.steps.find((s) => s.id === 'generate');
  const timelineId = str(run.steps.find((s) => s.id === 'script')?.output.timelineId);
  const notes = strs(step?.output.notes);
  const video = run.video;
  if (!video) return notes.length ? <Bullets items={notes} className="text-xs text-muted-foreground" /> : null;
  const portrait = (video.height ?? 16) >= (video.width ?? 9);
  return (
    <div className="space-y-3">
      <div className={cn('overflow-hidden rounded-xl border bg-black', portrait ? 'mx-auto max-w-[18rem]' : 'max-w-2xl')}>
        <VideoPlayer playback={video.playback} src={video.url} poster={video.thumbnailUrl} className={cn('w-full', portrait ? 'aspect-[9/16]' : 'aspect-video')} />
      </div>
      {notes.length > 0 && <Bullets items={notes} className="text-xs text-muted-foreground" />}
      <div className="flex flex-wrap gap-2">
        {timelineId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/editor/${timelineId}`}>
              <Clapperboard className="size-4" /> Open in editor
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/publish?assets=${video.id}`}>
            <Send className="size-4" /> Post it
          </Link>
        </Button>
        {timelineId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/variants?timelineId=${timelineId}`}>
              <Layers className="size-4" /> Make variants
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function LaunchOutput({ run }: { run: AgentRunView }) {
  if (!run.campaigns.length) return null;
  return (
    <div className="space-y-2">
      {run.campaigns.map((c) => (
        <Link key={c.id} href={`/ads/${c.id}`} className="flex items-center gap-3 rounded-xl border bg-surface px-3 py-2 text-sm transition hover:border-primary/50">
          {c.platform ? <PlatformIcon platform={c.platform} className="size-5" /> : <Megaphone className="size-4 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
          <StatusPill status={c.status} />
          <ExternalLink className="size-3.5 text-muted-foreground" />
        </Link>
      ))}
      {run.campaigns.some((c) => c.error) && <p className="text-xs text-destructive">{run.campaigns.find((c) => c.error)?.error}</p>}
    </div>
  );
}

export function optimizeReport(run: AgentRunView): OptimizeReport | null {
  const parsed = optimizeReportSchema.safeParse(run.steps.find((s) => s.id === 'optimize')?.output.report);
  return parsed.success ? parsed.data : null;
}

const DIMENSION: Record<OptimizeReport['nextTests'][number]['dimension'], string> = {
  hook: 'Hook',
  cta: 'Call to action',
  voice: 'Voice',
  music: 'Music',
  caption_style: 'Captions',
  first_shot: 'First shot',
  offer: 'Offer',
};

export function OptimizeOutput({ run }: { run: AgentRunView }) {
  const report = optimizeReport(run);
  const out = run.steps.find((s) => s.id === 'optimize')?.output ?? {};
  if (!report) return null;
  const timelineId = str(run.steps.find((s) => s.id === 'script')?.output.timelineId);
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{report.summary}</p>
      {typeof out.impressions === 'number' && <p className="text-xs text-muted-foreground tabular-nums">Based on {new Intl.NumberFormat().format(out.impressions)} impressions so far.</p>}
      {report.winners.length > 0 && (
        <Section title="Working">
          <ul className="space-y-1 text-sm">
            {report.winners.map((w, i) => (
              <li key={i} className="flex gap-2">
                <Trophy className="mt-0.5 size-3.5 shrink-0 text-success" />
                <span>{w.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {report.underperformers.length > 0 && (
        <Section title="Not working yet">
          <ul className="space-y-1 text-sm">
            {report.underperformers.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-secondary px-1.5 text-[10px] leading-4 capitalize">{u.action}</span>
                <span>{u.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {report.nextTests.length > 0 && (
        <Section title="Test next">
          <div className="grid gap-2 md:grid-cols-2">
            {report.nextTests.map((t, i) => (
              <div key={i} className="space-y-1 rounded-xl border bg-surface p-3 text-sm">
                <div className="text-[11px] font-medium text-primary">{DIMENSION[t.dimension]}</div>
                <p className="font-medium">{t.change}</p>
                <p className="text-xs text-muted-foreground">{t.hypothesis}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      {report.budgetAdvice && (
        <Section title="Budget">
          <p className="text-sm">{report.budgetAdvice}</p>
        </Section>
      )}
      {timelineId && report.nextTests.length > 0 && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/variants?timelineId=${timelineId}`}>
            <Layers className="size-4" /> Build these tests as variants
          </Link>
        </Button>
      )}
    </div>
  );
}
