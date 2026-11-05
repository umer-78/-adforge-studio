'use client';

import { AlignCenter, AlignLeft, AlignRight, CaseUpper, Circle, Download, Italic, Minus, Plus, RotateCcw, Square, Star, Trash2, Triangle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CAPTION_STYLES,
  CAPTION_STYLES_BY_ID,
  estimateWordTimings,
  FONT_FAMILIES,
  MOTION_TEMPLATES_BY_ID,
  motionDefaults,
  TEXT_ANIMATION_LABELS,
  TEXT_ANIMATIONS,
  textAnimationSchema,
  textStyleSchema,
  toSrt,
  toVtt,
  type CaptionStyleDef,
  type CaptionsClip,
  type CaptionWord,
  type MotionClip,
  type ShapeClip,
  type TextAnimation,
  type TextClip,
  type TextStyle,
} from '@adforge/core';
import { FieldControl } from '@/components/motion/field-control';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBrandColors, useBrandKits } from '@/lib/hooks/use-brand-kits';
import { cn } from '@/lib/utils';
import { NumberInput, patchClip, Row, Section, SliderField, Toggle } from './controls';
import { player, usePlayhead } from './playhead';
import { TEXT_PRESETS } from './presets';
import { useEditor } from './store';

function IconToggle({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="icon-xs" variant={active ? 'default' : 'secondary'} aria-pressed={active} aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Font choices with the brand kit's fonts first. Only families the renderer can load are offered. */
function useFontOptions(current: string) {
  const kits = useBrandKits();
  const kit = kits.data?.find((k) => k.isDefault) ?? kits.data?.[0];
  const brand = [kit?.fonts.display, kit?.fonts.body].filter((f): f is string => !!f && FONT_FAMILIES.some((x) => x.family === f));
  const ordered = [...new Set([...brand, ...FONT_FAMILIES.map((f) => f.family)])];
  const options = ordered.map((family) => ({
    value: family,
    label: <span style={{ fontFamily: `'${family}'` }}>{family}</span>,
    hint: brand.includes(family) ? (family === kit?.fonts.display ? 'Brand display font' : 'Brand body font') : undefined,
  }));
  if (!ordered.includes(current)) options.unshift({ value: current, label: <span>{current}</span>, hint: 'Not available, falls back to Geist' });
  return options;
}

function weightsOf(family: string): readonly number[] {
  return FONT_FAMILIES.find((f) => f.family === family)?.weights ?? [400, 700];
}

const nearest = (list: readonly number[], v: number) => list.reduce((best, w) => (Math.abs(w - v) < Math.abs(best - v) ? w : best), list[0] ?? v);

const WEIGHT_LABEL: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

export function TextSection({ clip, focusTick = 0 }: { clip: TextClip; focusTick?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const brand = useBrandColors();
  const fonts = useFontOptions(clip.style.fontFamily);
  const s = clip.style;

  useEffect(() => {
    if (!focusTick) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focusTick]);

  const setStyle = (fn: (st: TextStyle) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'text') fn(c.style);
      },
      coalesce ? `style:${coalesce}` : undefined,
    );
  const preset = TEXT_PRESETS.find((p) => JSON.stringify(textStyleSchema.parse(p.style)) === JSON.stringify(s))?.id ?? 'custom';

  return (
    <>
      <Section title="Text">
        {clip.placeholder?.kind === 'text' && <p className="text-[11px] text-muted-foreground">Template slot: {clip.placeholder.label}</p>}
        <Textarea
          ref={ref}
          rows={3}
          value={clip.text}
          maxLength={2000}
          onChange={(e) => {
            const v = e.target.value;
            patchClip(
              clip.id,
              (c) => {
                if (c.type !== 'text') return;
                c.text = v;
                c.placeholder = null;
              },
              'text',
            );
          }}
          className="min-h-16 text-sm"
          aria-label="Text"
        />
        <p className="text-[11px] text-muted-foreground">Wrap words in *stars* to color them with the highlight color.</p>
        <Row label="Look">
          <Select
            size="sm"
            value={preset}
            onValueChange={(id) => {
              const p = TEXT_PRESETS.find((x) => x.id === id);
              if (!p) return;
              patchClip(clip.id, (c) => {
                if (c.type !== 'text') return;
                c.style = textStyleSchema.parse(p.style);
                c.animation = textAnimationSchema.parse(p.animation);
              });
            }}
            options={[...TEXT_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
          />
        </Row>
      </Section>
      <Section title="Font">
        <Row label="Family">
          <Select
            size="sm"
            value={s.fontFamily}
            onValueChange={(family) =>
              setStyle((st) => {
                st.fontFamily = family;
                st.fontWeight = nearest(weightsOf(family), st.fontWeight);
              })
            }
            options={fonts}
          />
        </Row>
        <Row label="Weight">
          <Select size="sm" value={String(s.fontWeight)} onValueChange={(v) => setStyle((st) => (st.fontWeight = Number(v)))} options={weightsOf(s.fontFamily).map((w) => ({ value: String(w), label: WEIGHT_LABEL[w] ?? String(w) }))} />
        </Row>
        <SliderField label="Size" value={s.fontSize} min={8} max={400} step={1} suffix="px" onChange={(v) => setStyle((st) => (st.fontSize = v), 'size')} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Segmented
            size="sm"
            value={s.align}
            onChange={(v) => setStyle((st) => (st.align = v))}
            options={[
              { value: 'left', label: <AlignLeft className="size-3.5" />, title: 'Align left' },
              { value: 'center', label: <AlignCenter className="size-3.5" />, title: 'Center' },
              { value: 'right', label: <AlignRight className="size-3.5" />, title: 'Align right' },
            ]}
          />
          <IconToggle active={s.uppercase} label="All caps" onClick={() => setStyle((st) => (st.uppercase = !st.uppercase))}>
            <CaseUpper />
          </IconToggle>
          <IconToggle active={s.italic} label="Italic" onClick={() => setStyle((st) => (st.italic = !st.italic))}>
            <Italic />
          </IconToggle>
        </div>
        <SliderField label="Line height" value={s.lineHeight} min={0.6} max={3} step={0.05} digits={2} suffix="×" onChange={(v) => setStyle((st) => (st.lineHeight = v), 'lineHeight')} />
        <SliderField label="Spacing" value={s.letterSpacing} min={-0.2} max={1} step={0.005} scale={100} digits={1} suffix="%" onChange={(v) => setStyle((st) => (st.letterSpacing = v), 'letterSpacing')} />
      </Section>
      <Section title="Color">
        <Row label="Fill">
          <Segmented
            size="sm"
            value={s.gradient ? 'gradient' : 'solid'}
            onChange={(v) => setStyle((st) => (st.gradient = v === 'gradient' ? [st.color, brand.find((c) => c.toLowerCase() !== st.color.toLowerCase()) ?? '#7C5CFF'] : null))}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'gradient', label: 'Gradient' },
            ]}
          />
        </Row>
        {s.gradient ? (
          <>
            <Row label="From">
              <ColorInput value={s.gradient[0]} swatches={brand} onChange={(v) => setStyle((st) => st.gradient && (st.gradient = [v, st.gradient[1]]), 'gradientFrom')} />
            </Row>
            <Row label="To">
              <ColorInput value={s.gradient[1]} swatches={brand} onChange={(v) => setStyle((st) => st.gradient && (st.gradient = [st.gradient[0], v]), 'gradientTo')} />
            </Row>
          </>
        ) : (
          <Row label="Color">
            <ColorInput value={s.color} swatches={brand} onChange={(v) => setStyle((st) => (st.color = v), 'color')} />
          </Row>
        )}
        <Row label="Highlight">
          <ColorInput value={s.highlightColor} swatches={brand} onChange={(v) => setStyle((st) => (st.highlightColor = v), 'highlight')} />
        </Row>
      </Section>
      <Section title="Outline, shadow & box" defaultOpen={false}>
        <Toggle
          label="Outline"
          checked={!!s.strokeColor && s.strokeWidth > 0}
          onChange={(v) =>
            setStyle((st) => {
              st.strokeColor = v ? (st.strokeColor ?? '#000000') : null;
              st.strokeWidth = v ? Math.max(st.strokeWidth, 6) : 0;
            })
          }
        />
        {!!s.strokeColor && s.strokeWidth > 0 && (
          <>
            <Row label="Color">
              <ColorInput value={s.strokeColor} swatches={brand} onChange={(v) => setStyle((st) => (st.strokeColor = v), 'strokeColor')} />
            </Row>
            <SliderField label="Width" value={s.strokeWidth} min={0.5} max={40} step={0.5} digits={1} suffix="px" onChange={(v) => setStyle((st) => (st.strokeWidth = v), 'strokeWidth')} />
          </>
        )}
        <Toggle
          label="Shadow"
          checked={!!s.shadowColor}
          onChange={(v) =>
            setStyle((st) => {
              st.shadowColor = v ? 'rgba(0,0,0,0.45)' : null;
              if (v && !st.shadowBlur) st.shadowBlur = 12;
            })
          }
        />
        {s.shadowColor && (
          <>
            <Row label="Color">
              <ColorInput value={s.shadowColor} swatches={brand} onChange={(v) => setStyle((st) => (st.shadowColor = v), 'shadowColor')} />
            </Row>
            <SliderField label="Blur" value={s.shadowBlur} min={0} max={80} step={1} suffix="px" onChange={(v) => setStyle((st) => (st.shadowBlur = v), 'shadowBlur')} />
            <SliderField label="Offset X" value={s.shadowX} min={-40} max={40} step={1} suffix="px" onChange={(v) => setStyle((st) => (st.shadowX = v), 'shadowX')} />
            <SliderField label="Offset Y" value={s.shadowY} min={-40} max={40} step={1} suffix="px" onChange={(v) => setStyle((st) => (st.shadowY = v), 'shadowY')} />
          </>
        )}
        <Toggle label="Background box" checked={!!s.backgroundColor} onChange={(v) => setStyle((st) => (st.backgroundColor = v ? 'rgba(0,0,0,0.65)' : null))} />
        {s.backgroundColor && (
          <>
            <Row label="Color">
              <ColorInput value={s.backgroundColor} swatches={brand} onChange={(v) => setStyle((st) => (st.backgroundColor = v), 'background')} />
            </Row>
            <SliderField label="Padding" value={s.backgroundPadding} min={0} max={3} step={0.05} digits={2} suffix="em" onChange={(v) => setStyle((st) => (st.backgroundPadding = v), 'bgPadding')} />
            <SliderField label="Roundness" value={s.backgroundRadius} min={0} max={2} step={0.05} digits={2} suffix="em" onChange={(v) => setStyle((st) => (st.backgroundRadius = v), 'bgRadius')} />
          </>
        )}
      </Section>
      <TextAnimationSection clip={clip} />
    </>
  );
}

