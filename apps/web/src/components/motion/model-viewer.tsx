'use client';

import { Bounds, ContactShadows, Environment, Float, Html, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import { advance, Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Camera, Clapperboard, Film, Loader2 } from 'lucide-react';
import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import Link from 'next/link';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import * as THREE from 'three';
import { ASPECT_RATIOS, ASPECT_SIZES, type AspectRatio } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { EmptyState, Field, Notice, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { canvasBlob, recorderMime } from '@/lib/canvas';
import { useBrandColors } from '@/lib/hooks/use-brand-kits';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cn } from '@/lib/utils';

useGLTF.setDecoderPath('/draco/');

type Scene = 'studio' | 'podium' | 'floating' | 'spotlight';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'podium', label: 'Podium' },
  { value: 'floating', label: 'Floating' },
  { value: 'spotlight', label: 'Spotlight' },
];
const FPS = 30;

interface TurntableState {
  /** Set while exporting: rotation follows the clock so every frame is exact. */
  exporting: boolean;
  lengthS: number;
  autoRotate: boolean;
  speed: number;
}

/** Spins its children: freely in the preview, exactly one turn per clip while exporting. */
function Turntable({ state, children }: { state: RefObject<TurntableState>; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  // the angle the free spin had reached, so an export starts from where the preview stood
  const baseAngle = useRef(0);
  useFrame((root, delta) => {
    const g = group.current;
    const s = state.current;
    if (!g || !s) return;
    if (s.exporting) {
      g.rotation.y = baseAngle.current + (Math.PI * 2 * root.clock.elapsedTime) / s.lengthS;
      return;
    }
    if (s.autoRotate) g.rotation.y += Math.min(delta, 0.1) * s.speed;
    baseAngle.current = g.rotation.y;
  });
  return <group ref={group}>{children}</group>;
}

/** The GLB scaled to a one-unit box, standing on the floor at y = -0.5. */
function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const object = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1 / Math.max(size.x, size.y, size.z, 1e-6);
    const wrap = new THREE.Group();
    scene.position.set(-center.x, -box.min.y, -center.z);
    wrap.add(scene);
    wrap.scale.setScalar(scale);
    wrap.position.y = -0.5;
    return wrap;
  }, [gltf.scene]);
  return <primitive object={object} />;
}

function Lights({ scene, accent }: { scene: Scene; accent: string }) {
  return (
    <>
      <ambientLight intensity={scene === 'spotlight' ? 0.05 : 0.25} />
      {scene === 'spotlight' ? (
        <spotLight position={[0, 4, 1.5]} angle={0.42} penumbra={0.7} intensity={60} castShadow shadow-mapSize={[2048, 2048]} />
      ) : (
        <directionalLight position={[2.5, 4, 3]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} />
      )}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={scene === 'spotlight' ? 0.6 : 2.2} position={[0, 3, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={scene === 'spotlight' ? 0.3 : 1.1} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={scene === 'spotlight' ? 0.3 : 1.1} position={[4, 1, 1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={scene === 'spotlight' ? 3 : 1.6} position={[0, 1.2, -4]} scale={2.5} color={accent} />
      </Environment>
    </>
  );
}

function Stage({ scene, accent, floor }: { scene: Scene; accent: string; floor: string }) {
  if (scene === 'podium')
    return (
      <>
        <mesh position={[0, -0.6, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.72, 0.78, 0.2, 96]} />
          <meshStandardMaterial color={accent} roughness={0.35} metalness={0.1} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={-0.7} receiveShadow>
          <circleGeometry args={[6, 96]} />
          <meshStandardMaterial color={floor} roughness={0.9} />
        </mesh>
      </>
    );
  if (scene === 'spotlight')
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={-0.501} receiveShadow>
        <circleGeometry args={[4, 96]} />
        <meshStandardMaterial color={floor} roughness={0.25} metalness={0.65} />
      </mesh>
    );
  return <ContactShadows position={[0, scene === 'floating' ? -0.75 : -0.5, 0]} opacity={0.55} scale={5} blur={2.6} far={2} frames={scene === 'floating' ? Infinity : 1} />;
}

/** Exposes the R3F store to the panel so it can render frames on demand. */
function StoreBridge({ onReady }: { onReady: (get: () => RootState) => void }) {
  const get = useThree((s) => s.get);
  useEffect(() => onReady(get), [get, onReady]);
  return null;
}

class ModelBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || 'The model could not be loaded.' };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <Html center>
          <div className="w-64 rounded-xl border bg-card p-3 text-center text-xs text-destructive shadow-lg">This model could not be opened. It may be damaged or use an unsupported format.</div>
        </Html>
      );
    return this.props.children;
  }
}

