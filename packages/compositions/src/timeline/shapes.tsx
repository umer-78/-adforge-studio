import type { ShapeClip } from '@adforge/core';

function starPoints(w: number, h: number, inset: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inset;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${w / 2 + r * w * Math.cos(a)},${h / 2 + r * h * Math.sin(a)}`;
  }).join(' ');
}

export function ShapeContent({ clip, box, u }: { clip: ShapeClip; box: { width: number; height: number }; u: number }) {
  const { width: w, height: h } = box;
  const sw = clip.strokeWidth * u;
  const fill = clip.fill ?? 'none';
  const stroke = clip.stroke ?? 'none';
  const inset = sw / 2;
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' as const };
  let shape;
  switch (clip.shape) {
    case 'ellipse':
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - inset)} ry={Math.max(0, h / 2 - inset)} {...common} />;
      break;
    case 'triangle':
      shape = <polygon points={`${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`} {...common} />;
      break;
    case 'line':
      shape = <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={clip.stroke ?? clip.fill ?? '#FFFFFF'} strokeWidth={Math.max(sw, h)} strokeLinecap="round" />;
      break;
    case 'star':
      shape = <polygon points={starPoints(w, h, 0.42)} {...common} />;
      break;
    default: {
      const r = clip.radius * Math.min(w, h);
      shape = <rect x={inset} y={inset} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={r} ry={r} {...common} />;
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {shape}
    </svg>
  );
}
