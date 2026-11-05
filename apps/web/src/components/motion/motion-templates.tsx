'use client';

import { MotionTemplateComposition } from '@adforge/compositions';
import { Player, Thumbnail } from '@remotion/player';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Clapperboard, Download, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ASPECT_RATIOS, ASPECT_SIZES, MOTION_TEMPLATES, MOTION_TEMPLATES_BY_ID, motionDefaults, type AspectRatio, type AssetMap, type MotionTemplateDef } from '@adforge/core';
import { RenderStatus } from '@/components/app/render-status';
import { FieldControl } from '@/components/motion/field-control';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Field } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import { useBrandColors } from '@/lib/hooks/use-brand-kits';
import { toResolvedAsset } from '@/lib/resolved-asset';
import type { AssetView, RenderView } from '@/lib/types';

const FPS = 30;
const CATEGORY_LABEL: Record<MotionTemplateDef['category'], string> = { title: 'Titles', commerce: 'Commerce', social: 'Social', brand: 'Brand', data: 'Data', utility: 'Utility' };
const CHECKER = 'repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 50% / 24px 24px';
const MP4_PRESET: Record<AspectRatio, string> = { '9:16': 'tiktok-reels', '4:5': 'feed-4x5', '1:1': 'square', '16:9': 'youtube-1080' };

/** Drops the blank lines kept while typing a list. */
const cleanProps = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => typeof x !== 'string' || x.trim()) : v]));


/** Gallery of motion-graphics templates; picking one opens its editor. */
export function MotionTemplates({ templateId, onTemplate }: { templateId: string | null; onTemplate: (id: string | null) => void }) {
  const def = templateId ? MOTION_TEMPLATES_BY_ID[templateId] : undefined;
  if (def) return <TemplateEditor key={def.id} def={def} onBack={() => onTemplate(null)} />;
  return <Gallery onPick={onTemplate} />;
}

