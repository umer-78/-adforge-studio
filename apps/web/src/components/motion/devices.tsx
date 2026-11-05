'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';

/**
 * Devices for mockups, modeled from simple shapes so they need no downloads and look the same
 * everywhere. Each one shows the picked image or video on its screen, lit like a real display.
 */

export type DeviceId = 'phone' | 'tablet' | 'laptop' | 'tv' | 'billboard';
export type ScreenFit = 'cover' | 'contain';
export type FinishId = 'graphite' | 'silver' | 'midnight' | 'sand';

export interface DeviceSpec {
  id: DeviceId;
  label: string;
  /** Screen width over height. */
  screenAspect: number;
  /** Width, height and depth of what the camera should keep in frame. */
  bounds: [number, number, number];
  /** The point the camera looks at. */
  target: [number, number, number];
  /** Where shadows fall. */
  floorY: number;
  /** Phones, tablets and laptops come in finishes; screens and billboards are dark. */
  finishes: boolean;
  outdoor?: boolean;
}

export const DEVICES: DeviceSpec[] = [
  { id: 'phone', label: 'Phone', screenAspect: 0.735 / 1.595, bounds: [0.8, 1.66, 0.09], target: [0, 0, 0], floorY: -1.08, finishes: true },
  { id: 'tablet', label: 'Tablet', screenAspect: 1.17 / 1.61, bounds: [1.26, 1.7, 0.07], target: [0, 0, 0], floorY: -1.1, finishes: true },
  { id: 'laptop', label: 'Laptop', screenAspect: 16 / 10, bounds: [2.3, 1.6, 1.3], target: [0, 0.62, 0], floorY: 0, finishes: true },
  { id: 'tv', label: 'TV', screenAspect: 16 / 9, bounds: [3.2, 2.1, 0.4], target: [0, 1.1, 0], floorY: 0, finishes: false },
  { id: 'billboard', label: 'Billboard', screenAspect: 2, bounds: [4.6, 3.4, 0.6], target: [0, 3.15, 0], floorY: 0, finishes: false, outdoor: true },
];

export const DEVICES_BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d])) as Record<DeviceId, DeviceSpec>;

export const FINISHES: Record<FinishId, { label: string; body: string; metalness: number; roughness: number }> = {
  graphite: { label: 'Graphite', body: '#2b2c31', metalness: 0.85, roughness: 0.32 },
  silver: { label: 'Silver', body: '#d5d7dc', metalness: 0.9, roughness: 0.26 },
  midnight: { label: 'Midnight', body: '#1c2232', metalness: 0.8, roughness: 0.34 },
  sand: { label: 'Sand', body: '#d6c6ae', metalness: 0.7, roughness: 0.4 },
};

/** What the screen shows. Kept in a ref so a render can swap frames without re-rendering React. */
export interface ScreenSource {
  texture: THREE.Texture | null;
  /** Width over height of the picture. */
  aspect: number;
  fit: ScreenFit;
}

/* --------------------------------- Shapes --------------------------------- */

function roundedRect(w: number, h: number, radius: number): THREE.Shape {
  const r = Math.max(0.0001, Math.min(radius, w / 2, h / 2));
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat rounded rectangle whose texture coordinates run 0 to 1 across it. */
export function roundedPlane(w: number, h: number, r: number): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 12);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}

