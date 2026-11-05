'use client';

import type { MotionFieldDef } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { ColorInput } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AssetView } from '@/lib/types';

/** One control for a motion template field, shared by the motion studio and the editor inspector. */
export function FieldControl({ field: f, value, brand, asset, onChange, onAsset }: { field: MotionFieldDef; value: unknown; brand: string[]; asset: AssetView | null; onChange: (v: unknown) => void; onAsset: (a: AssetView | null) => void }) {
  switch (f.type) {
    case 'text':
    case 'url':
      return (
        <Field label={f.label}>
          <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} inputMode={f.type === 'url' ? 'url' : undefined} maxLength={f.type === 'url' ? 2000 : 200} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={f.label}>
          <Textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={600} />
        </Field>
      );
    case 'color':
      return (
        <Field label={f.label}>
          <ColorInput value={String(value ?? '#ffffff')} onChange={onChange} swatches={brand} />
        </Field>
      );
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value) || f.min;
      return (
        <Field label={f.label} aside={String(n)}>
          <Slider min={f.min} max={f.max} step={f.step} value={[n]} onValueChange={([v]) => onChange(v ?? n)} />
        </Field>
      );
    }
    case 'select':
      return (
        <Field label={f.label}>
          {f.options.length <= 4 ? (
            <Segmented size="sm" value={String(value ?? f.options[0])} onChange={onChange} options={f.options.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))} />
          ) : (
            <Select value={String(value ?? f.options[0])} onValueChange={onChange} options={f.options.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))} />
          )}
        </Field>
      );
    case 'boolean':
      return (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{f.label}</span>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </label>
      );
    case 'asset':
      return <AssetSlot label={f.label} types={[f.assetType]} value={asset} onChange={onAsset} />;
    case 'list': {
      const items = Array.isArray(value) ? value.map(String) : [];
      return (
        <Field label={f.label} hint="One per line.">
          <Textarea
            rows={Math.min(6, Math.max(3, items.length + 1))}
            value={items.join('\n')}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split('\n')
                  .map((l) => l.slice(0, 120))
                  .slice(0, 8),
              )
            }
          />
        </Field>
      );
    }
  }
}
