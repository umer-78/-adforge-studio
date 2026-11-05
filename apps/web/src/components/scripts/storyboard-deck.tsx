'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera, Printer } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { languageName, SCRIPT_BEATS, type AspectRatio, type ScriptLine } from '@adforge/core';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import { useLocalSetting } from '@/lib/hooks/use-local-setting';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, BrandKitView, ScriptDetailView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BEAT_STYLE, formatSeconds, platformAspect, useScript, type Beat } from './use-scripts';

const PRINT_CSS = `
@page { size: A4 landscape; margin: 0; }
.deck-page { width: 297mm; height: 210mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  html, body { background: #fff !important; }
  .deck-page { break-after: page; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  .deck-page:last-child { break-after: auto; }
}
`;

const RATIO: Record<AspectRatio, string> = { '9:16': '9 / 16', '4:5': '4 / 5', '1:1': '1 / 1', '16:9': '16 / 9' };

interface Panel {
  index: number;
  line: ScriptLine;
  frame: AssetView | undefined;
}

/** Printable storyboard for client sign-off: cover, shot panels and an approval page. */
export function StoryboardDeck({ id }: { id: string }) {
  const script = useScript(id);
  const me = useMe();
  const kits = useQuery({ queryKey: ['brand-kits'], queryFn: () => api.get<{ items: BrandKitView[] }>('/brand-kits').then((r) => r.items), staleTime: 60_000 });
  const [layout, setLayout] = useLocalSetting<'grid' | 'slides'>('af:deck:layout', 'grid');
  const [showVisual, setShowVisual] = useLocalSetting('af:deck:visual', true);
  const [showApproval, setShowApproval] = useLocalSetting('af:deck:approval', true);
  const [savedAspect] = useLocalSetting<AspectRatio | null>(`af:script:${id}:aspect`, null);
  const [printing, setPrinting] = useState(false);
  const d = script.data;
  const kit = kits.data?.find((k) => k.isDefault) ?? kits.data?.[0];
  const accent = kit?.palette.find((c) => c.name.toLowerCase() === 'primary')?.hex ?? kit?.colors[0] ?? '#7C3AED';
  const aspect: AspectRatio = savedAspect ?? platformAspect(d?.platform);
  const vertical = aspect === '9:16' || aspect === '4:5';

  const panels = useMemo<Panel[]>(() => {
    if (!d) return [];
    return d.lines.map((line, index) => {
      const takes = d.frames[line.id] ?? [];
      const frame = line.frameAssetId ? takes.find((t) => t.asset.id === line.frameAssetId)?.asset : takes[0]?.asset;
      return { index, line, frame };
    });
  }, [d]);

  if (script.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-neutral-600">
        <Spinner /> Loading the storyboard…
      </div>
    );
  }
  if (!d) return <div className="p-10 text-sm text-red-700">{errorMessage(script.error) || 'This script could not be loaded.'}</div>;

  const perPage = layout === 'slides' ? 1 : vertical ? 4 : 6;
  const pages: Panel[][] = [];
  for (let i = 0; i < panels.length; i += perPage) pages.push(panels.slice(i, i + perPage));
  const totalPages = 1 + pages.length + (showApproval ? 1 : 0);
  const totalS = d.lines.reduce((s, l) => s + l.durationS, 0);
  const brandName = kit?.name && kit.name !== 'Brand kit' ? kit.name : (me.data?.workspace.name ?? '');
  const date = new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

  const print = async () => {
    setPrinting(true);
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('[data-deck] img'));
    await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    setPrinting(false);
    window.print();
  };

  const footer = (page: number) => (
    <div className="absolute inset-x-[14mm] bottom-[7mm] flex items-center justify-between text-[8pt] text-neutral-500">
      <span>
        {brandName ? `${brandName} · ` : ''}
        {d.title}
      </span>
      <span>
        {page} / {totalPages}
      </span>
    </div>
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-neutral-400/40 bg-white/90 px-4 py-2.5 backdrop-blur print:hidden">
        <Link href={`/scripts/${id}`} className="flex items-center gap-1.5 text-sm text-neutral-700 hover:text-neutral-950">
          <ArrowLeft className="size-4" /> Back to script
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-4 text-sm text-neutral-700">
          <div className="flex rounded-lg border border-neutral-300 bg-neutral-100 p-0.5" role="radiogroup" aria-label="Layout">
            {(
              [
                ['grid', `${vertical ? 4 : 6} per page`],
                ['slides', 'One per page'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={layout === value} onClick={() => setLayout(value)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', layout === value ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-900')}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={showVisual} onCheckedChange={setShowVisual} /> Shot notes
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={showApproval} onCheckedChange={setShowApproval} /> Sign-off page
          </label>
          <button type="button" onClick={() => void print()} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
            {printing ? <Spinner className="size-4" /> : <Printer className="size-4" />} Print or save as PDF
          </button>
        </div>
      </div>

      <div data-deck className="flex flex-col items-center gap-8 overflow-x-auto px-4 py-8 print:block print:p-0">
        {/* Cover */}
        <section className="deck-page relative shrink-0 overflow-hidden rounded-md bg-white shadow-2xl">
          <div className="absolute inset-y-0 left-0 w-[9mm]" style={{ background: accent }} />
          <div className="flex h-full flex-col justify-between py-[18mm] pr-[18mm] pl-[26mm]">
            <div className="flex items-center justify-between">
              {kit?.logo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logo.url} alt="" loading="eager" className="h-[14mm] w-auto object-contain" />
              ) : (
                <span className="text-[11pt] font-semibold tracking-wide text-neutral-700 uppercase">{brandName}</span>
              )}
              <span className="text-[9pt] tracking-[0.2em] text-neutral-500 uppercase">Storyboard for approval</span>
            </div>
            <div className="space-y-[6mm]">
              <h1 className="max-w-[220mm] font-display text-[40pt] leading-[1.05] tracking-tight text-neutral-950">{d.title}</h1>
              <div className="flex flex-wrap gap-x-[8mm] gap-y-[2mm] text-[10pt] text-neutral-600">
                <span>{d.format === 'dialogue' ? 'Dialogue' : 'Ad script'}</span>
                {d.platform && <span className="capitalize">{d.platform}</span>}
                <span>{aspect}</span>
                <span>{formatSeconds(totalS)}</span>
                <span>{d.lines.length} shots</span>
                <span>{languageName(d.language)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-[12mm] gap-y-[4mm] text-[9.5pt] text-neutral-700">
              {d.brief.hook && <Fact label="Hook" value={d.brief.hook} />}
              {d.brief.angle && <Fact label="Angle" value={d.brief.angle} />}
              {d.brief.audience && <Fact label="Audience" value={d.brief.audience} />}
              {d.brief.cta && <Fact label="Call to action" value={d.brief.cta} />}
            </div>
            <div className="flex items-end justify-between text-[8.5pt] text-neutral-500">
              <span>{date}</span>
              <span>Status: {d.status === 'final' ? 'Approved' : 'Draft for review'}</span>
            </div>
          </div>
        </section>

        {/* Panels */}
        {pages.map((page, p) => (
          <section key={p} className="deck-page relative shrink-0 overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="h-[3mm]" style={{ background: accent }} />
            {layout === 'slides' ? (
              <SlidePanel panel={page[0]!} aspect={aspect} showVisual={showVisual} />
            ) : (
              <div className={cn('grid h-[184mm] gap-[6mm] px-[14mm] pt-[9mm]', vertical ? 'grid-cols-4' : 'grid-cols-3 grid-rows-2')}>
                {page.map((panel) => (
                  <GridPanel key={panel.line.id} panel={panel} aspect={aspect} showVisual={showVisual} compact={!vertical} />
                ))}
              </div>
            )}
            {footer(p + 2)}
          </section>
        ))}

        {/* Sign-off */}
        {showApproval && (
          <section className="deck-page relative shrink-0 overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="h-[3mm]" style={{ background: accent }} />
            <div className="grid h-[190mm] grid-cols-2 gap-[14mm] px-[18mm] pt-[14mm]">
              <div className="space-y-[6mm]">
                <h2 className="font-display text-[24pt] text-neutral-950">Post copy</h2>
                {d.captions ? <p className="text-[10pt] leading-relaxed whitespace-pre-wrap text-neutral-800">{d.captions}</p> : <p className="text-[10pt] text-neutral-400">No caption yet.</p>}
                {d.hashtags.length > 0 && <p className="text-[10pt] text-neutral-600">{d.hashtags.map((h) => `#${h}`).join(' ')}</p>}
                <div className="grid grid-cols-2 gap-[4mm] pt-[4mm] text-[9pt] text-neutral-700">
                  {d.brief.musicMood && <Fact label="Music" value={d.brief.musicMood} />}
                  <Fact label="Length" value={`${formatSeconds(totalS)} · ${d.lines.length} shots`} />
                  <Fact label="To film" value={String(d.lines.filter((l) => l.useRealFootage).length)} />
                  <Fact label="AI generated shots" value={String(d.lines.filter((l) => !l.useRealFootage).length)} />
                </div>
              </div>
              <div className="flex flex-col">
                <h2 className="font-display text-[24pt] text-neutral-950">Sign-off</h2>
                <p className="mt-[3mm] text-[9.5pt] text-neutral-600">Approve the script and shots as shown, or note the changes you need.</p>
                <div className="mt-[6mm] flex gap-[6mm] text-[10pt] text-neutral-800">
                  <span className="flex items-center gap-[2mm]">
                    <span className="inline-block size-[4.5mm] rounded-[1mm] border border-neutral-500" /> Approved
                  </span>
                  <span className="flex items-center gap-[2mm]">
                    <span className="inline-block size-[4.5mm] rounded-[1mm] border border-neutral-500" /> Approved with changes
                  </span>
                </div>
                <div className="mt-[8mm] space-y-[7mm]">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="border-b border-neutral-300" />
                  ))}
                </div>
                <div className="mt-auto mb-[8mm] grid grid-cols-3 gap-[6mm] text-[8.5pt] text-neutral-500">
                  {['Name', 'Signature', 'Date'].map((x) => (
                    <div key={x}>
                      <div className="h-[10mm] border-b border-neutral-400" />
                      <div className="mt-[1.5mm]">{x}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {footer(totalPages)}
          </section>
        )}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[7.5pt] font-semibold tracking-[0.12em] text-neutral-400 uppercase">{label}</div>
      <div className="mt-[1mm] line-clamp-3">{value}</div>
    </div>
  );
}

const beatOf = (line: ScriptLine): Beat => ((SCRIPT_BEATS as readonly string[]).includes(line.beat) ? (line.beat as Beat) : 'other');

function Frame({ panel, aspect, className }: { panel: Panel; aspect: AspectRatio; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-[1.5mm] border border-neutral-300 bg-neutral-100', className)} style={{ aspectRatio: RATIO[aspect] }}>
      {panel.frame?.url || panel.frame?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={panel.frame.url ?? panel.frame.thumbnailUrl ?? ''} alt="" loading="eager" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-[2mm] p-[3mm] text-center text-[7.5pt] text-neutral-500">
          {panel.line.useRealFootage && <Camera className="size-[5mm]" />}
          <span className="line-clamp-6">{panel.line.useRealFootage ? 'To be filmed' : panel.line.visual}</span>
        </div>
      )}
      <span className="absolute top-[1.5mm] left-[1.5mm] rounded-[1mm] bg-black/70 px-[1.5mm] py-[0.5mm] text-[7pt] font-semibold text-white tabular-nums">{String(panel.index + 1).padStart(2, '0')}</span>
    </div>
  );
}