/** A centered slab with rounded corners and softened edges; its front faces +z. */
function slab(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const b = Math.min(0.012, d / 3);
  const g = new THREE.ExtrudeGeometry(roundedRect(w - b * 2, h - b * 2, r - b), {
    depth: Math.max(0.0001, d - b * 2),
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 4,
    curveSegments: 20,
  });
  g.translate(0, 0, -(d - b * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** Geometry made once per shape (the numbers that size it) and freed when the shape changes. */
export function useGeometry<T extends THREE.BufferGeometry>(make: () => T, size: readonly number[]): T {
  const key = size.join(',');
  // Rebuilt only when the sizes change; `make` is a fresh closure every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => make(), [key]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

/* -------------------------------- Textures -------------------------------- */

let glareTexture: THREE.CanvasTexture | null = null;
/** A faint diagonal sheen, like light on glass. */
function glare(): THREE.CanvasTexture {
  if (glareTexture) return glareTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.03)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  glareTexture = new THREE.CanvasTexture(c);
  glareTexture.colorSpace = THREE.SRGBColorSpace;
  return glareTexture;
}

let keysTexture: THREE.CanvasTexture | null = null;
/** A keyboard drawn once: six rows of keys on a dark deck. */
function keyboard(): THREE.CanvasTexture {
  if (keysTexture) return keysTexture;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 380;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c0c0f';
  ctx.fillRect(0, 0, c.width, c.height);
  const rows = [14, 14, 14, 13, 12, 9];
  const gap = 8;
  const keyH = (c.height - gap * (rows.length + 1)) / rows.length;
  rows.forEach((count, row) => {
    const y = gap + row * (keyH + gap);
    const wide = row === rows.length - 1;
    let x = gap;
    for (let i = 0; i < count; i++) {
      const unit = (c.width - gap * (count + 1)) / count;
      const w = wide && i === Math.floor(count / 2) ? unit * 3.2 : wide ? (c.width - gap * (count + 1) - unit * 3.2) / (count - 1) : unit;
      ctx.fillStyle = '#1a1b20';
      ctx.beginPath();
      ctx.roundRect(x, y, w, keyH, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 3, y + 2, w - 6, 2);
      x += w + gap;
    }
  });
  keysTexture = new THREE.CanvasTexture(c);
  keysTexture.colorSpace = THREE.SRGBColorSpace;
  keysTexture.anisotropy = 4;
  return keysTexture;
}

/* --------------------------------- Screen --------------------------------- */

/**
 * The lit display. Fill crops the picture to the screen; fit shows all of it on black. The source
 * is read every frame, so a render can swap in exact video frames.
 */
function Screen({ width, height, radius, screenRef }: { width: number; height: number; radius: number; screenRef: RefObject<ScreenSource> }) {
  const shape = useGeometry(() => roundedPlane(width, height, radius), [width, height, radius]);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const inner = useRef<THREE.Mesh>(null);
  const innerMat = useRef<THREE.MeshBasicMaterial>(null);
  const screenAspect = width / height;

  useFrame(() => {
    const s = screenRef.current;
    const f = fill.current;
    const m = innerMat.current;
    const plane = inner.current;
    if (!s || !f || !m || !plane) return;
    const tex = s.texture;
    const contain = s.fit === 'contain';
    if (tex) {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if (contain) {
        tex.repeat.set(1, 1);
        tex.offset.set(0, 0);
      } else if (s.aspect > screenAspect) {
        const r = screenAspect / s.aspect;
        tex.repeat.set(r, 1);
        tex.offset.set((1 - r) / 2, 0);
      } else {
        const r = s.aspect / screenAspect;
        tex.repeat.set(1, r);
        tex.offset.set(0, (1 - r) / 2);
      }
    }
    const fillMap = tex && !contain ? tex : null;
    if (f.map !== fillMap) {
      f.map = fillMap;
      f.color.set(fillMap ? '#ffffff' : '#050507');
      f.needsUpdate = true;
    }
    plane.visible = !!tex && contain;
    if (plane.visible) {
      const [w, h] = s.aspect > screenAspect ? [width, width / s.aspect] : [height * s.aspect, height];
      plane.scale.set(w, h, 1);
      if (m.map !== tex) {
        m.map = tex;
        m.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <mesh geometry={shape}>
        <meshBasicMaterial ref={fill} color="#050507" toneMapped={false} />
      </mesh>
      <mesh ref={inner} position-z={0.0004} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={innerMat} toneMapped={false} />
      </mesh>
      <mesh geometry={shape} position-z={0.0008}>
        <meshBasicMaterial map={glare()} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* --------------------------------- Devices -------------------------------- */

type DeviceProps = { finish: FinishId; screenRef: RefObject<ScreenSource> };

function Body({ geometry, finish }: { geometry: THREE.BufferGeometry; finish: FinishId }) {
  const f = FINISHES[finish];
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial color={f.body} metalness={f.metalness} roughness={f.roughness} clearcoat={0.5} clearcoatRoughness={0.25} />
    </mesh>
  );
}

function Glass({ w, h, r, z }: { w: number; h: number; r: number; z: number }) {
  const g = useGeometry(() => roundedPlane(w, h, r), [w, h, r]);
  return (
    <mesh geometry={g} position-z={z}>
      <meshPhysicalMaterial color="#040405" roughness={0.08} metalness={0.2} clearcoat={1} clearcoatRoughness={0.05} />
    </mesh>
  );
}

function Phone({ finish, screenRef }: DeviceProps) {
  const body = useGeometry(() => slab(0.8, 1.66, 0.085, 0.13), []);
  const island = useGeometry(() => roundedPlane(0.2, 0.056, 0.028), []);
  const bump = useGeometry(() => slab(0.32, 0.32, 0.018, 0.08), []);
  const f = FINISHES[finish];
  return (
    <group>
      <Body geometry={body} finish={finish} />
      <Glass w={0.786} h={1.646} r={0.122} z={0.0426} />
      <group position-z={0.0432}>
        <Screen width={0.735} height={1.595} radius={0.1} screenRef={screenRef} />
      </group>
      <mesh geometry={island} position={[0, 0.72, 0.0446]}>
        <meshBasicMaterial color="#000000" />
      </mesh>
      {[
        [0.403, 0.36, 0.17],
        [-0.403, 0.42, 0.08],
        [-0.403, 0.27, 0.12],
      ].map(([x, y, h], i) => (
        <mesh key={i} position={[x!, y!, 0]} castShadow>
          <boxGeometry args={[0.012, h!, 0.03]} />
          <meshPhysicalMaterial color={f.body} metalness={f.metalness} roughness={f.roughness} />
        </mesh>
      ))}
      <group position={[-0.2, 0.6, -0.05]}>
        <mesh geometry={bump} castShadow>
          <meshPhysicalMaterial color={f.body} metalness={f.metalness} roughness={f.roughness + 0.1} />
        </mesh>
        {[
          [-0.065, 0.065],
          [0.065, 0.065],
          [-0.065, -0.065],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x!, y!, -0.012]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.048, 0.05, 0.014, 32]} />
            <meshPhysicalMaterial color="#0a0a0d" roughness={0.1} metalness={0.4} clearcoat={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Tablet({ finish, screenRef }: DeviceProps) {
  const body = useGeometry(() => slab(1.26, 1.7, 0.06, 0.1), []);
  return (
    <group>
      <Body geometry={body} finish={finish} />
      <Glass w={1.244} h={1.684} r={0.092} z={0.0301} />
      <group position-z={0.0306}>
        <Screen width={1.17} height={1.61} radius={0.05} screenRef={screenRef} />
      </group>
      <mesh position={[0, 0.825, 0.031]}>
        <circleGeometry args={[0.008, 16]} />
        <meshBasicMaterial color="#111" />
      </mesh>
    </group>
  );
}

function Laptop({ finish, screenRef }: DeviceProps) {
  const base = useGeometry(() => slab(2.3, 1.56, 0.055, 0.08), []);
  const lid = useGeometry(() => slab(2.3, 1.5, 0.032, 0.08), []);
  const pad = useGeometry(() => roundedPlane(0.82, 0.5, 0.04), []);
  const f = FINISHES[finish];
  return (
    <group>
      <group position-y={0.0275} rotation-x={-Math.PI / 2}>
        <Body geometry={base} finish={finish} />
      </group>
      <mesh position={[0, 0.0556, -0.17]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.98, 0.735]} />
        <meshStandardMaterial map={keyboard()} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh geometry={pad} position={[0, 0.0556, 0.43]} rotation-x={-Math.PI / 2}>
        <meshPhysicalMaterial color={f.body} metalness={f.metalness * 0.8} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.055, -0.77]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 1.9, 24]} />
        <meshPhysicalMaterial color="#141418" metalness={0.6} roughness={0.4} />
      </mesh>
      <group position={[0, 0.055, -0.77]} rotation-x={-0.3}>
        <group position-y={0.75}>
          <Body geometry={lid} finish={finish} />
          <Glass w={2.27} h={1.47} r={0.07} z={0.0166} />
          <group position={[0, 0.02, 0.0172]}>
            <Screen width={2.12} height={1.325} radius={0.015} screenRef={screenRef} />
          </group>
          <mesh position={[0, 0.71, 0.0172]}>
            <circleGeometry args={[0.009, 16]} />
            <meshBasicMaterial color="#1a1a1f" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Tv({ screenRef }: { screenRef: RefObject<ScreenSource> }) {
  const panel = useGeometry(() => slab(3.2, 1.84, 0.05, 0.03), []);
  const foot = useGeometry(() => slab(1.0, 0.34, 0.024, 0.08), []);
  return (
    <group>
      <group position-y={1.12}>
        <mesh geometry={panel} castShadow receiveShadow>
          <meshPhysicalMaterial color="#17181c" metalness={0.7} roughness={0.35} />
        </mesh>
        <Glass w={3.18} h={1.82} r={0.025} z={0.0251} />
        <group position-z={0.0256}>
          <Screen width={3.12} height={1.755} radius={0.006} screenRef={screenRef} />
        </group>
      </group>
      <mesh position={[0, 0.15, -0.035]} castShadow>
        <boxGeometry args={[0.14, 0.28, 0.05]} />
        <meshPhysicalMaterial color="#1d1e23" metalness={0.8} roughness={0.3} />
      </mesh>
      <group position={[0, 0.012, -0.03]} rotation-x={-Math.PI / 2}>
        <mesh geometry={foot} castShadow receiveShadow>
          <meshPhysicalMaterial color="#1d1e23" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Billboard({ screenRef }: { screenRef: RefObject<ScreenSource> }) {
  const frame = useGeometry(() => slab(4.4, 2.3, 0.16, 0.02), []);
  const metal = <meshStandardMaterial color="#3b3e46" metalness={0.6} roughness={0.5} />;
  return (
    <group>
      <group position-y={3.62}>
        <mesh geometry={frame} castShadow receiveShadow>
          <meshStandardMaterial color="#26282e" metalness={0.5} roughness={0.55} />
        </mesh>
        <group position-z={0.081}>
          <Screen width={4.2} height={2.1} radius={0.004} screenRef={screenRef} />
        </group>
      </group>
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 1.24, -0.1]} castShadow>
          <cylinderGeometry args={[0.075, 0.09, 2.48, 24]} />
          {metal}
        </mesh>
      ))}
      <mesh position={[0, 2.44, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 0.04, 0.42]} />
        {metal}
      </mesh>
      {[-1.25, 1.25].map((x) => (
        <group key={x} position={[x, 2.5, 0.35]}>
          <mesh position={[0, 0.03, 0.12]} rotation-x={-0.5}>
            <boxGeometry args={[0.04, 0.04, 0.4]} />
            {metal}
          </mesh>
          <mesh position={[0, 0.14, 0.32]} rotation-x={-0.9}>
            <boxGeometry args={[0.28, 0.07, 0.14]} />
            <meshStandardMaterial color="#2b2d33" emissive="#fff4d6" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Device({ id, finish, screenRef }: { id: DeviceId; finish: FinishId; screenRef: RefObject<ScreenSource> }) {
  switch (id) {
    case 'phone':
      return <Phone finish={finish} screenRef={screenRef} />;
    case 'tablet':
      return <Tablet finish={finish} screenRef={screenRef} />;
    case 'laptop':
      return <Laptop finish={finish} screenRef={screenRef} />;
    case 'tv':
      return <Tv screenRef={screenRef} />;
    case 'billboard':
      return <Billboard screenRef={screenRef} />;
  }
}
