import type { TextAnimation, TextStyle, Transform } from '@adforge/core';

export interface TextPreset {
  id: string;
  label: string;
  text: string;
  style: Partial<TextStyle>;
  transform: Partial<Transform>;
  animation: Partial<TextAnimation>;
  seconds: number;
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'hook',
    label: 'Hook',
    text: 'STOP SCROLLING',
    style: { fontFamily: 'Unbounded', fontWeight: 900, fontSize: 96, uppercase: true, strokeColor: '#000000', strokeWidth: 8, shadowBlur: 0 },
    transform: { y: -0.3, width: 0.9, height: 0.2 },
    animation: { in: 'pop', out: 'fade' },
    seconds: 2.5,
  },
  {
    id: 'title',
    label: 'Headline',
    text: 'Your big headline',
    style: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 80 },
    transform: { y: -0.08, width: 0.86, height: 0.22 },
    animation: { in: 'slideUp', out: 'fade' },
    seconds: 3,
  },
  {
    id: 'subtitle',
    label: 'Subheading',
    text: 'A supporting line that sells it',
    style: { fontFamily: 'Geist', fontWeight: 600, fontSize: 52 },
    transform: { y: 0.08, width: 0.84, height: 0.14 },
    animation: { in: 'fade', out: 'fade' },
    seconds: 3,
  },
  {
    id: 'body',
    label: 'Body',
    text: 'Short, plain sentences read best on a phone.',
    style: { fontFamily: 'Geist', fontWeight: 500, fontSize: 40, lineHeight: 1.3 },
    transform: { y: 0.15, width: 0.8, height: 0.16 },
    animation: { in: 'fade', out: 'fade' },
    seconds: 4,
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    text: 'Maya Lopez · Founder',
    style: { fontFamily: 'Geist', fontWeight: 700, fontSize: 42, align: 'left', backgroundColor: 'rgba(11,11,18,0.78)', backgroundPadding: 0.45, backgroundRadius: 0.3, shadowColor: null, shadowBlur: 0 },
    transform: { x: -0.06, y: 0.3, width: 0.78, height: 0.08 },
    animation: { in: 'slideRight', out: 'fade' },
    seconds: 4,
  },
  {
    id: 'cta',
    label: 'Call to action',
    text: 'Shop now →',
    style: { fontFamily: 'Geist', fontWeight: 800, fontSize: 56, backgroundColor: '#7C5CFF', backgroundPadding: 0.55, backgroundRadius: 1.2, shadowColor: 'rgba(124,92,255,0.5)', shadowBlur: 24 },
    transform: { y: 0.34, width: 0.7, height: 0.1 },
    animation: { in: 'pop', out: 'fade', loop: 'pulse' },
    seconds: 3,
  },
  {
    id: 'price',
    label: 'Price',
    text: '$29.99',
    style: { fontFamily: 'Anton', fontWeight: 400, fontSize: 132, color: '#FACC15', strokeColor: '#000000', strokeWidth: 6 },
    transform: { y: 0.16, width: 0.7, height: 0.16 },
    animation: { in: 'scaleIn', out: 'fade' },
    seconds: 2.5,
  },
  {
    id: 'quote',
    label: 'Review quote',
    text: '“Honestly the best thing I bought this year.”',
    style: { fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 60, italic: true, lineHeight: 1.2 },
    transform: { y: -0.05, width: 0.84, height: 0.26 },
    animation: { in: 'wordByWord', out: 'fade' },
    seconds: 4,
  },
  {
    id: 'highlight',
    label: 'Highlight',
    text: 'Results in 7 days',
    style: { fontFamily: 'Geist', fontWeight: 800, fontSize: 68, highlightColor: '#A3E635', color: '#0B0B12', shadowColor: null, shadowBlur: 0 },
    transform: { y: -0.1, width: 0.84, height: 0.14 },
    animation: { in: 'highlight', out: 'fade' },
    seconds: 3,
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    text: 'loading your new favourite…',
    style: { fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: 46 },
    transform: { y: 0, width: 0.86, height: 0.12 },
    animation: { in: 'typewriter', out: 'fade', inDuration: 45 },
    seconds: 3.5,
  },
  {
    id: 'neon',
    label: 'Neon',
    text: 'LIMITED DROP',
    style: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 82, color: '#F0ABFC', shadowColor: '#D946EF', shadowBlur: 32, shadowY: 0, uppercase: true },
    transform: { y: -0.2, width: 0.9, height: 0.16 },
    animation: { in: 'glitch', out: 'fade', loop: 'float' },
    seconds: 3,
  },
  {
    id: 'kinetic',
    label: 'Kinetic',
    text: 'FAST. FRESH. YOURS.',
    style: { fontFamily: 'Archivo Black', fontWeight: 400, fontSize: 92, uppercase: true },
    transform: { y: 0, width: 0.9, height: 0.3 },
    animation: { in: 'kinetic', out: 'fade' },
    seconds: 2.5,
  },
];

export const TEXT_PRESETS_BY_ID: Record<string, TextPreset> = Object.fromEntries(TEXT_PRESETS.map((p) => [p.id, p]));

export const SHAPES = [
  { shape: 'rect', label: 'Rectangle' },
  { shape: 'ellipse', label: 'Circle' },
  { shape: 'triangle', label: 'Triangle' },
  { shape: 'star', label: 'Star' },
  { shape: 'line', label: 'Line' },
] as const;