function BeatTag({ line }: { line: ScriptLine }) {
  const beat = beatOf(line);
  return (
    <span className="flex items-center gap-[1.5mm] text-[7pt] font-semibold tracking-[0.1em] text-neutral-500 uppercase">
      <span className={cn('inline-block size-[2mm] rounded-full border', BEAT_STYLE[beat].className)} />
      {BEAT_STYLE[beat].label} · {formatSeconds(line.durationS)}
    </span>
  );
}

function Spoken({ line, size }: { line: ScriptLine; size: string }) {
  const text = line.text.replace(/\[[^\]]*\]\s*/g, '').trim();
  return (
    <p className={cn('leading-snug text-neutral-900', size)}>
      <span className="font-semibold">{line.speaker ?? 'VO'}:</span> {text || <span className="text-neutral-400">No dialogue</span>}
      {line.emotion && <span className="text-neutral-500"> ({line.emotion})</span>}
    </p>
  );
}

function GridPanel({ panel, aspect, showVisual, compact }: { panel: Panel; aspect: AspectRatio; showVisual: boolean; compact: boolean }) {
  const { line } = panel;
  return (
    <div className="flex min-h-0 flex-col gap-[2mm]">
      <Frame panel={panel} aspect={aspect} className={compact ? 'w-full' : 'mx-auto h-[108mm]'} />
      <BeatTag line={line} />
      <div className={compact ? 'line-clamp-2' : 'line-clamp-4'}>
        <Spoken line={line} size="text-[8.5pt]" />
      </div>
      {line.onScreenText && <p className="line-clamp-1 text-[8pt] text-neutral-700">On screen: “{line.onScreenText}”</p>}
      {showVisual && (
        <p className={cn('text-[7.5pt] text-neutral-500', compact ? 'line-clamp-1' : 'line-clamp-2')}>
          {line.shotType}, {line.camera}
          {line.useRealFootage ? ' · film' : ''}
        </p>
      )}
    </div>
  );
}