function Gallery({ onPick }: { onPick: (id: string) => void }) {
  const [category, setCategory] = useState<'all' | MotionTemplateDef['category']>('all');
  const [hover, setHover] = useState<string | null>(null);
  const list = MOTION_TEMPLATES.filter((t) => category === 'all' || t.category === category);
  const categories = [...new Set(MOTION_TEMPLATES.map((t) => t.category))];
  return (
    <div className="space-y-4">
      <Segmented value={category} onChange={setCategory} options={[{ value: 'all' as const, label: 'All' }, ...categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {list.map((t) => {
          const inputProps = { templateId: t.id, props: motionDefaults(t.id), background: t.fullFrame ? null : '#14141c' };
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              onMouseEnter={() => setHover(t.id)}
              onMouseLeave={() => setHover((h) => (h === t.id ? null : h))}
              onFocus={() => setHover(t.id)}
              className="group overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="pointer-events-none aspect-square overflow-hidden bg-[#14141c]">
                {hover === t.id ? (
                  <Player component={MotionTemplateComposition} inputProps={inputProps} durationInFrames={t.durationInFrames} fps={FPS} compositionWidth={1080} compositionHeight={1080} autoPlay loop style={{ width: '100%', height: '100%' }} acknowledgeRemotionLicense />
                ) : (
                  <Thumbnail component={MotionTemplateComposition} inputProps={inputProps} durationInFrames={t.durationInFrames} fps={FPS} compositionWidth={1080} compositionHeight={1080} frameToDisplay={Math.round(t.durationInFrames * 0.62)} style={{ width: '100%', height: '100%' }} />
                )}
              </div>
              <div className="space-y-0.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{t.name}</span>
                  <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">{CATEGORY_LABEL[t.category]}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateEditor({ def, onBack }: { def: MotionTemplateDef; onBack: () => void }) {
  const router = useRouter();
  const brand = useBrandColors();
  const [props, setProps] = useState<Record<string, unknown>>(() => motionDefaults(def.id));
  const [assets, setAssets] = useState<Record<string, AssetView>>({});
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [seconds, setSeconds] = useState(Math.round((def.durationInFrames / FPS) * 10) / 10);
  const [transparent, setTransparent] = useState(!def.fullFrame);
  const [backdrop, setBackdrop] = useState('#0b0b12');
  const [renderId, setRenderId] = useState<string | null>(null);
  const size = ASPECT_SIZES[aspect];
  const frames = Math.max(15, Math.round(seconds * FPS));
  const background = def.fullFrame ? null : transparent ? null : backdrop;
  const assetMap = useMemo<AssetMap>(() => Object.fromEntries(Object.values(assets).map((a) => [a.id, toResolvedAsset(a)])), [assets]);
  const inputProps = useMemo(() => ({ templateId: def.id, props, assets: assetMap, background, durationInFrames: frames }), [def.id, props, assetMap, background, frames]);
  const set = (key: string, value: unknown) => setProps((p) => ({ ...p, [key]: value }));

  const createTimeline = () =>
    api.post<{ id: string }>('/timelines', {
      name: def.name,
      aspect,
      motion: { templateId: def.id, props: cleanProps(props), durationS: frames / FPS },
      ...(def.fullFrame ? {} : { background: transparent ? 'transparent' : backdrop }),
    });
  const openEditor = useMutation({ mutationFn: createTimeline, onSuccess: (t) => router.push(`/editor/${t.id}`), onError: (e) => toast.error(errorMessage(e)) });
  const exportVideo = useMutation({
    mutationFn: async (presetId: string) => {
      const t = await createTimeline();
      return api.post<RenderView>('/renders', { timelineId: t.id, presetId });
    },
    onSuccess: (r) => setRenderId(r.id),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> All templates
      </Button>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="space-y-4 self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">{def.name}</h2>
              <p className="text-sm text-muted-foreground">{def.description}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Reset"
              title="Reset"
              onClick={() => {
                setProps(motionDefaults(def.id));
                setAssets({});
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
          {def.fields.map((f) => (
            <FieldControl
              key={f.key}
              field={f}
              value={props[f.key]}
              brand={brand}
              asset={assets[f.key] ?? null}
              onChange={(v) => set(f.key, v)}
              onAsset={(a) => {
                setAssets((m) => {
                  const next = { ...m };
                  if (a) next[f.key] = a;
                  else delete next[f.key];
                  return next;
                });
                set(f.key, a?.id ?? null);
              }}
            />
          ))}
          <Field label="Length" aside={`${(frames / FPS).toFixed(1)}s`}>
            <Slider min={1} max={15} step={0.5} value={[seconds]} onValueChange={([v]) => setSeconds(v ?? seconds)} />
          </Field>
          {!def.fullFrame && (
            <div className="space-y-2 rounded-xl bg-surface-2/60 p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">Transparent background</span>
                  <span className="block text-xs text-muted-foreground">To lay it over footage in the editor or another app.</span>
                </span>
                <Switch checked={transparent} onCheckedChange={setTransparent} />
              </label>
              {!transparent && <ColorInput value={backdrop} onChange={setBackdrop} swatches={brand} />}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented value={aspect} onChange={setAspect} options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))} />
            <div className="flex flex-wrap gap-2">
              <Button variant="brand" loading={openEditor.isPending} onClick={() => openEditor.mutate()}>
                <Clapperboard className="size-4" /> Open in editor
              </Button>
              <Button variant="outline" loading={exportVideo.isPending} onClick={() => exportVideo.mutate(!def.fullFrame && transparent ? 'prores-4444' : MP4_PRESET[aspect])}>
                <Download className="size-4" /> {!def.fullFrame && transparent ? 'Export with transparency' : 'Export MP4'}
              </Button>
            </div>
          </div>
          <div className="flex justify-center rounded-2xl border bg-surface-2/40 p-4">
            <div className="w-full overflow-hidden rounded-xl shadow-2xl" style={{ maxWidth: `min(100%, calc(70vh * ${size.width / size.height}))`, aspectRatio: `${size.width} / ${size.height}`, background: background ?? CHECKER }}>
              <Player
                component={MotionTemplateComposition}
                inputProps={inputProps}
                durationInFrames={frames}
                fps={FPS}
                compositionWidth={size.width}
                compositionHeight={size.height}
                style={{ width: '100%', height: '100%' }}
                autoPlay
                loop
                controls
                clickToPlay
                acknowledgeRemotionLicense
              />
            </div>
          </div>
          {renderId && <RenderStatus id={renderId} onDismiss={() => setRenderId(null)} />}
          <p className="text-xs text-muted-foreground">Exports render on the server at full quality. Transparent exports are ProRes 4444 .mov files that keep the alpha channel.</p>
        </div>
      </div>
    </div>
  );
}


