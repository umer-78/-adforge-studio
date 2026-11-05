'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Clapperboard, Film, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import * as THREE from 'three';
import { ASPECT_RATIOS, ASPECT_SIZES, type AspectRatio } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Notice, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api-client';
import { loadImage } from '@/lib/canvas';
import { useBrandColors } from '@/lib/hooks/use-brand-kits';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import { openVideoFrames, recordCanvasClip, renderCanvasClip, renderCanvasStill, videoAudio, type VideoFrames } from '@/lib/three/render-clip';
import type { AssetView } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { Device, DEVICES, DEVICES_BY_ID, FINISHES, type DeviceId, type DeviceSpec, type FinishId, type ScreenFit, type ScreenSource } from './devices';

type CameraMove = 'orbit' | 'push' | 'reveal' | 'float' | 'still';
const MOVES: { value: CameraMove; label: string }[] = [
  { value: 'orbit', label: 'Orbit' },
  { value: 'push', label: 'Push in' },
  { value: 'reveal', label: 'Reveal' },
  { value: 'float', label: 'Float' },
  { value: 'still', label: 'Still' },
];

/** Shown on the screen until a file is picked: one of the built-in template loops. */
const SAMPLE = { url: '/landing/showcase.mp4', kind: 'video' as const, aspect: 9 / 16, name: 'Sample clip' };
/** The preview holds the last frame of a move for a moment before starting over. */
const HOLD_S = 0.8;

interface Timing {
  exporting: boolean;
  lengthS: number;
}

/** Seconds into the clip: exact while rendering, looping in the preview. */
function clipTime(elapsed: number, t: Timing) {
  return t.exporting ? elapsed : elapsed % (t.lengthS + HOLD_S);
}

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Camera angle (degrees) and distance (times the full-view distance) at progress u. */
function shotAt(move: CameraMove, u: number, angle: number, height: number) {
  const e = easeInOut(u);
  switch (move) {
    case 'orbit':
      return { az: angle - 28 + 56 * e, el: height + 3 * Math.sin(Math.PI * u), dist: 1 };
    case 'push':
      return { az: angle + 12 * (1 - e), el: height + 8 * (1 - e), dist: 1.38 - 0.46 * e };
    case 'reveal':
      return { az: angle + 46 * (1 - e), el: height + 20 * (1 - e), dist: 0.5 + 0.5 * e };
    default:
      return { az: angle, el: height, dist: 1 };
  }
}

/** How far back the camera stands to keep the whole device in frame. */
function fitDistance([w, h, d]: DeviceSpec['bounds'], fov: number, aspect: number) {
  const v = THREE.MathUtils.degToRad(fov) / 2;
  const hz = Math.atan(Math.tan(v) * aspect);
  return Math.max(h / 2 / Math.tan(v), Math.max(w, d) / 2 / Math.tan(hz)) * 1.3 + d / 2;
}

function CameraRig({ spec, move, angle, height, timingRef }: { spec: DeviceSpec; move: CameraMove; angle: number; height: number; timingRef: RefObject<Timing> }) {
  const target = useMemo(() => new THREE.Vector3(...spec.target), [spec]);
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const t = clipTime(state.clock.elapsedTime, timingRef.current);
    const u = Math.min(1, t / Math.max(0.1, timingRef.current.lengthS));
    const shot = shotAt(move, u, angle, height);
    const d = fitDistance(spec.bounds, cam.fov, cam.aspect) * shot.dist;
    const az = THREE.MathUtils.degToRad(shot.az);
    const el = THREE.MathUtils.degToRad(shot.el);
    cam.position.set(target.x + d * Math.sin(az) * Math.cos(el), target.y + d * Math.sin(el), target.z + d * Math.cos(az) * Math.cos(el));
    cam.lookAt(target);
  });
  return null;
}

/** The float move: the device drifts and turns gently, coming back to rest at the end of the clip. */
function DeviceRig({ move, timingRef, children }: { move: CameraMove; timingRef: RefObject<Timing>; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    if (move !== 'float') {
      g.rotation.set(0, 0, 0);
      g.position.y = 0;
      return;
    }
    const a = (Math.PI * 2 * clipTime(state.clock.elapsedTime, timingRef.current)) / Math.max(0.1, timingRef.current.lengthS);
    g.rotation.y = 0.18 * Math.sin(a);
    g.rotation.x = 0.04 * Math.sin(a * 2);
    g.position.y = 0.05 * Math.sin(a);
  });
  return <group ref={group}>{children}</group>;
}

