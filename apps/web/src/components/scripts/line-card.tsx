'use client';

import { ArrowDown, ArrowUp, AudioLines, Camera, CircleAlert, Copy, ImagePlus, Library, MoreHorizontal, Plus, RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { SCRIPT_BEATS, type AspectRatio, type GenParamsInput, type ScriptLine } from '@adforge/core';
import { AssetThumb } from '@/components/app/asset-card';
import { VoicePicker } from '@/components/app/voice-picker';
import { CostConfirm } from '@/components/generate/cost-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import type { AssetView, CharacterView, LineMedia, LinePending } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './characters';
import { BEAT_STYLE, formatSeconds, type Beat } from './use-scripts';

const REWRITE_PRESETS = ['Shorter', 'Punchier', 'More specific', 'More emotional', 'Funnier', 'More casual', 'Add a number or proof'];

export interface GenRequest {
  modelId: string | undefined;
  params: GenParamsInput;
  /** Why it cannot run yet, shown instead of the button. */
  blocked?: string;
}

export interface LineActions {
  change: (patch: Partial<ScriptLine>) => void;
  generateFrame: (usd: number) => Promise<unknown>;
  generateVoice: (usd: number) => Promise<unknown>;
  pickFrame: () => void;
  rewrite: (instruction?: string) => Promise<void>;
  duplicate: () => void;
  move: (dir: -1 | 1) => void;
  remove: () => void;
  insertAfter: () => void;
}

const spokenWords = (s: string | null | undefined) => (s ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

export function LineCard({
  index,
  line,
  format,
  characters,
  frames,
  voices,
  pendingFrame,
  pendingVoice,
  localAssets,
  frameAspect,
  frameRequest,
  voiceRequest,
  rewriting,
  isFirst,
  isLast,
  actions,
}: {
  index: number;
  line: ScriptLine;
  format: 'ad' | 'dialogue';
  characters: CharacterView[];
  frames: LineMedia[];
  voices: LineMedia[];
  pendingFrame?: LinePending;
  pendingVoice?: LinePending;
  localAssets: Record<string, AssetView>;
  frameAspect: AspectRatio;
  frameRequest: GenRequest;
  voiceRequest: GenRequest;
  rewriting: boolean;
  isFirst: boolean;
  isLast: boolean;
  actions: LineActions;
}) {
  const [instruction, setInstruction] = useState('');
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const character = characters.find((c) => c.id === line.characterId);
  const beat = (SCRIPT_BEATS as readonly string[]).includes(line.beat) ? (line.beat as Beat) : 'other';

  const frame = line.frameAssetId ? (frames.find((f) => f.asset.id === line.frameAssetId)?.asset ?? localAssets[line.frameAssetId]) : frames[0]?.asset;
  const voiceTake = line.voiceAssetId ? voices.find((v) => v.asset.id === line.voiceAssetId) : voices[0];
  const voice = voiceTake?.asset;
  const stale = !!voiceTake?.sourceText && spokenWords(voiceTake.sourceText) !== spokenWords(line.text);
  const frameBusy = pendingFrame && (pendingFrame.status === 'queued' || pendingFrame.status === 'running');
  const voiceBusy = pendingVoice && (pendingVoice.status === 'queued' || pendingVoice.status === 'running');
  const voiceLonger = voice?.durationS != null && voice.durationS > line.durationS + 0.05;

  const speakerValue = line.characterId && character ? `c:${line.characterId}` : line.speaker ? `s:${line.speaker}` : 'vo';
  const speakerOptions = [
    { value: 'vo', label: 'Voice-over' },
    ...characters.map((c) => ({ value: `c:${c.id}`, label: c.name })),
    ...(line.speaker && !character ? [{ value: `s:${line.speaker}`, label: line.speaker }] : []),
  ];
  const setSpeaker = (v: string) => {
    if (v === 'vo') return actions.change({ speaker: null, characterId: null });
    if (v.startsWith('c:')) {
      const c = characters.find((x) => x.id === v.slice(2));
      if (c) actions.change({ speaker: c.name, characterId: c.id, ...(line.emotion ? {} : { emotion: c.defaultEmotion }) });
    }
  };

  return (
    <article className="group/line grid gap-4 rounded-2xl border bg-card p-4 transition-colors focus-within:border-primary/40 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-7 text-sm font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase', BEAT_STYLE[beat].className)}>{BEAT_STYLE[beat].label}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SCRIPT_BEATS.map((b) => (
                <DropdownMenuItem key={b} onSelect={() => actions.change({ beat: b })}>
                  <span className={cn('size-2 rounded-full border', BEAT_STYLE[b].className)} /> {BEAT_STYLE[b].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="flex items-center gap-1 rounded-md border bg-surface px-1.5 text-xs text-muted-foreground">
            <input
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={line.durationS}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) actions.change({ durationS: Math.min(60, Math.max(0.5, v)) });
              }}
              className="h-7 w-11 bg-transparent text-right text-foreground tabular-nums outline-none"
              aria-label="Line length in seconds"
            />
            s
          </label>
          <div className="flex min-w-40 items-center gap-1.5">
            {character && <CharacterAvatar character={character} className="size-6 text-[11px]" />}
            <Select size="sm" value={speakerValue} onValueChange={setSpeaker} options={speakerOptions} aria-label="Speaker" className="w-40" />
          </div>
          <Input value={line.emotion ?? ''} onChange={(e) => actions.change({ emotion: e.target.value || null })} placeholder={format === 'dialogue' ? 'delivery' : 'emotion'} className="h-8 w-28 text-xs" maxLength={80} aria-label="Emotion" />
          <div className="ml-auto flex items-center gap-0.5">
            <Popover open={rewriteOpen} onOpenChange={setRewriteOpen}>
              <PopoverTrigger asChild>
                <Button size="xs" variant="ghost" loading={rewriting}>
                  <Wand2 className="size-3.5" /> Rewrite
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {REWRITE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="rounded-full border px-2.5 py-1 text-xs transition hover:border-primary/60 hover:text-primary"
                      onClick={() => {
                        setRewriteOpen(false);
                        void actions.rewrite(p);
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRewriteOpen(false);
                    void actions.rewrite(instruction.trim() || undefined);
                    setInstruction('');
                  }}
                >
                  <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Or say how…" className="h-8 text-xs" maxLength={500} />
                  <Button type="submit" size="sm" variant="secondary">
                    Go
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="Line actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={actions.insertAfter}>
                  <Plus /> Add line below
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={actions.duplicate}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isFirst} onSelect={() => actions.move(-1)}>
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onSelect={() => actions.move(1)}>
                  <ArrowDown /> Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={actions.remove}>
                  <Trash2 /> Delete line
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Textarea
          value={line.text}
          onChange={(e) => actions.change({ text: e.target.value })}
          placeholder={line.speaker ? `What ${line.speaker} says…` : 'What the voice-over says…'}
          maxLength={2000}
          rows={2}
          className={cn('field-sizing-content min-h-16 resize-none text-[15px] leading-relaxed', rewriting && 'animate-pulse')}
          aria-label="Spoken line"
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input value={line.onScreenText ?? ''} onChange={(e) => actions.change({ onScreenText: e.target.value || null })} placeholder="On-screen text (optional)" maxLength={300} className="h-8 text-xs" aria-label="On-screen text" />
          <Tip content={line.useRealFootage ? 'Film this shot yourself (UGC, demo, testimonial)' : 'Generate this shot with AI'}>
            <label className="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs">
              <Camera className="size-3.5 text-muted-foreground" />
              Film it
              <Switch checked={line.useRealFootage} onCheckedChange={(v) => actions.change({ useRealFootage: v })} aria-label="Film this shot" />
            </label>
          </Tip>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <Textarea
            value={line.visual}
            onChange={(e) => actions.change({ visual: e.target.value })}
            placeholder="What we see: subject, setting, action"
            maxLength={2000}
            rows={1}
            className="field-sizing-content min-h-9 resize-none border-0 bg-transparent p-0 text-[13px] text-muted-foreground shadow-none focus-visible:ring-0"
            aria-label="Visual"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Input value={line.shotType} onChange={(e) => actions.change({ shotType: e.target.value })} className="h-7 w-36 text-xs" maxLength={80} aria-label="Shot type" placeholder="Shot" />
            <Input value={line.camera} onChange={(e) => actions.change({ camera: e.target.value })} className="h-7 w-36 text-xs" maxLength={80} aria-label="Camera move" placeholder="Camera" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* Storyboard frame */}
        <div className="space-y-1.5">
          <div className={cn('relative overflow-hidden rounded-xl border bg-surface-2', frameAspect === '9:16' ? 'aspect-[9/16] max-h-64' : frameAspect === '16:9' ? 'aspect-video' : frameAspect === '4:5' ? 'aspect-[4/5]' : 'aspect-square')}>
            {frame ? (
              <AssetThumb asset={frame} hoverPlay={false} className="size-full" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-[11px] text-muted-foreground">
                <ImagePlus className="size-5" />
                No frame yet
              </div>
            )}
            {frameBusy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-4 text-xs text-white backdrop-blur-[2px]">
                <Spinner className="size-5" />
                <span>Sketching…</span>
                <Progress value={pendingFrame.progress} className="h-1 w-24" />
              </div>
            )}
          </div>
          {pendingFrame?.status === 'failed' && (
            <p className="flex items-start gap-1 text-[11px] text-destructive">
              <CircleAlert className="mt-px size-3 shrink-0" /> {pendingFrame.error ?? 'The frame failed.'}
            </p>
          )}
          {frames.length > 1 && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {frames.slice(0, 8).map((f) => (
                <button key={f.asset.id} type="button" onClick={() => actions.change({ frameAssetId: f.asset.id })} className={cn('size-9 shrink-0 overflow-hidden rounded-md border-2', f.asset.id === frame?.id ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')} aria-label="Use this frame">
                  <AssetThumb asset={f.asset} hoverPlay={false} className="size-full" />
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            {frameRequest.blocked ? (
              <p className="flex-1 text-[11px] text-muted-foreground">{frameRequest.blocked}</p>
            ) : (
              <CostConfirm modelId={frameRequest.modelId} params={frameRequest.params} title={frame ? 'New frame for this line' : 'Sketch a frame for this line'} description="A still that shows the shot for client approval and the storyboard deck." onConfirm={actions.generateFrame} align="start">
                <Button size="xs" variant="secondary" className="flex-1" disabled={!!frameBusy || !line.visual.trim()}>
                  {frame ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />} {frame ? 'New frame' : 'Sketch frame'}
                </Button>
              </CostConfirm>
            )}
            <Tip content="Use a photo from the library">
              <Button size="icon-xs" variant="ghost" aria-label="Pick a frame from the library" onClick={actions.pickFrame}>
                <Library className="size-3.5" />
              </Button>
            </Tip>
          </div>
        </div>

        {/* Voice take */}
        <div className="space-y-1.5 rounded-xl border p-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground/80">
              <AudioLines className="size-3.5" /> Voice
            </span>
            {voice?.durationS != null && <span className="tabular-nums">{formatSeconds(voice.durationS)}</span>}
          </div>
          {voiceBusy ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Recording… <Progress value={pendingVoice.progress} className="h-1 flex-1" />
            </div>
          ) : voice?.url ? (
            <audio key={voice.id} src={voice.url} controls preload="none" className="h-8 w-full" />
          ) : (
            <p className="text-[11px] text-muted-foreground">Not voiced yet.</p>
          )}
          {pendingVoice?.status === 'failed' && (
            <p className="flex items-start gap-1 text-[11px] text-destructive">
              <CircleAlert className="mt-px size-3 shrink-0" /> {pendingVoice.error ?? 'The voice-over failed.'}
            </p>
          )}
          {stale && !voiceBusy && <Badge variant="warning">Text changed since this take</Badge>}
          {voiceLonger && !voiceBusy && (
            <button type="button" className="block text-left text-[11px] text-warning hover:underline" onClick={() => actions.change({ durationS: Math.ceil((voice!.durationS! + 0.2) * 10) / 10 })}>
              Voice runs {formatSeconds(voice!.durationS!)}. Fit the line to it
            </button>
          )}
          {voices.length > 1 && (
            <Select
              size="sm"
              value={voice?.id}
              onValueChange={(v) => actions.change({ voiceAssetId: v })}
              aria-label="Voice take"
              options={voices.map((v, i) => ({ value: v.asset.id, label: `Take ${voices.length - i}${i === 0 ? ' (newest)' : ''}`, hint: v.asset.durationS != null ? formatSeconds(v.asset.durationS) : undefined }))}
            />
          )}
          <div className="flex items-center gap-1">
            {voiceRequest.blocked ? (
              <p className="flex-1 text-[11px] text-muted-foreground">{voiceRequest.blocked}</p>
            ) : (
              <CostConfirm modelId={voiceRequest.modelId} params={voiceRequest.params} title={voice ? 'Record a new take' : 'Voice this line'} onConfirm={actions.generateVoice} align="start">
                <Button size="xs" variant="secondary" className="flex-1" disabled={!!voiceBusy || !line.text.trim()}>
                  {voice ? <RefreshCw className="size-3.5" /> : <AudioLines className="size-3.5" />} {voice ? 'New take' : 'Voice line'}
                </Button>
              </CostConfirm>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="Voice settings for this line">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Voice for this line</div>
                  <VoicePicker size="sm" value={line.voiceId ?? null} onChange={(v) => actions.change({ voiceId: v })} noneLabel={character?.voice ? `${character.name}'s voice` : 'Script default'} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">Pace</span>
                    <span className="tabular-nums text-muted-foreground">{(line.pace ?? character?.defaultPace ?? 1).toFixed(2)}×</span>
                  </div>
                  <Slider min={0.7} max={1.2} step={0.05} value={[line.pace ?? character?.defaultPace ?? 1]} onValueChange={([v]) => actions.change({ pace: v ?? null })} />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </article>
  );
}