const LOOPS: { value: TextAnimation['loop']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'float', label: 'Float' },
  { value: 'shake', label: 'Shake' },
  { value: 'wiggle', label: 'Wiggle' },
];

function TextAnimationSection({ clip }: { clip: TextClip }) {
  const fps = useEditor((s) => s.timeline.fps);
  const a = clip.animation;
  const set = (fn: (an: TextAnimation) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'text') fn(c.animation);
      },
      coalesce ? `anim:${coalesce}` : undefined,
    );
  const options = TEXT_ANIMATIONS.map((id) => ({ value: id, label: TEXT_ANIMATION_LABELS[id] }));
  const maxS = Math.min(120, clip.duration) / fps;
  return (
    <Section title="Animation">
      <Row label="In">
        <Select size="sm" value={a.in} onValueChange={(v) => set((an) => (an.in = v as TextAnimation['in']))} options={options} />
      </Row>
      {a.in !== 'none' && <SliderField label="In length" value={a.inDuration / fps} min={1 / fps} max={maxS} step={1 / fps} digits={2} suffix="s" onChange={(v) => set((an) => (an.inDuration = Math.max(1, Math.min(120, Math.round(v * fps)))), 'in')} />}
      <Row label="Out">
        <Select size="sm" value={a.out} onValueChange={(v) => set((an) => (an.out = v as TextAnimation['out']))} options={options} />
      </Row>
      {a.out !== 'none' && <SliderField label="Out length" value={a.outDuration / fps} min={1 / fps} max={maxS} step={1 / fps} digits={2} suffix="s" onChange={(v) => set((an) => (an.outDuration = Math.max(1, Math.min(120, Math.round(v * fps)))), 'out')} />}
      <Row label="Loop">
        <Select size="sm" value={a.loop} onValueChange={(v) => set((an) => (an.loop = v as TextAnimation['loop']))} options={LOOPS} />
      </Row>
    </Section>
  );
}

