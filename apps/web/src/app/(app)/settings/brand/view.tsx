'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette, Plus, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CAPTION_STYLES, FONT_FAMILIES, googleFontsHref, WATERMARK_POSITIONS } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { isAdmin, SettingsSection } from '@/components/settings/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useBrandKits } from '@/lib/hooks/use-brand-kits';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, BrandKitView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

const ROLE_NAMES = ['primary', 'accent', 'ink', 'paper'];
const HEX = /^#[0-9a-f]{6}$/i;
const POSITION_LABEL: Record<(typeof WATERMARK_POSITIONS)[number], string> = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };
const FONT_OPTIONS = [{ value: 'none', label: 'Not set' }, ...FONT_FAMILIES.map((f) => ({ value: f.family, label: f.family, hint: f.category }))];

export function BrandView() {
  const me = useMe();
  const qc = useQueryClient();
  const kits = useBrandKits();
  const admin = isAdmin(me.data);
  const [selected, setSelected] = useState<string | null>(null);
  const list = kits.data ?? [];
  const kit = list.find((k) => k.id === selected) ?? list.find((k) => k.isDefault) ?? list[0] ?? null;
  const create = useMutation({
    mutationFn: () => api.post<BrandKitView>('/brand-kits', { name: `Brand kit ${list.length + 1}`, colors: [], fonts: {} }),
    onSuccess: (k) => {
      void qc.invalidateQueries({ queryKey: ['brand-kits'] });
      setSelected(k.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (kits.isLoading) return <Skeleton className="h-[60vh] rounded-2xl" />;
  if (kits.isError) return <Notice tone="error">Could not load brand kits. {errorMessage(kits.error)}</Notice>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The default kit styles new storyboards, templates and captions, and its files show up in the editor&apos;s Brand tab. The colors named primary, accent, ink and paper are the ones templates use.
      </p>
      {!admin && me.data && <Notice tone="info">Only owners and admins can change brand kits.</Notice>}
      {list.length ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="space-y-2">
            {list.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setSelected(k.id)}
                aria-pressed={kit?.id === k.id}
                className={cn('w-full rounded-xl border p-3 text-left transition hover:bg-accent/60', kit?.id === k.id && 'border-primary/50 bg-accent')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{k.name}</span>
                  {k.isDefault && <Badge variant="default">Default</Badge>}
                </div>
                <div className="mt-2 flex gap-1">
                  {k.colors.slice(0, 8).map((c, i) => (
                    <span key={`${c}-${i}`} className="size-4 rounded-full border" style={{ background: c }} />
                  ))}
                  {!k.colors.length && <span className="text-xs text-muted-foreground">No colors yet</span>}
                </div>
              </button>
            ))}
            {admin && list.length < 20 && (
              <Button variant="outline" size="sm" className="w-full" loading={create.isPending} onClick={() => create.mutate()}>
                <Plus /> New kit
              </Button>
            )}
          </div>
          {kit && <KitEditor key={`${kit.id}:${kit.updatedAt}`} kit={kit} admin={admin} onDeleted={() => setSelected(null)} />}
        </div>
      ) : (
        <EmptyState
          icon={<Palette />}
          title="No brand kit yet"
          description="Add your colors, fonts, logo, intro and outro once. New storyboards, templates and captions use them."
          action={
            admin ? (
              <Button loading={create.isPending} onClick={() => create.mutate()}>
                <Plus /> Create a brand kit
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

interface Draft {
  name: string;
  palette: { name: string; hex: string }[];
  display: string | null;
  body: string | null;
  tone: string;
  logo: AssetView | null;
  intro: AssetView | null;
  outro: AssetView | null;
  watermarkAsset: AssetView | null;
  watermark: BrandKitView['watermark'];
  captionStyleId: string | null;
}

const toDraft = (k: BrandKitView): Draft => ({
  name: k.name,
  palette: k.palette.map((c) => ({ ...c })),
  display: k.fonts.display ?? null,
  body: k.fonts.body ?? null,
  tone: k.tone ?? '',
  logo: k.logo,
  intro: k.intro,
  outro: k.outro,
  watermarkAsset: k.watermarkAsset,
  watermark: { ...k.watermark },
  captionStyleId: k.captionStyleId,
});

function KitEditor({ kit, admin, onDeleted }: { kit: BrandKitView; admin: boolean; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(kit));
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const badColor = d.palette.findIndex((c) => !HEX.test(c.hex));
  const nameError = !d.name.trim() ? 'The kit needs a name.' : null;
  const refresh = (k?: BrandKitView) => {
    if (k) qc.setQueryData<BrandKitView[]>(['brand-kits'], (old) => old?.map((x) => (x.id === k.id ? k : k.isDefault ? { ...x, isDefault: false } : x)));
    void qc.invalidateQueries({ queryKey: ['brand-kits'] });
  };
  const save = useMutation({
    mutationFn: () =>
      api.patch<BrandKitView>(`/brand-kits/${kit.id}`, {
        name: d.name.trim(),
        colors: d.palette.map((c) => ({ name: c.name.trim(), hex: c.hex })),
        fonts: { ...(d.display ? { display: d.display } : {}), ...(d.body ? { body: d.body } : {}) },
        tone: d.tone.trim() || null,
        logoAssetId: d.logo?.id ?? null,
        introAssetId: d.intro?.id ?? null,
        outroAssetId: d.outro?.id ?? null,
        watermarkAssetId: d.watermarkAsset?.id ?? null,
        watermark: d.watermark,
        captionStyleId: d.captionStyleId,
      }),
    onSuccess: (k) => {
      refresh(k);
      toast.success('Brand kit saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const makeDefault = useMutation({
    mutationFn: () => api.patch<BrandKitView>(`/brand-kits/${kit.id}`, { isDefault: true }),
    onSuccess: (k) => {
      refresh(k);
      toast.success(`${k.name} is now the default kit`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addColor = () => {
    const used = new Set(d.palette.map((c) => c.name.toLowerCase()));
    set({ palette: [...d.palette, { name: ROLE_NAMES.find((n) => !used.has(n)) ?? '', hex: '#000000' }] });
  };
  const ro = !admin;

  return (
    <SettingsSection
      title={kit.name}
      description={`Saved ${timeAgo(kit.updatedAt)}`}
      actions={
        admin ? (
          <>
            {!kit.isDefault && (
              <Button size="sm" variant="ghost" loading={makeDefault.isPending} onClick={() => makeDefault.mutate()}>
                <Star /> Make default
              </Button>
            )}
            <Confirm
              title={`Delete ${kit.name}?`}
              description={kit.isDefault ? 'Another kit becomes the default. Files in the library are not deleted.' : 'Files in the library are not deleted.'}
              confirmLabel="Delete kit"
              destructive
              onConfirm={async () => {
                try {
                  await api.delete(`/brand-kits/${kit.id}`);
                  onDeleted();
                  void qc.invalidateQueries({ queryKey: ['brand-kits'] });
                  toast.success('Brand kit deleted');
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <Button size="icon-sm" variant="ghost" aria-label="Delete kit" className="text-muted-foreground hover:text-destructive">
                <Trash2 />
              </Button>
            </Confirm>
          </>
        ) : undefined
      }
      footer={
        admin ? (
          <>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => (setD(toDraft(kit)), setDirty(false))}>
                Discard
              </Button>
            )}
            <Button size="sm" disabled={!dirty || badColor >= 0 || !!nameError} loading={save.isPending} onClick={() => save.mutate()}>
              Save kit
            </Button>
          </>
        ) : undefined
      }
    >
      <Field label="Name" error={nameError}>
        <Input value={d.name} maxLength={80} disabled={ro} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">Colors</span>
          {admin && d.palette.length < 12 && (
            <Button size="xs" variant="ghost" onClick={addColor}>
              <Plus /> Add color
            </Button>
          )}
        </div>
        {d.palette.length ? (
          <ul className="space-y-2">
            {d.palette.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  value={c.name}
                  maxLength={40}
                  disabled={ro}
                  placeholder="Name, e.g. primary"
                  aria-label="Color name"
                  className="h-8 w-36"
                  onChange={(e) => set({ palette: d.palette.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                />
                <ColorInput value={c.hex} swatches={[]} onChange={(hex) => !ro && set({ palette: d.palette.map((x, j) => (j === i ? { ...x, hex } : x)) })} />
                {admin && (
                  <Button size="icon-xs" variant="ghost" aria-label="Remove color" onClick={() => set({ palette: d.palette.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No colors yet. Add primary, accent, ink (text) and paper (background) first.</p>
        )}
        {badColor >= 0 && <p className="text-xs text-destructive">Color {badColor + 1} is not a #RRGGBB color.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Headline font">
          <Select value={d.display ?? 'none'} disabled={ro} onValueChange={(v) => set({ display: v === 'none' ? null : v })} options={FONT_OPTIONS} />
        </Field>
        <Field label="Body font">
          <Select value={d.body ?? 'none'} disabled={ro} onValueChange={(v) => set({ body: v === 'none' ? null : v })} options={FONT_OPTIONS} />
        </Field>
      </div>
      {(d.display || d.body) && (
        <div className="rounded-xl border bg-surface-2/40 p-4">
          <FontsLink families={[d.display, d.body]} />
          {d.display && (
            <p className="text-2xl leading-tight" style={{ fontFamily: `"${d.display}", var(--font-display)` }}>
              Keeps ice for 24 hours
            </p>
          )}
          {d.body && (
            <p className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: `"${d.body}", var(--font-sans)` }}>
              Double-wall steel, leak-proof lid, fits every cup holder.
            </p>
          )}
        </div>
      )}

      <Field label="Tone of voice" hint="Scripts and captions follow it, e.g. “Warm and direct. Short sentences. No hype words.”">
        <Textarea value={d.tone} maxLength={500} rows={2} disabled={ro} onChange={(e) => set({ tone: e.target.value })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <AssetSlot label="Logo" types={['image']} value={d.logo} onChange={(a) => !ro && set({ logo: a })} hint="PNG or SVG with a transparent background works best." />
        <AssetSlot label="Watermark" types={['image']} value={d.watermarkAsset} onChange={(a) => !ro && set({ watermarkAsset: a })} hint="From the editor's Brand tab it goes over the whole video, in the corner set below." />
        <AssetSlot label="Intro" types={['video']} value={d.intro} onChange={(a) => !ro && set({ intro: a })} hint="A short opener, ready in the editor's Brand tab." />
        <AssetSlot label="Outro" types={['video']} value={d.outro} onChange={(a) => !ro && set({ outro: a })} hint="An end card with your logo or offer, ready in the editor's Brand tab." />
      </div>

      {d.watermarkAsset && (
        <div className="grid gap-4 rounded-xl border bg-surface-2/40 p-4 sm:grid-cols-3">
          <Field label="Watermark corner">
            <Select value={d.watermark.position} disabled={ro} onValueChange={(v) => set({ watermark: { ...d.watermark, position: v as Draft['watermark']['position'] } })} options={WATERMARK_POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))} />
          </Field>
          <Field label={`Opacity · ${Math.round(d.watermark.opacity * 100)}%`}>
            <Slider value={[d.watermark.opacity]} min={0.1} max={1} step={0.05} disabled={ro} onValueChange={([v]) => set({ watermark: { ...d.watermark, opacity: v ?? d.watermark.opacity } })} className="py-2" />
          </Field>
          <Field label={`Width · ${Math.round(d.watermark.scale * 100)}% of the frame`}>
            <Slider value={[d.watermark.scale]} min={0.04} max={0.4} step={0.01} disabled={ro} onValueChange={([v]) => set({ watermark: { ...d.watermark, scale: v ?? d.watermark.scale } })} className="py-2" />
          </Field>
        </div>
      )}

      <Field label="Caption style" hint="Used when captions are added to an edit.">
        <Select
          value={d.captionStyleId ?? 'none'}
          disabled={ro}
          onValueChange={(v) => set({ captionStyleId: v === 'none' ? null : v })}
          options={[{ value: 'none', label: 'Editor default' }, ...CAPTION_STYLES.map((c) => ({ value: c.id, label: c.label }))]}
          className="sm:max-w-64"
        />
      </Field>
    </SettingsSection>
  );
}

function FontsLink({ families }: { families: (string | null)[] }) {
  const href = googleFontsHref(families.filter((f): f is string => !!f));
  return href ? <link rel="stylesheet" href={href} precedence="default" /> : null;
}