function SlidePanel({ panel, aspect, showVisual }: { panel: Panel; aspect: AspectRatio; showVisual: boolean }) {
  const { line } = panel;
  const vertical = aspect === '9:16' || aspect === '4:5';
  return (
    <div className={cn('grid h-[184mm] gap-[12mm] px-[18mm] pt-[10mm]', vertical ? 'grid-cols-[auto_1fr]' : 'grid-cols-[150mm_1fr]')}>
      <Frame panel={panel} aspect={aspect} className={vertical ? 'h-[165mm]' : 'w-full self-start'} />
      <div className="flex flex-col gap-[5mm] pt-[4mm]">
        <BeatTag line={line} />
        <Spoken line={line} size="text-[16pt]" />
        {line.onScreenText && (
          <div>
            <div className="text-[7.5pt] font-semibold tracking-[0.12em] text-neutral-400 uppercase">On screen</div>
            <p className="mt-[1mm] text-[12pt] font-semibold text-neutral-900">“{line.onScreenText}”</p>
          </div>
        )}
        {showVisual && (
          <div>
            <div className="text-[7.5pt] font-semibold tracking-[0.12em] text-neutral-400 uppercase">Shot</div>
            <p className="mt-[1mm] text-[10pt] text-neutral-700">{line.visual}</p>
            <p className="mt-[1mm] text-[9pt] text-neutral-500">
              {line.shotType} · {line.camera}
              {line.useRealFootage ? ' · to be filmed' : ' · AI generated'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