/* ---------------------------------- Captions ---------------------------------- */

const STYLE_KEYS = new Set(Object.keys(textStyleSchema.shape));
const ACTIVE_WORD: { value: CaptionStyleDef['activeWord']; label: string }[] = [
  { value: 'none', label: 'No highlight' },
  { value: 'color', label: 'Color the word' },
  { value: 'box', label: 'Box behind the word' },
  { value: 'scale', label: 'Grow the word' },
  { value: 'underline', label: 'Marker underline' },
];
const CAPTION_ANIMATIONS: { value: CaptionStyleDef['animation']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pop', label: 'Pop' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
];

function CaptionSample({ def }: { def: CaptionStyleDef }) {
  const st = textStyleSchema.parse(def.style);
  const words = ['Make', 'it', 'pop'];
  return (
    <span
      className="block truncate leading-tight"
      style={{
        fontFamily: `'${st.fontFamily}'`,
        fontWeight: st.fontWeight,
        fontSize: 13,
        color: st.color,
        textTransform: st.uppercase ? 'uppercase' : undefined,
        WebkitTextStroke: st.strokeColor && st.strokeWidth ? `${Math.min(3, st.strokeWidth / 4)}px ${st.strokeColor}` : undefined,
        paintOrder: 'stroke fill',
        textShadow: st.shadowColor && st.shadowBlur ? `0 0 ${st.shadowBlur / 4}px ${st.shadowColor}` : undefined,
        background: st.backgroundColor ?? undefined,
        padding: st.backgroundColor ? '1px 4px' : undefined,
        borderRadius: 4,
      }}
    >
      {words.map((w, i) => {
        const active = i === 2;
        return (
          <span key={w}>
            {i > 0 && ' '}
            <span
              style={
                active
                  ? def.activeWord === 'color'
                    ? { color: def.activeColor }
                    : def.activeWord === 'box'
                      ? { background: def.activeColor, borderRadius: 3, padding: '0 3px' }
                      : def.activeWord === 'scale'
                        ? { color: def.activeColor, display: 'inline-block', transform: 'scale(1.15)' }
                        : def.activeWord === 'underline'
                          ? { background: `linear-gradient(transparent 55%, ${def.activeColor} 55%)` }
                          : undefined
                  : undefined
              }
            >
              {w}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CaptionsSection({ clip }: { clip: CaptionsClip }) {
  const fps = useEditor((s) => s.timeline.fps);
  const editName = useEditor((s) => s.name);
  const brand = useBrandColors();
  const def = CAPTION_STYLES_BY_ID[clip.styleId] ?? CAPTION_STYLES[0]!;
  const ov = clip.overrides;
  const style = textStyleSchema.parse({ ...def.style, ...Object.fromEntries(Object.entries(ov).filter(([k, v]) => STYLE_KEYS.has(k) && v !== null)) });
  const fonts = useFontOptions(style.fontFamily);
  const activeColor = typeof ov.activeColor === 'string' ? ov.activeColor : def.activeColor;
  const activeWord = (typeof ov.activeWord === 'string' ? ov.activeWord : def.activeWord) as CaptionStyleDef['activeWord'];
  const animation = (typeof ov.animation === 'string' ? ov.animation : def.animation) as CaptionStyleDef['animation'];

  const set = (fn: (c: CaptionsClip) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'captions') fn(c);
      },
      coalesce,
    );
  const override = (key: string, value: string | number | boolean | null, coalesce = true) =>
    set((c) => {
      c.overrides[key] = value;
    }, coalesce ? `ov:${key}` : undefined);

  const exportFile = (kind: 'srt' | 'vtt') => {
    const offset = clip.start / fps;
    const words = clip.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
    const base = (editName || 'captions').replace(/[^\w\- ]+/g, '').trim() || 'captions';
    if (kind === 'srt') downloadText(`${base}.srt`, toSrt(words, clip.maxWordsPerLine), 'application/x-subrip');
    else downloadText(`${base}.vtt`, toVtt(words, clip.maxWordsPerLine), 'text/vtt');
  };

  return (
    <>
      <Section title="Caption style">
        <div className="grid grid-cols-2 gap-1.5">
          {CAPTION_STYLES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                set((x) => {
                  x.styleId = c.id;
                  x.overrides = {};
                })
              }
              className={cn('rounded-lg border bg-neutral-900 px-2 pt-2.5 pb-1.5 text-center transition', clip.styleId === c.id ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/30')}
            >
              <CaptionSample def={c} />
              <span className="mt-1 block text-[10px] text-neutral-400">{c.label}</span>
            </button>
          ))}
        </div>
        <Row label="Position">
          <Segmented
            size="sm"
            value={clip.position}
            onChange={(v) => set((c) => (c.position = v))}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
        </Row>
        <SliderField label="Words / line" value={clip.maxWordsPerLine} min={1} max={12} step={1} onChange={(v) => set((c) => (c.maxWordsPerLine = Math.round(v)), 'maxWords')} />
      </Section>
      <Section
        title="Customize"
        defaultOpen={Object.keys(ov).length > 0}
        aside={
          Object.keys(ov).length > 0 ? (
            <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => set((c) => (c.overrides = {}))}>
              <RotateCcw className="mr-1 inline size-3" />
              Reset
            </button>
          ) : undefined
        }
      >
        <Row label="Font">
          <Select size="sm" value={style.fontFamily} onValueChange={(f) => set((c) => ((c.overrides.fontFamily = f), (c.overrides.fontWeight = nearest(weightsOf(f), style.fontWeight))))} options={fonts} />
        </Row>
        <Row label="Weight">
          <Select size="sm" value={String(style.fontWeight)} onValueChange={(v) => override('fontWeight', Number(v), false)} options={weightsOf(style.fontFamily).map((w) => ({ value: String(w), label: WEIGHT_LABEL[w] ?? String(w) }))} />
        </Row>
        <SliderField label="Size" value={style.fontSize} min={16} max={200} step={1} suffix="px" onChange={(v) => override('fontSize', v)} />
        <Row label="Text">
          <ColorInput value={style.color} swatches={brand} onChange={(v) => override('color', v)} />
        </Row>
        <Row label="Active word">
          <Select size="sm" value={activeWord} onValueChange={(v) => override('activeWord', v, false)} options={ACTIVE_WORD} />
        </Row>
        {activeWord !== 'none' && (
          <Row label="Active color">
            <ColorInput value={activeColor} swatches={brand} onChange={(v) => override('activeColor', v)} />
          </Row>
        )}
        <Row label="Animation">
          <Select size="sm" value={animation} onValueChange={(v) => override('animation', v, false)} options={CAPTION_ANIMATIONS} />
        </Row>
        <Toggle label="All caps" checked={style.uppercase} onChange={(v) => override('uppercase', v, false)} />
        <Toggle
          label="Outline"
          checked={!!style.strokeColor && style.strokeWidth > 0}
          onChange={(v) =>
            set((c) => {
              c.overrides.strokeColor = v ? (style.strokeColor ?? '#000000') : null;
              c.overrides.strokeWidth = v ? Math.max(style.strokeWidth, 8) : 0;
            })
          }
        />
        {!!style.strokeColor && style.strokeWidth > 0 && <SliderField label="Outline width" value={style.strokeWidth} min={0.5} max={40} step={0.5} digits={1} suffix="px" onChange={(v) => override('strokeWidth', v)} />}
        <Toggle label="Background bar" checked={!!style.backgroundColor} onChange={(v) => override('backgroundColor', v ? 'rgba(0,0,0,0.72)' : null, false)} />
        {style.backgroundColor && (
          <Row label="Bar color">
            <ColorInput value={style.backgroundColor} swatches={brand} onChange={(v) => override('backgroundColor', v)} />
          </Row>
        )}
      </Section>
      <CaptionWordsSection clip={clip} fps={fps} />
      <Section title="Subtitle files" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">Upload these to YouTube, Meta or TikTok as closed captions. Times match where the captions sit in this edit.</p>
        <div className="flex gap-2">
          <Button size="xs" variant="secondary" disabled={!clip.words.length} onClick={() => exportFile('srt')}>
            <Download /> .srt
          </Button>
          <Button size="xs" variant="secondary" disabled={!clip.words.length} onClick={() => exportFile('vtt')}>
            <Download /> .vtt
          </Button>
        </div>
      </Section>
    </>
  );
}

function CaptionWordsSection({ clip, fps }: { clip: CaptionsClip; fps: number }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [script, setScript] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);
  const words = clip.words;
  const active = usePlayhead((p) => {
    const t = (p.frame - clip.start) / fps;
    return words.findIndex((w) => t >= w.start && t < w.end);
  });
  const word = editing != null ? words[editing] : undefined;
  const span = clip.duration / fps;

  const setWords = (fn: (list: CaptionWord[]) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'captions') fn(c.words);
      },
      coalesce ? `words:${coalesce}` : undefined,
    );
  const shift = (delta: number) =>
    setWords((list) => {
      for (const w of list) {
        w.start = Math.max(0, w.start + delta);
        w.end = Math.max(w.start + 0.04, w.end + delta);
      }
    }, 'shift');

  return (
    <Section title={`Words (${words.length})`}>
      {words.length === 0 ? (
        <p className="text-xs text-muted-foreground">No words yet. Paste a script below, or right-click a video or voice clip and choose “Captions from speech”.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border bg-surface p-2 text-[13px] leading-relaxed">
          {words.map((w, i) => (
            <button
              // Words can repeat, so the index is part of the key.
              key={`${i}-${w.start}`}
              type="button"
              onClick={() => {
                setEditing(i);
                player.seek(clip.start + Math.round(w.start * fps));
              }}
              className={cn('mr-1 rounded px-0.5 transition', i === active && 'bg-primary/25 text-foreground', i === editing ? 'ring-1 ring-primary' : 'hover:bg-accent')}
            >
              {w.text}
            </button>
          ))}
        </div>
      )}
      {word && editing != null && (
        <div className="space-y-2 rounded-lg border p-2.5">
          <Input
            value={word.text}
            maxLength={80}
            onChange={(e) => {
              const v = e.target.value;
              setWords((list) => {
                const w = list[editing];
                if (w) w.text = v;
              }, `text:${editing}`);
            }}
            className="h-8 text-[13px]"
            aria-label="Word"
          />
          <div className="grid grid-cols-2 gap-2">
            <Row label="Start" className="grid-cols-[2.5rem_1fr]">
              <NumberInput
                value={word.start}
                min={0}
                max={word.end - 0.02}
                step={0.01}
                suffix="s"
                onChange={(v) =>
                  setWords((list) => {
                    const w = list[editing];
                    if (w) w.start = v;
                  })
                }
              />
            </Row>
            <Row label="End" className="grid-cols-[2.5rem_1fr]">
              <NumberInput
                value={word.end}
                min={word.start + 0.02}
                max={span}
                step={0.01}
                suffix="s"
                onChange={(v) =>
                  setWords((list) => {
                    const w = list[editing];
                    if (w) w.end = v;
                  })
                }
              />
            </Row>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setWords((list) => {
                  const w = list[editing];
                  if (!w) return;
                  const next = list[editing + 1];
                  const end = Math.min(span, next ? next.start : w.end + 0.4);
                  list.splice(editing + 1, 0, { text: 'word', start: w.end, end: Math.max(w.end + 0.05, end) });
                });
                setEditing(editing + 1);
              }}
            >
              <Plus /> Word after
            </Button>
            {editing < words.length - 1 && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  setWords((list) => {
                    const w = list[editing];
                    const next = list[editing + 1];
                    if (!w || !next) return;
                    w.text = `${w.text} ${next.text}`;
                    w.end = next.end;
                    list.splice(editing + 1, 1);
                  })
                }
              >
                Join with next
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                setWords((list) => {
                  list.splice(editing, 1);
                });
                setEditing(null);
              }}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}
      {words.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex-1">Shift all timing</span>
          <Button size="icon-xs" variant="secondary" aria-label="Earlier by 0.1 seconds" title="Earlier by 0.1s" onClick={() => shift(-0.1)}>
            <Minus />
          </Button>
          <Button size="icon-xs" variant="secondary" aria-label="Later by 0.1 seconds" title="Later by 0.1s" onClick={() => shift(0.1)}>
            <Plus />
          </Button>
        </div>
      )}
      <Popover open={scriptOpen} onOpenChange={setScriptOpen}>
        <PopoverTrigger asChild>
          <Button size="xs" variant="ghost" className="text-muted-foreground">
            {words.length ? 'Replace with a script…' : 'Paste a script…'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-2">
          <p className="text-xs text-muted-foreground">Words are spread evenly across this caption clip ({span.toFixed(1)}s). Fine-tune any word afterwards.</p>
          <Textarea rows={5} value={script} maxLength={5000} onChange={(e) => setScript(e.target.value)} placeholder="Type or paste what is said…" />
          <Button
            size="sm"
            className="w-full"
            disabled={!script.trim()}
            onClick={() => {
              const timed = estimateWordTimings(script, span);
              setWords((list) => {
                list.splice(0, list.length, ...timed);
              });
              setEditing(null);
              setScript('');
              setScriptOpen(false);
            }}
          >
            Use this text
          </Button>
        </PopoverContent>
      </Popover>
    </Section>
  );
}

