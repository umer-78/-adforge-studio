'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Sparkles, type LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, nearest, type Capability, type GenParamsInput } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { ConsentPicker } from '@/components/app/consent-picker';
import { Button } from '@/components/ui/button';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import type { AssetView, GenerationView, Page } from '@/lib/types';
import { cn, qs } from '@/lib/utils';
import { CostSummary, useEstimate } from './cost-estimate';
import { CompareDialog, GenerationCard } from './generation-card';
import { ModelPicker } from './model-picker';
import { PromptBox } from './prompt-box';
import { ReferenceBoard } from './reference-board';
import { normalizeSettings, SettingsControls, type Settings } from './settings-controls';
import { pickDefaultModel, rememberModel, useModels } from './use-studio-model';
import { useOnChange } from '@/lib/hooks/use-on-change';

export interface StudioMode {
  capability: Capability;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

/** One-click prompt starters for a mode, e.g. "Relight" for image edits. */
export interface StudioPreset {
  capability: Capability;
  label: string;
  prompt: string;
}

const PROMPT_REQUIRED = new Set<Capability>(['t2v', 't2i', 'i2v', 'first_last', 'v2v', 'video_edit', 'i2i']);
const NO_PROMPT = new Set<Capability>(['upscale_video', 'upscale_image', 'remove_bg_video', 'remove_bg_image', 'interpolate', 'lipsync', 'depth', 'image_to_3d']);
const NO_VARIANTS = new Set<Capability>(['upscale_video', 'upscale_image', 'remove_bg_video', 'remove_bg_image', 'interpolate', 'depth', 'image_to_3d', 'lipsync']);
const CONSENT: Partial<Record<Capability, ('face_likeness' | 'lipsync_dub')[]>> = { avatar: ['face_likeness'], lipsync: ['lipsync_dub', 'face_likeness'] };
const IMAGE_LABEL: Partial<Record<Capability, string>> = { i2v: 'Start frame', first_last: 'First frame', avatar: 'Presenter photo', i2i: 'Image to edit', image_to_3d: 'Product photo', depth: 'Photo' };

/** Composer + results feed shared by the video and photo studios. */
export function GenerateStudio({ modes, kind, presets = [] }: { modes: StudioMode[]; kind: 'video' | 'image'; presets?: StudioPreset[] }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [capability, setCapability] = useState<Capability>(() => modes.find((m) => m.capability === sp.get('mode'))?.capability ?? modes[0]!.capability);
  const [modelId, setModelId] = useState<string>();
  const [prompt, setPrompt] = useState(() => sp.get('prompt') ?? '');
  const [negative, setNegative] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [settings, setSettings] = useState<Settings>({});
  const [image, setImage] = useState<AssetView | null>(null);
  const [endImage, setEndImage] = useState<AssetView | null>(null);
  const [video, setVideo] = useState<AssetView | null>(null);
  const [audio, setAudio] = useState<AssetView | null>(null);
  const [refs, setRefs] = useState<AssetView[]>([]);
  const [refAudios, setRefAudios] = useState<AssetView[]>([]);
  const [variants, setVariants] = useState(1);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [compare, setCompare] = useState<GenerationView[] | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const models = useModels(capability);
  const model = models.data?.find((m) => m.id === modelId);

  // Pick a model when the mode changes; keep it if it still fits.
  useOnChange([models.data, capability, modelId], () => {
    if (!models.data) return;
    if (!modelId || !models.data.some((m) => m.id === modelId)) setModelId(pickDefaultModel(models.data, capability));
  });
  useOnChange([model], () => {
    if (model) setSettings((prev) => normalizeSettings(model, prev));
  });

  // Deep links: /generate?mode=i2v&image=<assetId>
  useEffect(() => {
    const load = async (id: string | null, set: (a: AssetView) => void) => {
      if (!id) return;
      try {
        const r = await api.get<{ asset: AssetView }>(`/assets/${id}`);
        set(r.asset);
      } catch {
        // A stale link just leaves the slot empty.
      }
    };
    void load(sp.get('image'), setImage);
    void load(sp.get('video'), setVideo);
    void load(sp.get('audio'), setAudio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputs = model?.inputs ?? {};
  const refVideo = inputs.video === 'optional' && (inputs.references ?? 0) > 0;
  const params = useMemo<GenParamsInput>(() => {
    const p: GenParamsInput = { prompt: NO_PROMPT.has(capability) ? '' : prompt };
    for (const [k, v] of Object.entries(settings)) if (v !== undefined) (p as Record<string, unknown>)[k] = v;
    if (model?.controls.negativePrompt && negative.trim()) p.negativePrompt = negative.trim();
    if (inputs.image && image) p.imageAssetId = image.id;
    if (inputs.endImage && endImage) p.endImageAssetId = endImage.id;
    if (inputs.video && video) p.videoAssetId = video.id;
    if (inputs.audio && audio) p.audioAssetId = audio.id;
    if ((inputs.references ?? 0) > 0 && refs.length) p.referenceAssetIds = refs.slice(0, inputs.references).map((a) => a.id);
    if ((inputs.audioReferences ?? 0) > 0 && refAudios.length) p.referenceAudioAssetIds = refAudios.slice(0, inputs.audioReferences).map((a) => a.id);
    return p;
  }, [capability, prompt, settings, negative, model, inputs, image, endImage, video, audio, refs, refAudios]);
  const runVariants = NO_VARIANTS.has(capability) ? 1 : variants;
  const est = useEstimate(model?.id, params, runVariants);

  const problems: string[] = [];
  if (model && !model.available) problems.push(`Add a ${model.provider} key in Settings to use ${model.label}.`);
  if (PROMPT_REQUIRED.has(capability) && !prompt.trim()) problems.push('Write a prompt.');
  if (inputs.image === 'required' && !image) problems.push(`Add a ${(IMAGE_LABEL[capability] ?? 'image').toLowerCase()}.`);
  if (inputs.video === 'required' && !video) problems.push('Add a video.');
  if (inputs.audio === 'required' && !audio) problems.push('Add an audio file.');
  const notReady = [image, endImage, video, audio, ...refs, ...refAudios].some((a) => a && a.status !== 'ready');
  if (notReady) problems.push('Wait for your files to finish processing.');
  if (CONSENT[capability] && !consentId) problems.push('Choose the consent that covers this person.');
  if (model?.controls.maxInputDurationS && video?.durationS && video.durationS > model.controls.maxInputDurationS) problems.push(`${model.label} takes videos up to ${model.controls.maxInputDurationS} s.`);
  const overBudget = !!est.data && est.data.budget.hardStop && !est.data.withinBudget;

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ items: GenerationView[] }>('/generate', {
        capability,
        modelId: model!.id,
        params,
        variants: runVariants,
        confirmCostUsd: est.data!.estimate.usd,
        ...(CONSENT[capability] && consentId ? { consentId } : {}),
      }),
    onSuccess: (r) => {
      rememberModel(capability, model?.id);
      void qc.invalidateQueries({ queryKey: ['generations'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(r.items.length > 1 ? `Started ${r.items.length} variants` : 'Generation started');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'price_changed') void est.refetch();
      toast.error(errorMessage(e));
    },
  });
  const canRun = !!model && !!est.data && !est.isFetching && problems.length === 0 && !overBudget && !generate.isPending;
  const run = () => canRun && generate.mutate();

  const caps = modes.map((m) => m.capability);
  const feed = useInfiniteQuery({
    queryKey: ['generations', 'studio', caps.join(',')],
    queryFn: ({ pageParam }) => api.get<Page<GenerationView>>(`/generations${qs({ capability: caps, limit: 24, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((g) => g.status === 'queued' || g.status === 'running')) ? 5000 : false),
  });
  const gens = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = useMemo(() => {
    const m = new Map<string, GenerationView[]>();
    for (const g of gens) if (g.variantGroup) m.set(g.variantGroup, [...(m.get(g.variantGroup) ?? []), g]);
    return m;
  }, [gens]);

  const remix = (g: GenerationView) => {
    const cap = g.capability as Capability;
    if (caps.includes(cap)) setCapability(cap);
    setModelId(g.model);
    setPrompt(g.prompt ?? '');
    const p = g.params as GenParamsInput;
    setNegative(p.negativePrompt ?? '');
    setSettings({ durationS: p.durationS, aspect: p.aspect, resolution: p.resolution, audio: p.audio, seed: p.seed, numOutputs: p.numOutputs, quality: p.quality, upscaleFactor: p.upscaleFactor, targetResolution: p.targetResolution, slowmo: p.slowmo, textured: p.textured, colors: p.colors });
    const byId = new Map(g.inputs.map((a) => [a.id, a]));
    const one = (id?: string) => (id ? (byId.get(id) ?? null) : null);
    setImage(one(p.imageAssetId));
    setEndImage(one(p.endImageAssetId));
    setVideo(one(p.videoAssetId));
    setAudio(one(p.audioAssetId));
    setRefs((p.referenceAssetIds ?? []).map((id) => byId.get(id)).filter((a): a is AssetView => !!a));
    setRefAudios((p.referenceAudioAssetIds ?? []).map((id) => byId.get(id)).filter((a): a is AssetView => !!a));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Settings loaded. Tweak and generate again.');
  };

  const insertToken = (t: string) => setPrompt((p) => `${p}${p && !/\s$/.test(p) ? ' ' : ''}${t} `);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
      <div ref={formRef} className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1 lg:scrollbar-thin">
        <div
          className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
        >
          {modes.length > 1 && (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
              {modes.map((m) => (
                <button
                  key={m.capability}
                  type="button"
                  title={m.hint}
                  onClick={() => setCapability(m.capability)}
                  className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition', m.capability === capability ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                  <m.icon className="size-3.5" /> {m.label}
                </button>
              ))}
            </div>
          )}

          <Field label="Model">{models.isLoading ? <Skeleton className="h-[52px]" /> : <ModelPicker models={models.data ?? []} value={modelId} onChange={setModelId} />}</Field>

          {model && (
            <>
              {(inputs.image || inputs.endImage || inputs.video === 'required' || inputs.audio) && (
                <div className={cn('grid gap-3', inputs.image && inputs.endImage && 'grid-cols-2')}>
                  {inputs.image && <AssetSlot label={IMAGE_LABEL[capability] ?? 'Image'} types={['image']} value={image} onChange={setImage} required={inputs.image === 'required'} />}
                  {inputs.endImage && <AssetSlot label="Last frame" types={['image']} value={endImage} onChange={setEndImage} hint="Optional: the shot ends here." />}
                  {inputs.video === 'required' && <AssetSlot label="Video" types={['video']} value={video} onChange={setVideo} required hint={model.controls.maxInputDurationS ? `Up to ${model.controls.maxInputDurationS} s.` : undefined} />}
                  {inputs.audio && <AssetSlot label={capability === 'avatar' || capability === 'lipsync' ? 'Voice track' : 'Audio'} types={['audio']} value={audio} onChange={setAudio} required={inputs.audio === 'required'} />}
                </div>
              )}

              {((inputs.references ?? 0) > 0 || (inputs.audioReferences ?? 0) > 0) && (
                <ReferenceBoard maxImages={inputs.references ?? 0} maxAudios={inputs.audioReferences ?? 0} allowVideo={refVideo} images={refs} audios={refAudios} video={refVideo ? video : null} onImages={setRefs} onAudios={setRefAudios} onVideo={setVideo} onInsert={insertToken} />
              )}

              {CONSENT[capability] && <ConsentPicker kinds={CONSENT[capability]!} value={consentId} onChange={setConsentId} />}

              {!NO_PROMPT.has(capability) && (
                <div className="space-y-2">
                  {presets.some((p) => p.capability === capability) && (
                    <div className="flex flex-wrap gap-1.5">
                      {presets
                        .filter((p) => p.capability === capability)
                        .map((p) => (
                          <button key={p.label} type="button" onClick={() => setPrompt(p.prompt)} className={cn('h-7 rounded-full border px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground', prompt === p.prompt && 'border-primary bg-primary/10 text-primary')}>
                            {p.label}
                          </button>
                        ))}
                    </div>
                  )}
                  <PromptBox
                    value={prompt}
                    onChange={setPrompt}
                    kind={kind}
                    refs={{ images: refs.length, audios: refAudios.length, videos: refVideo && video ? 1 : 0 }}
                    placeholder={capability === 'i2i' ? 'Say what to change: swap the background for a marble counter, add soft morning light…' : capability === 'avatar' ? 'Optional: how the presenter should move and react' : undefined}
                    context={{ aspect: settings.aspect, durationS: settings.durationS }}
                    onRecipe={(r) => {
                      setPrompt(r.prompt);
                      const c = model.controls;
                      setSettings((s) => ({
                        ...s,
                        ...(c.aspects?.includes(r.aspect) ? { aspect: r.aspect } : {}),
                        ...(r.durationS && c.durations?.length ? { durationS: nearest(r.durationS, c.durations, c.durations[0]!) } : {}),
                        ...(r.durationS && c.durationRange ? { durationS: Math.min(c.durationRange[1], Math.max(c.durationRange[0], r.durationS)) } : {}),
                      }));
                    }}
                    onEnhanced={(r) => {
                      if (r.negativePrompt && model.controls.negativePrompt) {
                        setNegative(r.negativePrompt);
                        setShowNegative(true);
                      }
                    }}
                  />
                  {model.controls.negativePrompt && (
                    <div>
                      <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowNegative((v) => !v)}>
                        <ChevronDown className={cn('size-3.5 transition', showNegative && 'rotate-180')} /> Things to avoid {negative && '·'}
                      </button>
                      {showNegative && <Textarea className="mt-2" rows={2} value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, extra fingers, text, watermark" />}
                    </div>
                  )}
                </div>
              )}

              <SettingsControls model={model} value={settings} onChange={setSettings} />

              {!NO_VARIANTS.has(capability) && (
                <Field label="Variants" hint="Each variant is a separate run with its own seed, shown side by side.">
                  <Segmented size="sm" value={String(variants)} onChange={(v) => setVariants(Number(v))} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
                </Field>
              )}
            </>
          )}

          <div className="sticky bottom-0 -mx-4 -mb-4 space-y-3 rounded-b-2xl border-t bg-card/95 p-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5">
            {problems.length > 0 && <p className="text-xs text-muted-foreground">{problems[0]}</p>}
            {overBudget && <Notice tone="error">This run would pass your monthly budget. Raise it in Settings or pick a cheaper option.</Notice>}
            <div className="flex items-center gap-3">
              <CostSummary data={est.data} loading={est.isFetching} error={est.error ? errorMessage(est.error) : null} className="min-w-0 flex-1" />
              <Button variant="brand" size="lg" disabled={!canRun} loading={generate.isPending} onClick={run}>
                <Sparkles className="size-4" /> Generate{est.data ? ` · ${formatUsd(est.data.estimate.usd)}` : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Results</h2>
          <span className="text-xs text-muted-foreground">Saved to your library automatically</span>
        </div>
        {feed.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
            ))}
          </div>
        ) : gens.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="Nothing generated yet" description="Pick a model, write or dictate a prompt, check the price and hit Generate. Results land here and in your library." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gens.map((g) => {
              const group = g.variantGroup ? groups.get(g.variantGroup) : undefined;
              const done = group?.filter((x) => x.status === 'succeeded' && x.outputs.length) ?? [];
              return <GenerationCard key={g.id} gen={g} onRemix={remix} onCompare={done.length > 1 ? () => setCompare(done.sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0))) : undefined} />;
            })}
          </div>
        )}
        {feed.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
      <CompareDialog gens={compare ?? []} open={!!compare} onOpenChange={(v) => !v && setCompare(null)} />
    </div>
  );
}
