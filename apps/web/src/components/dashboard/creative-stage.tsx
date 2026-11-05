'use client';

import { Environment, Lightformer, Sparkles } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { Device, roundedPlane, useGeometry, type ScreenSource } from '@/components/motion/devices';
import { isLowPowerDevice, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Something from the library shown on the stage. `id` is null for the built-in samples. */
export interface StageItem {
  id: string | null;
  name: string;
  /** A still: the floating card, and the phone screen until the video starts. */
  poster: string | null;
  /** Plays on the phone screen. */
  video: string | null;
  /** Width over height. */
  aspect: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

let webglChecked: boolean | null = null;
function hasWebGL(): boolean {
  if (webglChecked !== null) return webglChecked;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    webglChecked = !!gl;
    // Hand the test context back; browsers only allow a few at a time.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

function useImageTexture(url: string | null): THREE.Texture | null {
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let texture: THREE.Texture | null = null;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(
      url,
      (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        texture = t;
        setLoaded({ url, texture: t });
      },
      undefined,
      () => undefined,
    );
    return () => {
      alive = false;
      texture?.dispose();
    };
  }, [url]);
  return url && loaded?.url === url ? loaded.texture : null;
}

/** Time that only moves while the stage renders, so pausing never replays the entrance. */
function Ticker({ timeRef, still }: { timeRef: RefObject<number>; still: boolean }) {
  useFrame((_, dt) => {
    timeRef.current = still ? 10 : timeRef.current + Math.min(dt, 1 / 20);
  }, -1);
  return null;
}

type Pointer = RefObject<{ x: number; y: number }>;

function HeroPhone({ screenRef, timeRef, pointerRef, still }: { screenRef: RefObject<ScreenSource>; timeRef: RefObject<number>; pointerRef: Pointer; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const t = timeRef.current;
    const intro = easeOut(t / 1.6);
    const p = still ? { x: 0, y: 0 } : pointerRef.current;
    const yaw = -0.3 + (still ? 0 : Math.sin(t * 0.32) * 0.26) + p.x * 0.32 - (1 - intro) * 1.9;
    const pitch = 0.05 + (still ? 0 : Math.sin(t * 0.45) * 0.04) - p.y * 0.14;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 5, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pitch, 5, dt);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -p.x * 0.04, 5, dt);
    g.position.y = (still ? 0 : Math.sin(t * 0.8) * 0.05) - (1 - intro) * 0.9;
  });
  return (
    <group ref={group} scale={1.42}>
      <Device id="phone" finish="midnight" screenRef={screenRef} />
    </group>
  );
}

interface Slot {
  /** Fraction of the half-width from the center. */
  nx: number;
  y: number;
  z: number;
  ry: number;
  rz: number;
  height: number;
  phase: number;
}

const SLOTS: Slot[] = [
  { nx: -0.64, y: 0.52, z: -0.9, ry: 0.42, rz: 0.04, height: 1.08, phase: 0 },
  { nx: 0.66, y: 0.6, z: -1.2, ry: -0.4, rz: -0.05, height: 1, phase: 1.7 },
  { nx: -0.5, y: -0.74, z: 0.15, ry: 0.3, rz: -0.03, height: 0.82, phase: 3.1 },
  { nx: 0.54, y: -0.66, z: 0.05, ry: -0.32, rz: 0.05, height: 0.88, phase: 4.4 },
];

