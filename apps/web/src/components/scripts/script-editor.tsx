'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AudioLines, Check, ChevronLeft, CircleAlert, Clapperboard, Copy, FileText, Languages, MoreHorizontal, Plus, Presentation, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, LANGUAGES, languageName, type AspectRatio, type ScriptLine } from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useVoices, VoicePicker } from '@/components/app/voice-picker';
import type { EstimateResponse } from '@/components/generate/cost-estimate';
import { ModelPicker } from '@/components/generate/model-picker';
import { useModels, useStudioModel } from '@/components/generate/use-studio-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useLocalSetting } from '@/lib/hooks/use-local-setting';
import type { AssetView, ScriptDetailView, ScriptView } from '@/lib/types';
import { cn, copyText } from '@/lib/utils';
import { LineCard, type GenRequest } from './line-card';
import { StatusBadge } from './status-badge';
import { useLlmPrice } from './llm-price';
import { formatSeconds, platformAspect, spokenWithEmotion, useCharacters, useScript } from './use-scripts';

interface Doc {
  title: string;
  lines: ScriptLine[];
  captions: string;
  hashtags: string[];
}

type Kind = 'frame' | 'voice';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const words = (s: string | null | undefined) => (s ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
const parseTags = (s: string) => [...new Set(s.split(/[\s,]+/).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean))].slice(0, 30);

function newLine(after?: ScriptLine): ScriptLine {
  return {
    id: crypto.randomUUID(),
    speaker: after?.speaker ?? null,
    characterId: after?.characterId ?? null,
    text: '',
    emotion: null,
    onScreenText: null,
    visual: '',
    shotType: after?.shotType ?? 'medium',
    camera: 'static',
    durationS: 3,
    beat: 'other',
    useRealFootage: false,
  };
}

function framePrompt(line: ScriptLine, style: 'photo' | 'sketch', product: string | undefined): string {
  const shot = `${line.visual.trim().replace(/\.$/, '')}. ${line.shotType}, ${line.camera}.`;
  const subject = product ? ` Product: ${product.slice(0, 160)}.` : '';
  return style === 'sketch'
    ? `Storyboard panel: ${shot}${subject} Clean pencil sketch, confident loose lines, soft grey wash on white paper, cinematic framing, no text, no captions.`
    : `${shot}${subject} Photoreal still frame from a social video ad, natural light, authentic creator look, sharp focus, no text or captions.`;
}