type Saved = { frameloop: RootState['frameloop']; dpr: number; size: RootState['size'] };

/** Back to the live preview after rendering frames by hand. */
function restore(state: RootState, prev: Saved) {
  state.setDpr(prev.dpr);
  state.setSize(prev.size.width, prev.size.height, prev.size.top, prev.size.left);
  state.setFrameloop(prev.frameloop);
  // Hand-set clock times would otherwise turn into one huge frame delta.
  state.clock.start();
}

/** Renders frames at the export size, one at a time, so clips are smooth on any device. */
async function renderClip(get: () => RootState, turntable: TurntableState, size: { width: number; height: number }, lengthS: number, onProgress: (pct: number) => void): Promise<File> {
  const state = get();
  const canvas = state.gl.domElement;
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: size.width, height: size.height });
  if (!codec) throw new Error('This browser cannot encode video. Use a recent Chrome, Edge, Safari or Firefox.');
  const mp4 = codec === 'avc';
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: FPS });

  const prev: Saved = { frameloop: state.frameloop, dpr: state.viewport.dpr, size: { ...state.size } };
  const camera = state.camera as THREE.PerspectiveCamera;
  turntable.exporting = true;
  turntable.lengthS = lengthS;
  state.setFrameloop('never');
  state.gl.setPixelRatio(1);
  state.gl.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  state.clock.elapsedTime = 0;
  try {
    await output.start();
    const frames = Math.round(lengthS * FPS);
    for (let i = 0; i < frames; i++) {
      advance(i / FPS, true, get());
      await source.add(i / FPS, 1 / FPS);
      if (i % 5 === 0) onProgress((i / frames) * 100);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    turntable.exporting = false;
    restore(state, prev);
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('The clip came out empty.');
  const type = mp4 ? 'video/mp4' : 'video/webm';
  return new File([buffer], `turntable.${mp4 ? 'mp4' : 'webm'}`, { type });
}

/** Fallback for browsers without WebCodecs: records the live canvas in real time. */
function recordClip(get: () => RootState, turntable: TurntableState, lengthS: number, onProgress: (pct: number) => void): Promise<File> {
  const fmt = recorderMime();
  if (!fmt) return Promise.reject(new Error('This browser cannot record video. Try Chrome, Edge or Safari.'));
  const state = get();
  const stream = state.gl.domElement.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 16_000_000 });
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => reject(new Error('Recording failed.'));
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      turntable.exporting = false;
      const type = fmt.mime.split(';')[0]!;
      resolve(new File([new Blob(chunks, { type })], `turntable.${fmt.ext}`, { type }));
    };
    const start = performance.now();
    turntable.exporting = true;
    turntable.lengthS = lengthS;
    state.clock.elapsedTime = 0;
    state.clock.start();
    rec.start(250);
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      onProgress(Math.min(100, (t / lengthS) * 100));
      if (t < lengthS) requestAnimationFrame(tick);
      else rec.stop();
    };
    requestAnimationFrame(tick);
  });
}