function FloatCard({ item, slot, index, timeRef, pointerRef, still, onOpen }: { item: StageItem; slot: Slot; index: number; timeRef: RefObject<number>; pointerRef: Pointer; still: boolean; onOpen?: (id: string) => void }) {
  const texture = useImageTexture(item.poster);
  const image = texture?.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image.height ? image.width / image.height : item.aspect;
  const h = slot.height;
  const w = THREE.MathUtils.clamp(h * aspect, h * 0.56, h * 1.78);
  const face = useGeometry(() => roundedPlane(w, h, 0.06), [w, h]);
  const rim = useGeometry(() => roundedPlane(w + 0.045, h + 0.045, 0.08), [w, h]);
  const halfWidth = useThree((s) => s.viewport.width / 2);
  const group = useRef<THREE.Group>(null);
  const faceMat = useRef<THREE.MeshBasicMaterial>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const clickable = !!item.id && !!onOpen;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const t = timeRef.current;
    const intro = easeOut((t - 0.35 - index * 0.14) / 1.4);
    const p = still ? { x: 0, y: 0 } : pointerRef.current;
    const bob = still ? 0 : Math.sin(t * 0.7 + slot.phase) * 0.07;
    const depth = slot.z < 0 ? 0.5 : 0.9;
    g.position.x = slot.nx * halfWidth + p.x * 0.12 * depth;
    g.position.y = slot.y + bob - (1 - intro) * 0.5 + p.y * 0.08 * depth;
    g.position.z = THREE.MathUtils.damp(g.position.z, slot.z - (1 - intro) * 3 + (hovered ? 0.22 : 0), 6, dt);
    g.rotation.y = slot.ry + (still ? 0 : Math.sin(t * 0.4 + slot.phase) * 0.07) + p.x * 0.1;
    g.rotation.x = (still ? 0 : Math.sin(t * 0.5 + slot.phase) * 0.04) - p.y * 0.06;
    g.rotation.z = slot.rz;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, hovered ? 1.06 : 1, 8, dt));
    if (faceMat.current) faceMat.current.opacity = intro;
    if (rimMat.current) rimMat.current.opacity = intro * (hovered ? 0.9 : 0.35);
  });

  return (
    <group
      ref={group}
      position-z={-6}
      onPointerOver={clickable ? (e) => (e.stopPropagation(), setHovered(true)) : undefined}
      onPointerOut={clickable ? () => setHovered(false) : undefined}
      onClick={clickable ? (e) => (e.stopPropagation(), onOpen!(item.id!)) : undefined}
    >
      <mesh geometry={rim} position-z={-0.004}>
        <meshBasicMaterial ref={rimMat} color="#b9a6ff" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh geometry={face}>
        {/* A new material once the picture arrives, so the shader is built with a map. */}
        <meshBasicMaterial key={texture ? texture.uuid : 'empty'} ref={faceMat} map={texture} color={texture ? '#ffffff' : '#241d3d'} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A soft colored light behind the set; a transparent canvas has nothing else to glow against. */
function Glow({ color }: { color: string }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, -0.15, -2.2]} scale={[6.4, 4.6, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} color={color} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** The phone screen: the still first, then the video once it is actually playing. */
function useScreen(hero: StageItem, still: boolean, playing: boolean): RefObject<ScreenSource> {
  // The whole ad shows, letterboxed like a 9:16 video on a taller phone screen.
  const screenRef = useRef<ScreenSource>({ texture: null, aspect: hero.aspect, fit: 'contain' });
  const poster = useImageTexture(hero.poster);
  const video = useRef<HTMLVideoElement | null>(null);
  const [videoTexture, setVideoTexture] = useState<{ url: string; texture: THREE.VideoTexture } | null>(null);

  useEffect(() => {
    if (!hero.video || still) return;
    const url = hero.video;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    const texture = new THREE.VideoTexture(v);
    texture.colorSpace = THREE.SRGBColorSpace;
    const ready = () => setVideoTexture({ url, texture });
    v.addEventListener('playing', ready, { once: true });
    video.current = v;
    return () => {
      v.removeEventListener('playing', ready);
      v.pause();
      v.removeAttribute('src');
      v.load();
      video.current = null;
      texture.dispose();
    };
  }, [hero.video, still]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, hero.video, still]);

  const live = videoTexture && videoTexture.url === hero.video && !still ? videoTexture.texture : null;
  const texture = live ?? poster;
  useEffect(() => {
    const img = texture?.image as { videoWidth?: number; videoHeight?: number; width?: number; height?: number } | undefined;
    const w = img?.videoWidth || img?.width;
    const h = img?.videoHeight || img?.height;
    screenRef.current.texture = texture;
    screenRef.current.aspect = w && h ? w / h : hero.aspect;
  }, [texture, hero.aspect]);
  return screenRef;
}

function Scene({ hero, cards, accent, still, playing, onOpen }: { hero: StageItem; cards: StageItem[]; accent: string; still: boolean; playing: boolean; onOpen?: (id: string) => void }) {
  const timeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const screenRef = useScreen(hero, still, playing);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (still) return;
    const move = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [still]);

  // On demand rendering (reduced motion) still has to draw once the pictures arrive.
  useEffect(() => {
    if (still) invalidate();
  });

  return (
    <>
      <Ticker timeRef={timeRef} still={still} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[5, 1.5, 1]} rotation-y={-Math.PI / 2} scale={[5, 2, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, 1.5, -5]} scale={3} color={accent} />
      </Environment>
      <Glow color={accent} />
      {!still && <Sparkles count={36} scale={[7, 4, 3]} size={2.2} speed={0.25} opacity={0.55} color="#c9bcff" />}
      {cards.slice(0, SLOTS.length).map((item, i) => (
        <FloatCard key={`${item.id ?? item.poster}-${i}`} item={item} slot={SLOTS[i]!} index={i} timeRef={timeRef} pointerRef={pointerRef} still={still} onOpen={onOpen} />
      ))}
      <HeroPhone screenRef={screenRef} timeRef={timeRef} pointerRef={pointerRef} still={still} />
    </>
  );
}

/**
 * The dashboard's 3D set: your latest ad playing on a phone, with recent work floating around it.
 * It renders only while on screen, holds still for reduced motion, and falls back to a flat
 * preview where WebGL is missing.
 */
export function CreativeStage({ hero, cards, accent = '#7c5cff', onOpen, className }: { hero: StageItem; cards: StageItem[]; accent?: string; onOpen?: (id: string) => void; className?: string }) {
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [webgl] = useState(hasWebGL);
  const [lowPower] = useState(isLowPowerDevice);
  const still = reduce;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!webgl) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <div className="animate-float aspect-[9/19] h-[82%] overflow-hidden rounded-[2rem] border-[6px] border-[#1c2232] bg-black shadow-2xl">
          {hero.poster && (
            // A signed storage URL; the optimizer would only re-fetch it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.poster} alt="" className="size-full object-cover" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrap} className={className}>
      <Canvas
        frameloop={still ? 'demand' : inView ? 'always' : 'never'}
        dpr={lowPower ? 1 : [1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6.4], fov: 30, near: 0.1, far: 50 }}
        style={{ touchAction: 'pan-y' }}
      >
        <Scene hero={hero} cards={cards} accent={accent} still={still} playing={inView && !still} onOpen={onOpen} />
      </Canvas>
    </div>
  );
}
