'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Brush, Eraser, Expand, Paintbrush, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aspectFromSize, formatUsd, type AspectRatio } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { CostSummary, useEstimate } from '@/components/generate/cost-estimate';
import { ModelPicker } from '@/components/generate/model-picker';
import { RecentGenerations } from '@/components/generate/recent-generations';
import { normalizeSettings, SettingsControls, type Settings } from '@/components/generate/settings-controls';
import { useStudioModel } from '@/components/generate/use-studio-model';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { aspectNumber, canvasBlob, fitWithin, loadImage } from '@/lib/canvas';
import type { AssetView } from '@/lib/types';
import { uploadAndWait } from '@/lib/upload';

type Stroke = { r: number; erase: boolean; points: [number, number][] };
const MAGENTA = '#FF00FF';
const MAX_SIDE = 2048;

/**
 * Generative fill (paint over what to replace) and expand (grow the canvas to a new aspect).
 * The marked areas are painted magenta and an edit model is told to replace them.
 */
export function FillExpandTool() {
  const qc = useQueryClient();
  const [image, setImage] = useState<AssetView | null>(null);
  const [mode, setMode] = useState<'fill' | 'expand'>('fill');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [prompt, setPrompt] = useState('');
  const [brush, setBrush] = useState(40);
  const [erase, setErase] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [stage, setStage] = useState<'idle' | 'preparing' | 'starting'>('idle');
  const view = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const { models, model, modelId, setModelId } = useStudioModel('i2i');
  const [settings, setSettings] = useState<Settings>({});
  useEffect(() => {
    if (model) setSettings((prev) => normalizeSettings(model, prev));
  }, [model]);

  useEffect(() => {
    setImg(null);
    setStrokes([]);
    if (!image?.url) return;
    let live = true;
    loadImage(image.url)
      .then((i) => live && setImg(i))
      .catch((e: unknown) => toast.error(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [image?.url]);

  const base = img ? fitWithin(img.naturalWidth, img.naturalHeight, MAX_SIDE) : null;
  const outSize = (() => {
    if (!base) return null;
    if (mode === 'fill') return base;
    const ar = aspectNumber(aspect);
    const w = base.width / base.height > ar ? base.width : Math.round(base.height * ar);
    const h = base.width / base.height > ar ? Math.round(base.width / ar) : base.height;
    return fitWithin(w, h, MAX_SIDE);
  })();

  // Draws the composite (image + magenta areas) into any canvas at any scale.
  const paint = (ctx: CanvasRenderingContext2D, width: number, height: number, preview: boolean) => {
    if (!img || !base || !outSize) return;
    ctx.clearRect(0, 0, width, height);
    const s = width / outSize.width;
    if (mode === 'fill') {
      ctx.drawImage(img, 0, 0, width, height);
      const mask = document.createElement('canvas');
      mask.width = width;
      mask.height = height;
      const m = mask.getContext('2d')!;
      for (const st of strokes) {
        m.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
        m.strokeStyle = MAGENTA;
        m.fillStyle = MAGENTA;
        m.lineCap = 'round';
        m.lineJoin = 'round';
        m.lineWidth = st.r * 2 * s;
        m.beginPath();
        st.points.forEach(([x, y], i) => (i ? m.lineTo(x * s, y * s) : m.moveTo(x * s, y * s)));
        if (st.points.length === 1) m.arc(st.points[0]![0] * s, st.points[0]![1] * s, st.r * s, 0, Math.PI * 2);
        st.points.length === 1 ? m.fill() : m.stroke();
      }
      ctx.globalAlpha = preview ? 0.6 : 1;
      ctx.drawImage(mask, 0, 0);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = preview ? 'rgba(255,0,255,0.35)' : MAGENTA;
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width / base.width, height / base.height);
      const w = base.width * scale;
      const h = base.height * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    }
  };

  useEffect(() => {
    const c = view.current;
    if (!c || !outSize) return;
    const box = c.parentElement!.getBoundingClientRect();
    const scale = Math.min(box.width / outSize.width, 560 / outSize.height, 1);
    c.width = Math.round(outSize.width * scale);
    c.height = Math.round(outSize.height * scale);
    paint(c.getContext('2d')!, c.width, c.height, true);
  });

  const toImageCoords = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * outSize!.width, ((e.clientY - rect.top) / rect.height) * outSize!.height];
  };

  const instruction =
    mode === 'fill'
      ? `Replace every solid magenta (#FF00FF) area with ${prompt.trim() || 'whatever naturally belongs there'}. Blend it seamlessly: match lighting, perspective, shadows, grain and colors. Keep everything outside the magenta areas exactly as it is. No magenta may remain.`
      : `Extend the photo into the solid magenta (#FF00FF) borders${prompt.trim() ? ` with ${prompt.trim()}` : ''}, continuing the scene naturally with matching lighting, perspective and colors. Keep the original photo area unchanged. No magenta may remain.`;
  const outAspect: AspectRatio = mode === 'expand' ? aspect : base ? aspectFromSize(base.width, base.height) : '1:1';
  const allowedAspect = model?.controls.aspects?.includes(outAspect) ? outAspect : undefined;
  const params = { ...settings, prompt: instruction, aspect: allowedAspect };
  const est = useEstimate(model?.id, params, 1);

  const run = useMutation({
    mutationFn: async () => {
      if (!img || !outSize || !image || !model || !est.data) throw new Error('Pick a photo first.');
      setStage('preparing');
      const c = document.createElement('canvas');
      c.width = outSize.width;
      c.height = outSize.height;
      paint(c.getContext('2d')!, c.width, c.height, false);
      const file = new File([await canvasBlob(c)], `${image.name} (${mode === 'fill' ? 'fill' : 'expand'} mask).png`, { type: 'image/png' });
      const prepared = await uploadAndWait(file, { source: 'derived', parentAssetId: image.id, queryClient: qc });
      setStage('starting');
      return api.post('/generate', { capability: 'i2i', modelId: model.id, params: { ...params, imageAssetId: prepared.id }, variants: 1, confirmCostUsd: est.data.estimate.usd, sourceRef: { tool: mode, sourceAssetId: image.id } });
    },
    onSuccess: () => {
      toast.success(mode === 'fill' ? 'Filling the marked areas' : 'Expanding the canvas');
      void qc.invalidateQueries({ queryKey: ['generations'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setStage('idle'),
  });
  const ready = !!img && !!model?.available && !!est.data && (mode === 'expand' || strokes.length > 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-2xl border bg-card p-5">
          <Segmented
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: 'fill', label: <><Paintbrush /> Fill area</> },
              { value: 'expand', label: <><Expand /> Expand canvas</> },
            ]}
          />
          <AssetSlot label="Photo" types={['image']} value={image} onChange={setImage} required />
          {mode === 'fill' ? (
            <div className="space-y-3">
              <Field label="Brush" aside={`${brush}px`}>
                <Slider min={8} max={160} step={2} value={[brush]} onValueChange={([v]) => setBrush(v ?? 40)} />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" variant={erase ? 'outline' : 'secondary'} onClick={() => setErase(false)}>
                  <Brush className="size-4" /> Paint
                </Button>
                <Button size="sm" variant={erase ? 'secondary' : 'outline'} onClick={() => setErase(true)}>
                  <Eraser className="size-4" /> Erase
                </Button>
                <Button size="sm" variant="ghost" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))}>
                  <Undo2 className="size-4" /> Undo
                </Button>
              </div>
            </div>
          ) : (
            <Field label="New aspect ratio">
              <Segmented value={aspect} onChange={(v) => setAspect(v)} options={(['9:16', '4:5', '1:1', '16:9'] as const).map((a) => ({ value: a, label: a }))} />
            </Field>
          )}
          <Field label={mode === 'fill' ? 'What should go there?' : 'What should the new area show? (optional)'}>
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={mode === 'fill' ? 'a ceramic coffee mug with steam' : 'more of the beach and sky'} />
          </Field>
          <Field label="Model">
            <ModelPicker models={models} value={modelId} onChange={setModelId} />
          </Field>
          {model && <SettingsControls model={{ ...model, controls: { ...model.controls, aspects: undefined } }} value={settings} onChange={setSettings} />}
          <div className="flex items-center gap-3 border-t pt-4">
            <CostSummary data={est.data} loading={est.isFetching} className="min-w-0 flex-1" />
            <Button variant="brand" disabled={!ready || run.isPending} loading={run.isPending} onClick={() => run.mutate()}>
              <Sparkles className="size-4" /> {stage === 'preparing' ? 'Preparing…' : stage === 'starting' ? 'Starting…' : `Generate${est.data ? ` · ${formatUsd(est.data.estimate.usd)}` : ''}`}
            </Button>
          </div>
          {mode === 'fill' && img && !strokes.length && <p className="text-xs text-muted-foreground">Paint over the parts to replace.</p>}
        </div>
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border checkerboard p-4">
          {img ? (
            <canvas
              ref={view}
              className="max-w-full touch-none rounded-lg shadow-2xl"
              style={{ cursor: mode === 'fill' ? 'crosshair' : 'default' }}
              onPointerDown={(e) => {
                if (mode !== 'fill') return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const s = outSize!.width / e.currentTarget.getBoundingClientRect().width;
                drawing.current = { r: (brush / 2) * s, erase, points: [toImageCoords(e)] };
                setStrokes((st) => [...st, drawing.current!]);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                drawing.current.points.push(toImageCoords(e));
                setStrokes((st) => [...st.slice(0, -1), { ...drawing.current! }]);
              }}
              onPointerUp={() => (drawing.current = null)}
              onPointerCancel={() => (drawing.current = null)}
            />
          ) : (
            <p className="rounded-lg bg-background/80 px-3 py-2 text-sm text-muted-foreground">Choose a photo to start</p>
          )}
        </div>
      </div>
      <RecentGenerations capabilities={['i2i']} title="Recent edits" />
    </div>
  );
}