/* ----------------------------------- Shapes ----------------------------------- */

const SHAPE_OPTIONS: { value: ShapeClip['shape']; label: ReactNode; title: string }[] = [
  { value: 'rect', label: <Square className="size-3.5" />, title: 'Rectangle' },
  { value: 'ellipse', label: <Circle className="size-3.5" />, title: 'Ellipse' },
  { value: 'triangle', label: <Triangle className="size-3.5" />, title: 'Triangle' },
  { value: 'star', label: <Star className="size-3.5" />, title: 'Star' },
  { value: 'line', label: <Minus className="size-3.5" />, title: 'Line' },
];

export function ShapeSection({ clip }: { clip: ShapeClip }) {
  const brand = useBrandColors();
  const set = (fn: (c: ShapeClip) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'shape') fn(c);
      },
      coalesce,
    );
  const line = clip.shape === 'line';
  return (
    <Section title="Shape">
      <Segmented size="sm" value={clip.shape} onChange={(v) => set((c) => (c.shape = v))} options={SHAPE_OPTIONS} />
      {!line && (
        <>
          <Toggle label="Fill" checked={clip.fill != null} onChange={(v) => set((c) => (c.fill = v ? (brand[0] ?? '#7C5CFF') : null))} />
          {clip.fill != null && (
            <Row label="Fill color">
              <ColorInput value={clip.fill} swatches={brand} onChange={(v) => set((c) => (c.fill = v), 'fill')} />
            </Row>
          )}
        </>
      )}
      <Toggle
        label={line ? 'Line' : 'Border'}
        checked={clip.stroke != null && clip.strokeWidth > 0}
        onChange={(v) =>
          set((c) => {
            c.stroke = v ? (c.stroke ?? '#FFFFFF') : null;
            c.strokeWidth = v ? Math.max(c.strokeWidth, 4) : 0;
          })
        }
      />
      {clip.stroke != null && clip.strokeWidth > 0 && (
        <>
          <Row label={line ? 'Line color' : 'Border color'}>
            <ColorInput value={clip.stroke} swatches={brand} onChange={(v) => set((c) => (c.stroke = v), 'stroke')} />
          </Row>
          <SliderField label="Thickness" value={clip.strokeWidth} min={0.5} max={100} step={0.5} digits={1} suffix="px" onChange={(v) => set((c) => (c.strokeWidth = v), 'strokeWidth')} />
        </>
      )}
      {clip.shape === 'rect' && <SliderField label="Roundness" value={clip.radius} min={0} max={0.5} step={0.005} scale={200} suffix="%" onChange={(v) => set((c) => (c.radius = v), 'radius')} />}
    </Section>
  );
}