export function ScriptEditor({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const script = useScript(id);
  const characters = useCharacters();
  const voices = useVoices();
  const frameModel = useStudioModel('t2i');
  const ttsModels = useModels('tts');
  const [ttsModelId, setTtsModelId] = useLocalSetting<string>('af:script:tts-model', 'eleven-v3-tts');
  const [frameStyle, setFrameStyle] = useLocalSetting<'photo' | 'sketch'>('af:script:frame-style', 'photo');
  const [defaultVoice, setDefaultVoice] = useLocalSetting<string | null>(`af:script:${id}:voice`, null);
  const [aspectSetting, setAspectSetting] = useLocalSetting<AspectRatio | null>(`af:script:${id}:aspect`, null);
  const writePrice = useLlmPrice('writeScript');
  const translatePrice = useLlmPrice('translateScript');

  const d = script.data;
  const frameAspect: AspectRatio = aspectSetting ?? platformAspect(d?.platform);

  /* ------------------------------ Local document ------------------------------ */

  const [doc, setDoc] = useState<Doc | null>(null);
  const [tagsText, setTagsText] = useState('');
  const loadedAs = useRef<string | null>(null);
  useEffect(() => {
    if (!d) return;
    const as = d.status === 'generating' ? 'writing' : 'ready';
    if (loadedAs.current === as) return;
    loadedAs.current = as;
    setDoc({ title: d.title, lines: d.lines, captions: d.captions ?? '', hashtags: d.hashtags });
    setTagsText(d.hashtags.map((h) => `#${h}`).join(' '));
  }, [d]);

  const docRef = useRef<Doc | null>(doc);
  useEffect(() => { docRef.current = doc; });
  const rev = useRef(0);
  const savedRev = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const [pendingRev, setPendingRev] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const edit = useCallback((fn: (doc: Doc) => Doc) => {
    setDoc((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      docRef.current = next;
      return next;
    });
    rev.current += 1;
    setPendingRev(rev.current);
  }, []);

  /** Saves until the server has the latest edit. Resolves false if a save failed. */
  const flush = useCallback(async (): Promise<boolean> => {
    while (savedRev.current < rev.current) {
      if (inflight.current) {
        await inflight.current.catch(() => undefined);
        continue;
      }
      const target = rev.current;
      const cur = docRef.current;
      if (!cur) return true;
      setSaveState('saving');
      const p = api
        .patch(`/scripts/${id}`, { title: cur.title.trim() || 'Untitled script', lines: cur.lines, captions: cur.captions.trim() || null, hashtags: cur.hashtags })
        .then(() => {
          savedRev.current = target;
          setSaveError(null);
          setSaveState(savedRev.current >= rev.current ? 'saved' : 'saving');
        });
      inflight.current = p;
      try {
        await p;
      } catch (e) {
        setSaveState('error');
        setSaveError(errorMessage(e));
        return false;
      } finally {
        inflight.current = null;
      }
    }
    return true;
  }, [id]);

  const debouncedRev = useDebounced(pendingRev, 700);
  useEffect(() => {
    if (debouncedRev > savedRev.current) void flush();
  }, [debouncedRev, flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (savedRev.current < rev.current) e.preventDefault();
    };
    const save = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('keydown', save);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('keydown', save);
    };
  }, [flush]);

  /* --------------------------------- Lines --------------------------------- */

  const updateLine = useCallback((lineId: string, patch: Partial<ScriptLine>) => edit((cur) => ({ ...cur, lines: cur.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) })), [edit]);
  const insertAfter = (index: number) => edit((cur) => ({ ...cur, lines: [...cur.lines.slice(0, index + 1), newLine(cur.lines[index]), ...cur.lines.slice(index + 1)] }));
  const duplicate = (index: number) => edit((cur) => ({ ...cur, lines: [...cur.lines.slice(0, index + 1), { ...cur.lines[index]!, id: crypto.randomUUID(), voiceAssetId: null }, ...cur.lines.slice(index + 1)] }));
  const move = (index: number, dir: -1 | 1) =>
    edit((cur) => {
      const lines = [...cur.lines];
      const to = index + dir;
      if (to < 0 || to >= lines.length) return cur;
      [lines[index], lines[to]] = [lines[to]!, lines[index]!];
      return { ...cur, lines };
    });
  const removeLine = (index: number) => {
    const removed = docRef.current?.lines[index];
    edit((cur) => ({ ...cur, lines: cur.lines.filter((_, i) => i !== index) }));
    if (removed) toast('Line deleted', { action: { label: 'Undo', onClick: () => edit((cur) => ({ ...cur, lines: [...cur.lines.slice(0, index), removed, ...cur.lines.slice(index)] })) } });
  };

  const [rewritingId, setRewritingId] = useState<string | null>(null);
  const rewrite = async (lineId: string, instruction?: string) => {
    if (!(await flush())) return;
    setRewritingId(lineId);
    try {
      const r = await api.post<{ line: ScriptLine; previous: ScriptLine }>(`/scripts/${id}/rewrite`, { lineId, instruction, save: false });
      updateLine(lineId, r.line);
      toast.success('Line rewritten', { action: { label: 'Undo', onClick: () => updateLine(lineId, r.previous) } });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRewritingId(null);
    }
  };

  /* ------------------------------ Frames & voices ------------------------------ */

  const [localAssets, setLocalAssets] = useState<Record<string, AssetView>>({});
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const chars = useMemo(() => characters.data ?? [], [characters.data]);
  const ttsModel = ttsModels.data?.find((m) => m.id === ttsModelId) ?? ttsModels.data?.find((m) => m.recommended) ?? ttsModels.data?.[0];

  const currentFrame = useCallback(
    (line: ScriptLine) => {
      const takes = d?.frames[line.id] ?? [];
      return line.frameAssetId ? (takes.find((t) => t.asset.id === line.frameAssetId)?.asset ?? localAssets[line.frameAssetId]) : takes[0]?.asset;
    },
    [d, localAssets],
  );
  const currentVoice = useCallback(
    (line: ScriptLine) => {
      const takes = d?.voices[line.id] ?? [];
      return line.voiceAssetId ? takes.find((t) => t.asset.id === line.voiceAssetId) : takes[0];
    },
    [d],
  );
  const busy = (kind: Kind, lineId: string) => {
    const p = kind === 'frame' ? d?.pending.frames[lineId] : d?.pending.voices[lineId];
    return !!p && (p.status === 'queued' || p.status === 'running');
  };

  const frameRequest = (line: ScriptLine): GenRequest => {
    const m = frameModel.model;
    if (!m) return { modelId: undefined, params: {}, blocked: frameModel.loading ? 'Loading models…' : 'No image model is set up.' };
    if (!m.available) return { modelId: m.id, params: {}, blocked: 'Add an image provider key in Settings → Providers.' };
    const aspect = m.controls.aspects?.includes(frameAspect) ? frameAspect : undefined;
    return { modelId: m.id, params: { prompt: framePrompt(line, frameStyle, d?.brief.product), ...(aspect ? { aspect } : {}) } };
  };
  const voiceRequest = (line: ScriptLine): GenRequest => {
    const m = ttsModel;
    if (!m) return { modelId: undefined, params: {}, blocked: ttsModels.isLoading ? 'Loading voices…' : 'No voice model is set up.' };
    if (!m.available) return { modelId: m.id, params: {}, blocked: 'Add an ElevenLabs key in Settings → Providers.' };
    const character = chars.find((c) => c.id === line.characterId);
    const voiceId = line.voiceId ?? character?.voice?.providerVoiceId ?? defaultVoice;
    if (!voiceId) return { modelId: m.id, params: {}, blocked: 'Pick a voice in the toolbar above.' };
    const tags = m.id === 'eleven-v3-tts';
    const text = tags ? spokenWithEmotion(line.text, line.emotion) : line.text.replace(/\[[^\]]*\]\s*/g, '').trim();
    return { modelId: m.id, params: { prompt: text, voiceId, speed: clamp(line.pace ?? character?.defaultPace ?? 1, 0.7, 1.2), language: d?.language ?? 'en' } };
  };

  const generate = async (kind: Kind, line: ScriptLine, usd: number) => {
    const req = kind === 'frame' ? frameRequest(line) : voiceRequest(line);
    if (!req.modelId || req.blocked) throw new Error(req.blocked ?? 'Choose a model first.');
    await api.post('/generate', {
      capability: kind === 'frame' ? 't2i' : 'tts',
      modelId: req.modelId,
      params: req.params,
      variants: 1,
      confirmCostUsd: usd,
      ...(d?.projectId ? { projectId: d.projectId } : {}),
      sourceRef: { scriptId: id, lineId: line.id, purpose: kind },
    });
    // The new take becomes the current one when it lands.
    if (kind === 'frame' ? line.frameAssetId : line.voiceAssetId) updateLine(line.id, kind === 'frame' ? { frameAssetId: null } : { voiceAssetId: null });
    await qc.invalidateQueries({ queryKey: ['script', id] });
  };

  const [batch, setBatch] = useState<Kind | null>(null);
  const batchItems = (kind: Kind) =>
    (doc?.lines ?? [])
      .filter((l) => !busy(kind, l.id))
      .filter((l) => {
        if (kind === 'frame') return l.visual.trim() && !currentFrame(l);
        const take = currentVoice(l);
        return l.text.trim() && (!take || (!!take.sourceText && words(take.sourceText) !== words(l.text)));
      })
      .map((l) => ({ line: l, req: kind === 'frame' ? frameRequest(l) : voiceRequest(l) }))
      .filter((x) => !x.req.blocked && x.req.modelId);

  /* -------------------------------- Actions -------------------------------- */

  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyAction(null);
    }
  };
  const translate = (language: string) =>
    run('translate', async () => {
      if (!(await flush())) return;
      const copy = await api.post<ScriptView>(`/scripts/${id}/translate`, { language });
      void qc.invalidateQueries({ queryKey: ['scripts'] });
      toast.success(`${languageName(language)} version ready`);
      router.push(`/scripts/${copy.id}`);
    });
  const anotherTake = () =>
    run('take', async () => {
      const take = await api.post<ScriptView>(`/scripts/${id}/regenerate`, {});
      void qc.invalidateQueries({ queryKey: ['scripts'] });
      if (take.id === id) await qc.invalidateQueries({ queryKey: ['script', id] });
      else router.push(`/scripts/${take.id}`);
    });
  const setStatus = (status: 'draft' | 'final') =>
    run('status', async () => {
      if (!(await flush())) return;
      await api.patch(`/scripts/${id}`, { status });
      await qc.invalidateQueries({ queryKey: ['script', id] });
      void qc.invalidateQueries({ queryKey: ['scripts'] });
      if (status === 'final') toast.success('Marked as approved');
    });
  const openDeck = () =>
    run('deck', async () => {
      if (await flush()) router.push(`/scripts/${id}/deck`);
    });

  /* --------------------------------- Render --------------------------------- */

  if (script.isLoading) return <EditorSkeleton />;
  if (script.error || !d) return <EmptyState icon={<CircleAlert />} title="This script could not be loaded" description={errorMessage(script.error)} action={<Button asChild variant="secondary"><Link href="/scripts">Back to scripts</Link></Button>} />;

  const totalS = (doc?.lines ?? d.lines).reduce((s, l) => s + l.durationS, 0);
  const target = d.brief.durationS;
  const missingFrames = d.status === 'generating' ? [] : batchItems('frame');
  const missingVoices = d.status === 'generating' ? [] : batchItems('voice');

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/scripts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Scripts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={doc?.title ?? d.title}
              onChange={(e) => edit((cur) => ({ ...cur, title: e.target.value.slice(0, 200) }))}
              disabled={d.status === 'generating' || !doc}
              className="w-full bg-transparent font-display text-3xl tracking-tight outline-none placeholder:text-muted-foreground/60 disabled:opacity-70"
              placeholder="Untitled script"
              aria-label="Script title"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={d.status} />
              <span className="flex items-center gap-1">
                <FileText className="size-3.5" /> {d.format === 'dialogue' ? 'Dialogue' : 'Ad script'}
              </span>
              {d.platform && (
                <span className="flex items-center gap-1">
                  <PlatformIcon platform={d.platform} className="size-4" /> {d.platform}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Languages className="size-3.5" /> {languageName(d.language)}
              </span>
              {totalS > 0 && (
                <span className={cn('tabular-nums', target && Math.abs(totalS - target) > Math.max(3, target * 0.15) && 'text-warning')}>
                  {formatSeconds(totalS)}
                  {target ? ` of ${formatSeconds(target)}` : ''}
                </span>
              )}
              {doc && <span>{doc.lines.length} lines</span>}
              <SaveIndicator state={saveState} error={saveError} onRetry={() => void flush()} />
            </div>
          </div>
          {d.status !== 'generating' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={openDeck} loading={busyAction === 'deck'}>
                <Presentation className="size-4" /> Storyboard deck
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" loading={busyAction === 'translate'}>
                    <Languages className="size-4" /> Translate
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-80 overflow-y-auto scrollbar-thin">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Makes a localised copy{translatePrice.data != null ? ` · ≈ ${formatUsd(translatePrice.data)}` : ''}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {LANGUAGES.filter((l) => l.code !== d.language).map((l) => (
                    <DropdownMenuItem key={l.code} onSelect={() => void translate(l.code)}>
                      {l.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {(d.brief.product || d.brief.productId) && (
                <Tip content={`Writes a fresh take from the same brief${writePrice.data != null ? ` (≈ ${formatUsd(writePrice.data)})` : ''}. This one stays as it is.`}>
                  <Button variant="outline" size="sm" onClick={() => void anotherTake()} loading={busyAction === 'take'}>
                    <Shuffle className="size-4" /> Another take
                  </Button>
                </Tip>
              )}
              <Button variant={d.status === 'final' ? 'secondary' : 'outline'} size="sm" onClick={() => void setStatus(d.status === 'final' ? 'draft' : 'final')} loading={busyAction === 'status'}>
                <Check className="size-4" /> {d.status === 'final' ? 'Approved' : 'Approve'}
              </Button>
              <Button variant="brand" size="sm" onClick={() => setBuilding(true)} disabled={!doc?.lines.length}>
                <Clapperboard className="size-4" /> Build the edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {d.timelineId && (
                    <DropdownMenuItem asChild>
                      <Link href={`/editor/${d.timelineId}`}>
                        <Clapperboard /> Open the last edit
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => void copyText(scriptAsText(d.title, doc?.lines ?? d.lines, doc?.captions, doc?.hashtags)).then(() => toast.success('Script copied'))}>
                    <Copy /> Copy as text
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                    <Trash2 /> Delete script
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {d.status !== 'generating' && <BriefStrip brief={d.brief} />}
      </header>

      {d.status === 'generating' ? (
        <Writing script={d} />
      ) : d.status === 'failed' ? (
        <Notice
          tone="error"
          title="The script could not be written"
          action={
            <Button size="sm" variant="secondary" loading={busyAction === 'take'} onClick={() => void anotherTake()}>
              Try again
            </Button>
          }
        >
          {d.error ?? 'Something went wrong.'}
        </Notice>
      ) : null}

      {doc && d.status !== 'generating' && (
        <>
          <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border bg-background/85 px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Frames</span>
              <Segmented size="sm" value={frameStyle} onChange={setFrameStyle} options={[{ value: 'photo', label: 'Photo' }, { value: 'sketch', label: 'Sketch' }]} />
              <Select size="sm" value={frameAspect} onValueChange={(v) => setAspectSetting(v as AspectRatio)} options={['9:16', '4:5', '1:1', '16:9'].map((a) => ({ value: a, label: a }))} className="w-20" aria-label="Frame shape" />
              <div className="w-52">
                <ModelPicker models={frameModel.models} value={frameModel.modelId} onChange={frameModel.setModelId} className="py-1" />
              </div>
              <Button size="sm" variant="secondary" disabled={!missingFrames.length} onClick={() => setBatch('frame')}>
                <Sparkles className="size-4" /> {missingFrames.length ? `Sketch ${missingFrames.length} missing` : 'All frames done'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Voice</span>
              <VoicePicker size="sm" value={defaultVoice} onChange={setDefaultVoice} className="w-52" />
              <Select size="sm" value={ttsModel?.id} onValueChange={setTtsModelId} options={(ttsModels.data ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.description }))} className="w-40" aria-label="Voice model" />
              <Button size="sm" variant="secondary" disabled={!missingVoices.length} onClick={() => setBatch('voice')}>
                <AudioLines className="size-4" /> {missingVoices.length ? `Voice ${missingVoices.length} line${missingVoices.length > 1 ? 's' : ''}` : 'All lines voiced'}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {doc.lines.map((line, i) => (
              <LineCard
                key={line.id}
                index={i}
                line={line}
                format={d.format}
                characters={chars}
                frames={d.frames[line.id] ?? []}
                voices={d.voices[line.id] ?? []}
                pendingFrame={d.pending.frames[line.id]}
                pendingVoice={d.pending.voices[line.id]}
                localAssets={localAssets}
                frameAspect={frameAspect}
                frameRequest={frameRequest(line)}
                voiceRequest={voiceRequest(line)}
                rewriting={rewritingId === line.id}
                isFirst={i === 0}
                isLast={i === doc.lines.length - 1}
                actions={{
                  change: (patch) => updateLine(line.id, patch),
                  generateFrame: (usd) => generate('frame', line, usd),
                  generateVoice: (usd) => generate('voice', line, usd),
                  pickFrame: () => setPickingFor(line.id),
                  rewrite: (instruction) => rewrite(line.id, instruction),
                  duplicate: () => duplicate(i),
                  move: (dir) => move(i, dir),
                  remove: () => removeLine(i),
                  insertAfter: () => insertAfter(i),
                }}
              />
            ))}
            {doc.lines.length < 80 && (
              <Button variant="outline" className="w-full border-dashed" onClick={() => insertAfter(doc.lines.length - 1)}>
                <Plus className="size-4" /> Add line
              </Button>
            )}
          </div>

          <section className="grid gap-4 rounded-2xl border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <Field label="Post caption" aside={`${doc.captions.length}/2200`}>
              <Textarea rows={4} value={doc.captions} onChange={(e) => edit((cur) => ({ ...cur, captions: e.target.value.slice(0, 2200) }))} placeholder="Caption for the post" />
            </Field>
            <div className="space-y-3">
              <Field label="Hashtags" hint="Separate with spaces or commas.">
                <Input
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    edit((cur) => ({ ...cur, hashtags: parseTags(e.target.value) }));
                  }}
                  placeholder="#hydration #gymtok"
                />
              </Field>
              <Button variant="secondary" size="sm" onClick={() => void copyText([doc.captions, doc.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')).then(() => toast.success('Caption copied'))}>
                <Copy className="size-4" /> Copy caption and hashtags
              </Button>
            </div>
          </section>
        </>
      )}

      <AssetPicker
        open={!!pickingFor}
        onOpenChange={(v) => !v && setPickingFor(null)}
        types={['image']}
        title="Use a photo as this frame"
        onPick={([a]) => {
          if (!a || !pickingFor) return;
          setLocalAssets((m) => ({ ...m, [a.id]: a }));
          updateLine(pickingFor, { frameAssetId: a.id });
        }}
      />
      <DeleteConfirm id={id} title={d.title} open={deleting} onOpenChange={setDeleting} />
      {batch && <BatchDialog kind={batch} items={batchItems(batch)} onClose={() => setBatch(null)} run={(line, usd) => generate(batch, line, usd)} />}
      {building && doc && <BuildDialog id={id} title={doc.title} defaultAspect={frameAspect} lines={doc.lines} hasFrame={(l) => !!currentFrame(l)} hasVoice={(l) => !!currentVoice(l)} flush={flush} onClose={() => setBuilding(false)} />}
    </div>
  );
}

/* --------------------------------- Pieces --------------------------------- */

function SaveIndicator({ state, error, onRetry }: { state: 'saved' | 'saving' | 'error'; error: string | null; onRetry: () => void }) {
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1">
        <Spinner className="size-3" /> Saving
      </span>
    );
  if (state === 'error')
    return (
      <Tip content={error}>
        <button type="button" onClick={onRetry} className="flex items-center gap-1 text-destructive hover:underline">
          <CircleAlert className="size-3.5" /> Not saved. Retry
        </button>
      </Tip>
    );
  return (
    <span className="flex items-center gap-1">
      <Check className="size-3" /> Saved
    </span>
  );
}

function BriefStrip({ brief }: { brief: ScriptDetailView['brief'] }) {
  const items = [
    ['Angle', brief.angle],
    ['Hook', brief.hook],
    ['CTA', brief.cta],
    ['Music', brief.musicMood],
    ['Audience', brief.audience],
  ].filter((x): x is [string, string] => !!x[1]);
  if (!items.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {items.map(([k, v]) => (
        <div key={k} className="max-w-sm shrink-0 rounded-xl border bg-card px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">{k} </span>
          <span className="line-clamp-2">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Writing({ script }: { script: ScriptDetailView }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Spinner className="size-6" />
        </div>
        <div className="font-medium">Writing your {script.format === 'dialogue' ? 'dialogue' : 'script'}</div>
        <p className="max-w-md text-sm text-muted-foreground">{script.job?.progressMessage ?? 'Finding the angle, the hook and the beats. This takes about half a minute.'}</p>
        {script.job && <Progress value={script.job.progress} className="h-1.5 w-56" />}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-14 rounded-2xl" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  );
}

function DeleteConfirm({ id, title, open, onOpenChange }: { id: string; title: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <Confirm
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${title}”?`}
      description="The script is removed. Frames and voice takes stay in your library."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        try {
          await api.delete(`/scripts/${id}`);
          void qc.invalidateQueries({ queryKey: ['scripts'] });
          router.push('/scripts');
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    />
  );
}

function scriptAsText(title: string, lines: ScriptLine[], captions?: string, hashtags?: string[]): string {
  const body = lines.map((l, i) => {
    const who = l.speaker ?? 'VO';
    return [`${i + 1}. [${l.beat.toUpperCase()} · ${l.durationS}s] ${who}${l.emotion ? ` (${l.emotion})` : ''}: ${l.text}`, l.onScreenText ? `   On screen: ${l.onScreenText}` : '', `   Shot: ${l.visual} (${l.shotType}, ${l.camera})`].filter(Boolean).join('\n');
  });
  return [title, '', ...body, '', captions ?? '', hashtags?.length ? hashtags.map((h) => `#${h}`).join(' ') : ''].join('\n').trim();
}

/** Prices every missing frame or voice, then runs them one by one. */
function BatchDialog({ kind, items, onClose, run }: { kind: Kind; items: { line: ScriptLine; req: GenRequest }[]; onClose: () => void; run: (line: ScriptLine, usd: number) => Promise<unknown> }) {
  const [snapshot] = useState(items);
  const [prices, setPrices] = useState<(number | null)[] | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [withinBudget, setWithinBudget] = useState(true);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(snapshot.map((x) => api.post<EstimateResponse>('/generate/estimate', { modelId: x.req.modelId, params: x.req.params, variants: 1 })))
      .then((r) => {
        if (!alive) return;
        setPrices(r.map((e) => e.estimate.usd));
        const budget = r[0]?.budget;
        const total = r.reduce((s, e) => s + e.estimate.usd, 0);
        setWithinBudget(!budget || !budget.hardStop || budget.spentUsd + total <= budget.budgetUsd + 1e-9);
      })
      .catch((e) => alive && setPriceError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [snapshot]);
  const total = prices?.reduce<number>((s, p) => s + (p ?? 0), 0) ?? 0;
  const start = async () => {
    if (!prices) return;
    setRunning(true);
    let failed = 0;
    for (let i = 0; i < snapshot.length; i++) {
      try {
        await run(snapshot[i]!.line, prices[i] ?? 0);
      } catch (e) {
        failed++;
        toast.error(`Line ${i + 1}: ${errorMessage(e)}`);
      }
      setDone(i + 1);
    }
    setRunning(false);
    if (!failed) toast.success(kind === 'frame' ? 'Frames are on their way' : 'Voice-overs are on their way');
    onClose();
  };
  const noun = kind === 'frame' ? 'frame' : 'voice-over';
  return (
    <Dialog open onOpenChange={(v) => !v && !running && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'frame' ? `Sketch ${snapshot.length} frame${snapshot.length > 1 ? 's' : ''}` : `Voice ${snapshot.length} line${snapshot.length > 1 ? 's' : ''}`}</DialogTitle>
          <DialogDescription>{kind === 'frame' ? 'Lines without a frame get one, using the frame style and model in the toolbar.' : 'Lines without a voice take, or whose text changed since, are recorded again.'}</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin rounded-xl border p-2 text-sm">
          {snapshot.map((x, i) => (
            <div key={x.line.id} className="flex items-center gap-3 rounded-md px-2 py-1">
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{kind === 'frame' ? x.line.visual : x.line.text}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{prices ? formatUsd(prices[i] ?? 0) : <Spinner className="size-3" />}</span>
              {running && i < done && <Check className="size-3.5 text-success" />}
            </div>
          ))}
        </div>
        {priceError ? (
          <Notice tone="error">{priceError}</Notice>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{prices ? `≈ ${formatUsd(total)}` : 'Pricing…'}</span>
          </div>
        )}
        {!withinBudget && <Notice tone="warning">This would go over your monthly budget.</Notice>}
        {running && <Progress value={(done / snapshot.length) * 100} />}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => void start()} loading={running} disabled={!prices || !withinBudget || !!priceError}>
            Make {snapshot.length} {noun}
            {snapshot.length > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuildDialog({
  id,
  title,
  defaultAspect,
  lines,
  hasFrame,
  hasVoice,
  flush,
  onClose,
}: {
  id: string;
  title: string;
  defaultAspect: AspectRatio;
  lines: ScriptLine[];
  hasFrame: (l: ScriptLine) => boolean;
  hasVoice: (l: ScriptLine) => boolean;
  flush: () => Promise<boolean>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [aspect, setAspect] = useState<AspectRatio>(defaultAspect);
  const [name, setName] = useState(`${title || 'Script'} · storyboard`);
  const [busy, setBusy] = useState(false);
  const frames = lines.filter(hasFrame).length;
  const voiced = lines.filter(hasVoice).length;
  const build = async () => {
    setBusy(true);
    try {
      if (!(await flush())) throw new Error('Save the script first.');
      const r = await api.post<{ id: string; emptySlots: number }>(`/scripts/${id}/timeline`, { aspect, name: name.trim() || undefined });
      router.push(`/editor/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build the edit</DialogTitle>
          <DialogDescription>Creates a timeline with one shot per line, the voice-over, word-timed captions, on-screen text and a CTA end card.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Shape">
            <Segmented value={aspect} onChange={setAspect} options={(['9:16', '4:5', '1:1', '16:9'] as const).map((a) => ({ value: a, label: a }))} />
          </Field>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <Badge variant={frames === lines.length ? 'success' : 'outline'}>{frames}/{lines.length}</Badge> lines have a frame
              {frames < lines.length && <span className="text-xs text-muted-foreground">(the rest become shot slots to generate or film)</span>}
            </li>
            <li className="flex items-center gap-2">
              <Badge variant={voiced === lines.length ? 'success' : 'outline'}>{voiced}/{lines.length}</Badge> lines are voiced
              {voiced < lines.length && <span className="text-xs text-muted-foreground">(captions are timed by estimate there)</span>}
            </li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => void build()} loading={busy}>
            <Clapperboard className="size-4" /> Build and open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
