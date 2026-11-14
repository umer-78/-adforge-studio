'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Circle, Layers3, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ASPECT_SIZES, formatUsd, type AspectRatio } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { CostSummary, useEstimate } from '@/components/generate/cost-estimate';
import { Button } from '@/components/ui/button';
import { Field, Notice, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { api, errorMessage } from '@/lib/api-client';
import { loadImage, recorderMime } from '@/lib/canvas';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView, GenerationView, Page } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cameraAt, ParallaxRenderer, type Motion } from './parallax-renderer';
import { useOnChange } from '@/lib/hooks/use-on-change';

const DEPTH_MODEL = 'depth-anything-v2';
const MOTIONS: { value: Motion; label: string }[] = [
  { value: 'dolly', label: 'Push in' },
  { value: 'zoomout', label: 'Pull out' },
  { value: 'pan', label: 'Slide' },
  { value: 'orbit', label: 'Orbit' },
];

/** Photo → 3D parallax clip: an AI depth map drives a WebGL camera move, recorded to video in the browser. */
export function ParallaxTool() {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const [image, setImage] = useState<AssetView | null>(null);
  const [motion, setMotion] = useState<Motion>('dolly');
  const [strength, setStrength] = useState(0.6);
  const [focus, setFocus] = useState(0.45);
  const [duration, setDuration] = useState(6);
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [recording, setRecording] = useState(0);
  const [result, setResult] = useState<AssetView | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ParallaxRenderer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const settings = useRef({ motion, strength, focus, duration });
  useEffect(() => { settings.current = { motion, strength, focus, duration }; });
  const recordingRef = useRef(false);

  const depth = useQuery({
    queryKey: ['generations', 'depth', image?.id],
    queryFn: () => api.get<Page<GenerationView>>(`/generations?capability=depth&limit=100`).then((r) => r.items.find((g) => g.inputs.some((a) => a.id === image!.id) && g.status !== 'failed' && g.status !== 'canceled') ?? null),
    enabled: !!image,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'queued' || q.state.data.status === 'running') ? 3000 : false),
  });
  const depthAsset = depth.data?.status === 'succeeded' ? (depth.data.outputs[0] ?? null) : null;
  const est = useEstimate(image && !depth.data ? DEPTH_MODEL : undefined, { imageAssetId: image?.id }, 1);
  const makeDepth = useMutation({
    mutationFn: () => api.post('/generate', { capability: 'depth', modelId: DEPTH_MODEL, params: { imageAssetId: image!.id }, variants: 1, confirmCostUsd: est.data?.estimate.usd ?? 0 }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['generations', 'depth'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Load textures once both the photo and its depth map exist.
  useOnChange([image?.url, depthAsset?.url], () => setLoaded(false));
  useEffect(() => {
    if (!image?.url || !depthAsset?.url || !canvas.current) return;
    let live = true;
    const c = canvas.current;
    Promise.all([loadImage(image.url), loadImage(depthAsset.url)])
      .then(([img, d]) => {
        if (!live) return;
        renderer.current ??= new ParallaxRenderer(c);
        renderer.current.setImages(img, d);
        setLoaded(true);
      })
      .catch((e: unknown) => toast.error(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [image?.url, depthAsset?.url]);

  useEffect(() => () => renderer.current?.dispose(), []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const size = ASPECT_SIZES[aspect];
    c.width = size.width;
    c.height = size.height;
  }, [aspect]);

  // Preview loop: ping-pong so the move loops smoothly.
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (!recordingRef.current) {
        const s = settings.current;
        const cycle = ((now - start) / 1000 / s.duration) % 1;
        const t = s.motion === 'orbit' ? cycle : cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
        renderer.current?.draw(cameraAt(s.motion, t, s.strength), s.focus);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const record = () => {
    const c = canvas.current;
    const fmt = recorderMime();
    if (!c || !renderer.current || !image) return;
    if (!fmt) return toast.error('This browser cannot record video. Try Chrome, Edge or Safari.');
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      recordingRef.current = false;
      setRecording(0);
      stream.getTracks().forEach((t) => t.stop());
      const file = new File([new Blob(chunks, { type: fmt.mime.split(';')[0] })], `${image.name} parallax.${fmt.ext}`, { type: fmt.mime.split(';')[0]! });
      void startUploads([file], { source: 'render', parentAssetId: image.id, isAiGenerated: true, queryClient: qc, onUploaded: (a) => setResult(a) });
      toast.success('Saving the clip to your library');
    };
    recordingRef.current = true;
    const { motion: m, strength: s, focus: f, duration: d } = settings.current;
    const start = performance.now();
    rec.start(250);
    const frame = (now: number) => {
      const t = (now - start) / 1000 / d;
      renderer.current?.draw(cameraAt(m, Math.min(1, t), s), f);
      setRecording(Math.min(100, t * 100));
      if (t < 1) requestAnimationFrame(frame);
      else rec.stop();
    };
    requestAnimationFrame(frame);
  };

  const fal = est.error ? errorMessage(est.error) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <div className="space-y-5 rounded-2xl border bg-card p-5">
        <AssetSlot label="Photo" types={['image']} value={image} onChange={(a) => (setImage(a), setResult(null))} required />
        {image && !depth.isLoading && !depth.data && (
          <div className="space-y-3 rounded-xl border bg-surface-2 p-3">
            <p className="text-[13px]">First, AI estimates how far away each pixel is. This depth map is reused for every move you render from this photo.</p>
            <div className="flex items-center gap-3">
              <CostSummary data={est.data} error={fal} className="min-w-0 flex-1" />
              <Button size="sm" variant="brand" disabled={!est.data} loading={makeDepth.isPending} onClick={() => makeDepth.mutate()}>
                <Layers3 className="size-4" /> Make depth map{est.data ? ` · ${formatUsd(est.data.estimate.usd)}` : ''}
              </Button>
            </div>
          </div>
        )}
        {depth.data && depth.data.status !== 'succeeded' && <Notice tone="info">Estimating depth… this takes a few seconds.</Notice>}
        <Field label="Camera move">
          <Segmented value={motion} onChange={setMotion} options={MOTIONS} />
        </Field>
        <Field label="Strength" aside={`${Math.round(strength * 100)}%`}>
          <Slider min={0.1} max={1} step={0.05} value={[strength]} onValueChange={([v]) => setStrength(v ?? 0.6)} />
        </Field>
        <Field label="Focus depth" hint="The distance that stays still; lower values make the background move more.">
          <Slider min={0} max={1} step={0.05} value={[focus]} onValueChange={([v]) => setFocus(v ?? 0.45)} />
        </Field>
        <Field label="Length" aside={`${duration} s`}>
          <Slider min={3} max={12} step={1} value={[duration]} onValueChange={([v]) => setDuration(v ?? 6)} />
        </Field>
        <Field label="Format">
          <Segmented value={aspect} onChange={setAspect} options={(['9:16', '4:5', '1:1', '16:9'] as const).map((a) => ({ value: a, label: a }))} />
        </Field>
        <div className="space-y-2 border-t pt-4">
          {recording > 0 && <Progress value={recording} />}
          <Button variant="brand" className="w-full" disabled={!loaded || recording > 0} onClick={record}>
            {recording > 0 ? <Square className="size-4 fill-current" /> : <Circle className="size-4 fill-current" />} {recording > 0 ? 'Recording…' : `Render ${duration}s clip`}
          </Button>
          <p className="text-xs text-muted-foreground">Rendered on your device, so it costs nothing. Keep this tab visible while it records.</p>
          {result && (
            <Button variant="secondary" className="w-full" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [result.id], name: `${image?.name ?? 'Photo'} parallax`, aspect })}>
              <Clapperboard className="size-4" /> Open clip in editor
            </Button>
          )}
        </div>
      </div>
      <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border bg-black p-4">
        <canvas ref={canvas} className="max-h-[70vh] max-w-full rounded-lg" style={{ aspectRatio: `${ASPECT_SIZES[aspect].width} / ${ASPECT_SIZES[aspect].height}`, display: loaded ? 'block' : 'none' }} />
        {!loaded && <p className="text-sm text-white/60">{image ? (depthAsset ? 'Loading…' : 'Make a depth map to preview the move') : 'Choose a photo to start'}</p>}
      </div>
    </div>
  );
}
