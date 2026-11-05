import type { CSSProperties } from 'react';
import type { Mask, Transform } from '@adforge/core';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The layer box of a clip in canvas pixels, before rotation and scale. Shared with the editor's selection overlay. */
export function layerRect(t: Pick<Transform, 'x' | 'y' | 'width' | 'height'>, canvas: { width: number; height: number }): Rect {
  const width = t.width * canvas.width;
  const height = t.height * canvas.height;
  return {
    left: canvas.width / 2 + t.x * canvas.width - width / 2,
    top: canvas.height / 2 + t.y * canvas.height - height / 2,
    width,
    height,
  };
}

/** CSS for the layer box: position, rotation, scale and flips around the anchor. */
export function layerStyle(t: Transform, canvas: { width: number; height: number }): CSSProperties {
  const r = layerRect(t, canvas);
  const sx = t.scale * (t.flipX ? -1 : 1);
  const sy = t.scale * (t.flipY ? -1 : 1);
  return {
    position: 'absolute',
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    transformOrigin: `${t.anchorX * 100}% ${t.anchorY * 100}%`,
    transform: `rotate(${t.rotation}deg) scale(${sx}, ${sy})`,
    opacity: t.opacity,
  };
}

export interface MediaLayout {
  /** Visible part of the source after cropping, inside the layer box. */
  frame: Rect;
  /** The whole source element, relative to the frame. */
  media: Rect;
}

/**
 * Places media in a box honouring fit and crop. Returns null when the
 * intrinsic size is unknown; callers then fall back to CSS object-fit.
 */
export function mediaLayout(
  box: { width: number; height: number },
  intrinsic: { width?: number | null; height?: number | null } | null | undefined,
  fit: Transform['fit'],
  crop: Transform['crop'],
): MediaLayout | null {
  const iw = intrinsic?.width ?? 0;
  const ih = intrinsic?.height ?? 0;
  if (!iw || !ih) return null;
  const cw = iw * Math.max(0.05, 1 - crop.left - crop.right);
  const ch = ih * Math.max(0.05, 1 - crop.top - crop.bottom);
  let sx: number;
  let sy: number;
  if (fit === 'fill') {
    sx = box.width / cw;
    sy = box.height / ch;
  } else {
    const s = fit === 'cover' ? Math.max(box.width / cw, box.height / ch) : Math.min(box.width / cw, box.height / ch);
    sx = s;
    sy = s;
  }
  const fw = cw * sx;
  const fh = ch * sy;
  return {
    frame: { left: (box.width - fw) / 2, top: (box.height - fh) / 2, width: fw, height: fh },
    media: { left: -crop.left * iw * sx, top: -crop.top * ih * sy, width: iw * sx, height: ih * sy },
  };
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** CSS clip or mask for a layer mask, in fractions of the layer box. */
export function maskStyle(mask: Mask | null | undefined, box: { width: number; height: number }): CSSProperties {
  if (!mask) return {};
  const { x, y, width, height, feather, invert, radius } = mask;
  const l = x - width / 2;
  const r = x + width / 2;
  const t = y - height / 2;
  const b = y + height / 2;

  if (mask.shape === 'rect' && feather <= 0 && !invert) {
    const rpx = radius * Math.min(box.width * width, box.height * height);
    return { clipPath: `inset(${pct(t)} ${pct(1 - r)} ${pct(1 - b)} ${pct(l)} round ${rpx}px)` };
  }

  // Mask layers are listed top first; each composite operator combines a layer with the result below it.
  let layers: string[];
  let ops: string[];
  if (mask.shape === 'ellipse') {
    const inner = Math.max(0, 1 - feather * 2);
    layers = [`radial-gradient(ellipse ${pct(width / 2)} ${pct(height / 2)} at ${pct(x)} ${pct(y)}, #000 ${pct(inner)}, transparent 100%)`];
    ops = ['add'];
  } else {
    const fx = Math.min(feather, width / 2);
    const fy = Math.min(feather * (box.width / Math.max(1, box.height)), height / 2);
    layers = [
      `linear-gradient(to right, transparent ${pct(l)}, #000 ${pct(l + fx)}, #000 ${pct(r - fx)}, transparent ${pct(r)})`,
      `linear-gradient(to bottom, transparent ${pct(t)}, #000 ${pct(t + fy)}, #000 ${pct(b - fy)}, transparent ${pct(b)})`,
    ];
    ops = ['intersect', 'add'];
  }
  if (invert) {
    layers = ['linear-gradient(#000, #000)', ...layers];
    ops = ['exclude', ...ops];
  }
  return { maskImage: layers.join(', '), maskComposite: ops.join(', '), maskRepeat: 'no-repeat', maskSize: '100% 100%' };
}