async function renderStill(get: () => RootState, size: { width: number; height: number }): Promise<Blob> {
  const state = get();
  const prev: Saved = { frameloop: state.frameloop, dpr: state.viewport.dpr, size: { ...state.size } };
  const camera = state.camera as THREE.PerspectiveCamera;
  state.setFrameloop('never');
  state.gl.setPixelRatio(1);
  state.gl.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  try {
    advance(state.clock.elapsedTime, true, get());
    return await canvasBlob(state.gl.domElement, 'image/png');
  } finally {
    restore(state, prev);
  }
}

/** Shows a 3D model on a styled set and renders turntable clips and stills from it. */
export function ModelViewer({ initial }: { initial: AssetView | null }) {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const brand = useBrandColors();
  const [model, setModel] = useState<AssetView | null>(initial);
  const [scene, setScene] = useState<Scene>('studio');
  const [background, setBackground] = useState('#e9e7f2');
  const [accent, setAccent] = useState('#7c5cff');
  const [autoRotate, setAutoRotate] = useState(true);
  const [speed, setSpeed] = useState(0.6);
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [lengthS, setLengthS] = useState(6);
  const [busy, setBusy] = useState<null | 'clip' | 'still'>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AssetView | null>(null);
  const store = useRef<(() => RootState) | null>(null);
  const turntable = useRef<TurntableState>({ exporting: false, lengthS: 6, autoRotate: true, speed: 0.6 });
  useEffect(() => {
    turntable.current.autoRotate = autoRotate && !busy;
    turntable.current.speed = speed;
  });
  useEffect(() => {
    if (initial) setModel(initial);
    // Only a different linked model replaces the one picked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const dark = scene === 'spotlight';
  const bg = dark ? '#060609' : background;
  const floor = dark ? '#101014' : background;
  const size = ASPECT_SIZES[aspect];
  const swatches = [...new Set([...brand, '#e9e7f2', '#f6f1ea', '#0b0b12', '#dfe9f5'])].slice(0, 8);

  const upload = async (file: File, name: string): Promise<AssetView> => {
    let saved: AssetView | null = null;
    await startUploads([new File([file], name, { type: file.type })], { source: 'render', parentAssetId: model?.id, isAiGenerated: model?.isAiGenerated ?? false, queryClient: qc, onUploaded: (a) => (saved = a) });
    if (!saved) throw new Error('The upload failed. Check the upload tray for details.');
    return saved;
  };

  const exportClip = async () => {
    const get = store.current;
    if (!get || !model) return;
    setBusy('clip');
    setProgress(0);
    setResult(null);
    try {
      const file = typeof VideoEncoder === 'undefined' ? await recordClip(get, turntable.current, lengthS, setProgress) : await renderClip(get, turntable.current, size, lengthS, setProgress);
      setProgress(100);
      const asset = await upload(file, `${model.name} turntable ${aspect.replace(':', 'x')}.${file.name.split('.').pop()}`);
      setResult(asset);
      toast.success('Turntable clip saved to your library');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const saveStill = async () => {
    const get = store.current;
    if (!get || !model) return;
    setBusy('still');
    try {
      const blob = await renderStill(get, size);
      await upload(new File([blob], 'still.png', { type: 'image/png' }), `${model.name} ${scene} ${aspect.replace(':', 'x')}.png`);
      toast.success('Still saved to your library');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const colorRow = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
        </label>
        <Input value={value} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value)} className="h-8 w-24 font-mono text-xs" />
        {swatches.map((c) => (
          <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => onChange(c)} className={cn('size-6 rounded-full border transition hover:scale-110', c.toLowerCase() === value.toLowerCase() && 'ring-2 ring-ring ring-offset-1 ring-offset-background')} style={{ background: c }} />
        ))}
      </div>
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-4 self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-20">
        <AssetSlot label="3D model" types={['model3d']} value={model} onChange={(a) => (setModel(a), setResult(null))} required hint="GLB or glTF. Make one from a product photo in the Image to 3D tab." />
        <Field label="Set">
          <Segmented value={scene} onChange={setScene} options={SCENES} />
        </Field>
        {!dark && colorRow({ label: 'Background', value: background, onChange: setBackground })}
        {colorRow({ label: scene === 'podium' ? 'Podium' : 'Accent light', value: accent, onChange: setAccent })}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Spin in preview</span>
          <Switch checked={autoRotate} onCheckedChange={setAutoRotate} />
        </label>
        {autoRotate && (
          <Field label="Speed" aside={`${speed.toFixed(1)}×`}>
            <Slider min={0.1} max={2} step={0.1} value={[speed]} onValueChange={([v]) => setSpeed(v ?? 0.6)} />
          </Field>
        )}
        <div className="space-y-3 rounded-xl bg-surface-2/60 p-3">
          <Field label="Clip format">
            <Segmented size="sm" value={aspect} onChange={setAspect} options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <Field label="One full turn in" aside={`${lengthS}s`}>
            <Slider min={3} max={15} step={1} value={[lengthS]} onValueChange={([v]) => setLengthS(v ?? 6)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={!model || !!busy} loading={busy === 'clip'} onClick={() => void exportClip()}>
              <Film className="size-4" /> Render turntable clip
            </Button>
            <Button variant="outline" disabled={!model || !!busy} loading={busy === 'still'} onClick={() => void saveStill()}>
              <Camera className="size-4" /> Save still
            </Button>
          </div>
          {busy === 'clip' && <Progress value={progress} className="h-1.5" />}
          <p className="text-xs text-muted-foreground">
            Renders {size.width}×{size.height} in your browser at 30 fps, then saves it to your library. Drag the model to choose the starting angle.
          </p>
        </div>
        {result && (
          <Notice
            tone="success"
            title="Clip saved"
            action={
              <Button size="xs" variant="outline" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [result.id], name: `${model?.name ?? 'Product'} turntable`, aspect })}>
                <Clapperboard className="size-3.5" /> Edit it
              </Button>
            }
          >
            <Link href={`/library/${result.id}`} className="underline underline-offset-2">
              {result.name}
            </Link>
          </Notice>
        )}
      </div>

      <div className="min-w-0">
        {model?.url ? (
          <div className="flex justify-center rounded-2xl border bg-surface-2/40 p-4">
            <div className="relative w-full overflow-hidden rounded-xl shadow-2xl" style={{ maxWidth: `min(100%, calc(72vh * ${size.width / size.height}))`, aspectRatio: `${size.width} / ${size.height}` }}>
              <Canvas key={model.id} shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [0, 0.35, 3.1], fov: 35 }}>
                <color attach="background" args={[bg]} />
                {dark && <fog attach="fog" args={[bg, 4, 9]} />}
                <StoreBridge onReady={(get) => (store.current = get)} />
                <Lights scene={scene} accent={accent} />
                <ModelBoundary resetKey={model.id}>
                  <Suspense
                    fallback={
                      <Html center>
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                      </Html>
                    }
                  >
                    <Bounds fit clip observe margin={1.25}>
                      <Turntable state={turntable}>
                        {scene === 'floating' ? (
                          <Float speed={2} rotationIntensity={0.15} floatIntensity={0.5}>
                            <Model url={model.url} />
                          </Float>
                        ) : (
                          <Model url={model.url} />
                        )}
                      </Turntable>
                    </Bounds>
                  </Suspense>
                </ModelBoundary>
                <Stage scene={scene} accent={accent} floor={floor} />
                <OrbitControls makeDefault enablePan={false} minDistance={1.2} maxDistance={8} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.05} />
              </Canvas>
              {busy === 'clip' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span className="text-sm font-medium">Rendering {Math.round(progress)}%</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Box />}
            title={model ? 'This model is still processing' : 'Pick a 3D model'}
            description="Choose a GLB from your library, or turn a product photo into a 3D model first."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/motion?tab=model">Make a 3D model</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