/** A soft vertical gradient behind the set, from the chosen color. */
function Backdrop({ color, outdoor }: { color: string; outdoor: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const base = new THREE.Color(color);
    const top = base.clone().lerp(new THREE.Color('#ffffff'), outdoor ? 0.4 : 0.12);
    const bottom = base.clone().lerp(new THREE.Color('#000000'), outdoor ? 0.08 : 0.5);
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(outdoor ? 0.62 : 0.45, `#${base.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [color, outdoor]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="background" object={texture} />;
}

function Lights({ accent, outdoor }: { accent: string; outdoor: boolean }) {
  return (
    <>
      <ambientLight intensity={outdoor ? 0.5 : 0.22} />
      <directionalLight
        position={outdoor ? [6, 9, 7] : [3, 5, 4]}
        intensity={outdoor ? 2.2 : 1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={8}
        shadow-camera-bottom={-4}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[5, 1.5, 1]} rotation-y={-Math.PI / 2} scale={[5, 2, 1]} />
        <Lightformer form="ring" intensity={1.8} position={[0, 1.5, -5]} scale={3} color={accent} />
      </Environment>
    </>
  );
}

function Floor({ spec, color, live }: { spec: DeviceSpec; color: string; live: boolean }) {
  if (spec.outdoor) {
    const ground = new THREE.Color(color).lerp(new THREE.Color('#5d6068'), 0.75);
    return (
      <>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[40, 64]} />
          <meshStandardMaterial color={ground} roughness={0.95} />
        </mesh>
        <fog attach="fog" args={[color, 14, 46]} />
      </>
    );
  }
  return <ContactShadows position={[0, spec.floorY, 0]} opacity={0.6} scale={Math.max(6, spec.bounds[0] * 2.4)} blur={2.4} far={3} frames={live ? Infinity : 1} />;
}

/** Hands the canvas store to the panel, so it can render frames on demand. */
function StoreBridge({ storeRef }: { storeRef: RefObject<(() => RootState) | null> }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    storeRef.current = get;
    return () => {
      storeRef.current = null;
    };
  }, [get, storeRef]);
  return null;
}

type Media = { url: string; kind: 'video' | 'image'; aspect: number; name: string };

function mediaOf(asset: AssetView | null): Media {
  if (!asset) return SAMPLE;
  const aspect = asset.width && asset.height ? asset.width / asset.height : 9 / 16;
  if (asset.type === 'video') return { url: asset.proxyUrl ?? asset.url ?? '', kind: 'video', aspect, name: asset.name };
  return { url: asset.url ?? asset.thumbnailUrl ?? '', kind: 'image', aspect, name: asset.name };
}

/** Puts an ad on a phone, tablet, laptop, TV or billboard, with a camera move, and renders it to video. */
export function DeviceStudio({ initial }: { initial: AssetView | null }) {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const brand = useBrandColors();
  const [screen, setScreen] = useState<AssetView | null>(initial);
  const [deviceId, setDeviceId] = useState<DeviceId>('phone');
  const [finish, setFinish] = useState<FinishId>('graphite');
  const [fit, setFit] = useState<ScreenFit>('cover');
  const [move, setMove] = useState<CameraMove>('orbit');
  const [angle, setAngle] = useState(-16);
  const [height, setHeight] = useState(8);
  const [background, setBackground] = useState('#1b1533');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [lengthS, setLengthS] = useState(6);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState<null | 'clip' | 'still'>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AssetView | null>(null);
  const storeRef = useRef<(() => RootState) | null>(null);
  const timingRef = useRef<Timing>({ exporting: false, lengthS: 6 });
  const screenRef = useRef<ScreenSource>({ texture: null, aspect: SAMPLE.aspect, fit: 'cover' });
  const previewVideo = useRef<HTMLVideoElement | null>(null);

  const spec = DEVICES_BY_ID[deviceId];
  const media = mediaOf(screen);
  const size = ASPECT_SIZES[aspect];
  const swatches = [...new Set([...brand, '#1b1533', '#0b0b12', '#e9e7f2', '#f6f1ea', '#bcd7f5'])].slice(0, 8);

  // A different linked file (from the URL) replaces the one picked here; the same one never does.
  const [linkedId, setLinkedId] = useState(initial?.id);
  if (initial && initial.id !== linkedId) {
    setLinkedId(initial.id);
    setScreen(initial);
  }
  useEffect(() => {
    timingRef.current.lengthS = lengthS;
  }, [lengthS]);
  useEffect(() => {
    screenRef.current.fit = fit;
  }, [fit]);
  const pickDevice = (id: DeviceId) => {
    setDeviceId(id);
    // Outdoor sets read best in daylight; switching back keeps the studio color.
    if (DEVICES_BY_ID[id].outdoor) setBackground((c) => (c === '#1b1533' ? '#9cc3ef' : c));
  };

  // The live preview: a looping muted video, or the image, as the screen texture.
  useEffect(() => {
    if (!media.url) return;
    const screen = screenRef.current;
    let disposed = false;
    let texture: THREE.Texture | null = null;
    screen.aspect = media.aspect;
    if (media.kind === 'video') {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = media.url;
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) screen.aspect = video.videoWidth / video.videoHeight;
      });
      void video.play().catch(() => undefined);
      previewVideo.current = video;
      texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      screen.texture = texture;
      return () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        previewVideo.current = null;
        if (screen.texture === texture) screen.texture = null;
        texture?.dispose();
      };
    }
    void loadImage(media.url)
      .then((img) => {
        if (disposed) return;
        texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        screen.texture = texture;
        screen.aspect = img.naturalWidth / img.naturalHeight;
      })
      .catch((e: unknown) => toast.error(errorMessage(e)));
    return () => {
      disposed = true;
      if (texture && screen.texture === texture) screen.texture = null;
      texture?.dispose();
    };
  }, [media.url, media.kind, media.aspect]);

  const baseName = `${media.name} ${spec.label.toLowerCase()} mockup ${aspect.replace(':', 'x')}`;

  const upload = async (file: File): Promise<AssetView> => {
    let saved: AssetView | null = null;
    await startUploads([file], { source: 'render', parentAssetId: screen?.id, isAiGenerated: screen?.isAiGenerated ?? false, queryClient: qc, onUploaded: (a) => (saved = a) });
    if (!saved) throw new Error('The upload failed. Check the upload tray for details.');
    return saved;
  };

  const exportClip = async () => {
    const get = storeRef.current;
    if (!get || !media.url) return;
    setBusy('clip');
    setProgress(0);
    setResult(null);
    const live = { texture: screenRef.current.texture, aspect: screenRef.current.aspect };
    let frames: VideoFrames | null = null;
    timingRef.current.exporting = true;
    try {
      let file: File;
      if (typeof VideoEncoder === 'undefined') {
        file = await recordCanvasClip(get, lengthS, baseName, () => previewVideo.current && (previewVideo.current.currentTime = 0), setProgress);
      } else {
        if (media.kind === 'video') {
          frames = await openVideoFrames(new URL(media.url, window.location.href).href);
          screenRef.current.texture = frames.texture;
          screenRef.current.aspect = frames.aspect;
        }
        const reader = frames;
        file = await renderCanvasClip({
          get,
          size,
          lengthS,
          name: baseName,
          beforeFrame: reader ? (t) => reader.seek(t) : undefined,
          audio: media.kind === 'video' && sound ? videoAudio(new URL(media.url, window.location.href).href, lengthS) : undefined,
          onProgress: setProgress,
        });
      }
      setProgress(100);
      setResult(await upload(file));
      toast.success('Mockup clip saved to your library');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      timingRef.current.exporting = false;
      screenRef.current.texture = live.texture;
      screenRef.current.aspect = live.aspect;
      await frames?.close().catch(() => undefined);
      setBusy(null);
    }
  };

  const saveStill = async () => {
    const get = storeRef.current;
    if (!get) return;
    setBusy('still');
    try {
      const blob = await renderCanvasStill(get, size);
      await upload(new File([blob], `${baseName}.png`, { type: 'image/png' }));
      toast.success('Still saved to your library');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-4 self-start rounded-2xl border bg-card p-5 lg:sticky lg:top-20">
        <AssetSlot
          label="On the screen"
          types={['video', 'image']}
          value={screen}
          onChange={(a) => (setScreen(a), setResult(null))}
          hint={screen ? undefined : 'A video or image from your library. Until you pick one, a sample clip plays.'}
        />
        <Field label="Device">
          <Segmented size="sm" value={deviceId} onChange={pickDevice} options={DEVICES.map((d) => ({ value: d.id, label: d.label }))} />
        </Field>
        {spec.finishes && (
          <Field label="Finish" aside={FINISHES[finish].label}>
            <div className="flex gap-2">
              {(Object.keys(FINISHES) as FinishId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={FINISHES[id].label}
                  aria-pressed={finish === id}
                  onClick={() => setFinish(id)}
                  className={cn('size-7 rounded-full border transition hover:scale-110', finish === id && 'ring-2 ring-ring ring-offset-2 ring-offset-background')}
                  style={{ background: `linear-gradient(135deg, ${FINISHES[id].body}, #00000055)` }}
                />
              ))}
            </div>
          </Field>
        )}
        <Field label="Picture">
          <Segmented
            size="sm"
            value={fit}
            onChange={setFit}
            options={[
              { value: 'cover', label: 'Fill the screen' },
              { value: 'contain', label: 'Show all of it' },
            ]}
          />
        </Field>
        <Field label="Camera move">
          <Segmented size="sm" value={move} onChange={setMove} options={MOVES} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Angle" aside={`${angle}°`}>
            <Slider min={-60} max={60} step={1} value={[angle]} onValueChange={([v]) => setAngle(v ?? 0)} />
          </Field>
          <Field label="Height" aside={`${height}°`}>
            <Slider min={-15} max={40} step={1} value={[height]} onValueChange={([v]) => setHeight(v ?? 0)} />
          </Field>
        </div>
        <Field label={spec.outdoor ? 'Sky' : 'Background'}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border" style={{ background }}>
              <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Background color" />
            </label>
            <Input value={background} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setBackground(e.target.value)} className="h-8 w-24 font-mono text-xs" />
            {swatches.map((c) => (
              <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => setBackground(c)} className={cn('size-6 rounded-full border transition hover:scale-110', c.toLowerCase() === background.toLowerCase() && 'ring-2 ring-ring ring-offset-1 ring-offset-background')} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <div className="space-y-3 rounded-xl bg-surface-2/60 p-3">
          <Field label="Clip format">
            <Segmented size="sm" value={aspect} onChange={setAspect} options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <Field label="Length" aside={`${lengthS}s`}>
            <Slider min={3} max={20} step={1} value={[lengthS]} onValueChange={([v]) => setLengthS(v ?? 6)} />
          </Field>
          {media.kind === 'video' && screen && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Keep the video&apos;s sound</span>
              <Switch checked={sound} onCheckedChange={setSound} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={!media.url || !!busy} loading={busy === 'clip'} onClick={() => void exportClip()}>
              <Film className="size-4" /> Render clip
            </Button>
            <Button variant="outline" disabled={!media.url || !!busy} loading={busy === 'still'} onClick={() => void saveStill()}>
              <Camera className="size-4" /> Save still
            </Button>
          </div>
          {busy === 'clip' && <Progress value={progress} className="h-1.5" />}
          <p className="text-xs text-muted-foreground">
            Renders {size.width}×{size.height} at 30 fps in your browser, frame by frame, then saves it to your library.
          </p>
        </div>
        {result && (
          <Notice
            tone="success"
            title="Clip saved"
            action={
              <Button size="xs" variant="outline" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [result.id], name: `${media.name} on a ${spec.label.toLowerCase()}`, aspect })}>
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
        <div className="flex justify-center rounded-2xl border bg-surface-2/40 p-4">
          <div className="relative w-full overflow-hidden rounded-xl shadow-2xl" style={{ maxWidth: `min(100%, calc(max(20rem, 100svh - 20rem) * ${size.width / size.height}))`, aspectRatio: `${size.width} / ${size.height}` }}>
            <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [0, 0.4, 4], fov: 30, near: 0.05, far: 200 }}>
              <StoreBridge storeRef={storeRef} />
              <Backdrop color={background} outdoor={!!spec.outdoor} />
              {/* Lighting and contact shadows are baked once, so a new device or accent remounts them. */}
              <Lights key={`${brand[0] ?? ''}-${!!spec.outdoor}`} accent={brand[0] ?? '#7c5cff'} outdoor={!!spec.outdoor} />
              <DeviceRig move={move} timingRef={timingRef}>
                <Device id={deviceId} finish={finish} screenRef={screenRef} />
              </DeviceRig>
              <Floor key={deviceId} spec={spec} color={background} live={move === 'float'} />
              <CameraRig spec={spec} move={move} angle={angle} height={height} timingRef={timingRef} />
            </Canvas>
            {busy === 'clip' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-sm font-medium">Rendering {Math.round(progress)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