/* ----------------------------------- Motion ----------------------------------- */

export function MotionSection({ clip }: { clip: MotionClip }) {
  const def = MOTION_TEMPLATES_BY_ID[clip.templateId];
  const brand = useBrandColors();
  const assets = useEditor((s) => s.assets);
  if (!def)
    return (
      <Section title="Motion">
        <Notice tone="warning">This motion template is no longer available. Replace it with another one from the Motion tab.</Notice>
      </Section>
    );
  const values: Record<string, unknown> = { ...motionDefaults(def.id), ...clip.props };
  const setProp = (key: string, value: unknown, coalesce?: boolean) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'motion') c.props[key] = value;
      },
      coalesce ? `prop:${key}` : undefined,
    );
  return (
    <Section
      title={def.name}
      aside={
        <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => patchClip(clip.id, (c) => c.type === 'motion' && (c.props = motionDefaults(def.id)))}>
          <RotateCcw className="mr-1 inline size-3" />
          Reset
        </button>
      }
    >
      <p className="text-xs text-muted-foreground">{def.description}</p>
      {def.fields.map((f) => {
        const v = values[f.key];
        const asset = f.type === 'asset' && typeof v === 'string' ? (assets[v] ?? null) : null;
        return (
          <FieldControl
            key={f.key}
            field={f}
            value={v}
            brand={brand}
            asset={asset}
            onChange={(next) => setProp(f.key, next, f.type !== 'select' && f.type !== 'boolean')}
            onAsset={(a) => {
              if (a) useEditor.getState().mergeAssets([a]);
              setProp(f.key, a?.id ?? null);
            }}
          />
        );
      })}
    </Section>
  );
}
