'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, ImagePlus, PenLine, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LANGUAGES } from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { ChipList, hostOf, JobLine, money, StatusPill } from '@/components/growth/shared';
import { useProduct } from '@/components/growth/use-growth';
import { LlmPrice } from '@/components/scripts/llm-price';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView, ProductCopy, ProductView, ScriptView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useOnChange } from '@/lib/hooks/use-on-change';

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'meta', label: 'Meta ads (FB + IG)' },
  { value: 'youtube', label: 'YouTube Shorts' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
];

interface Draft {
  title: string;
  brandName: string;
  price: string;
  currency: string;
  description: string;
  colors: string[];
  images: AssetView[];
  logo: AssetView | null;
  copy: ProductCopy;
}

const toDraft = (p: ProductView): Draft => ({
  title: p.title ?? '',
  brandName: p.brandName ?? '',
  price: p.price == null ? '' : String(p.price),
  currency: p.currency ?? '',
  description: p.description ?? '',
  colors: p.colors,
  images: p.images,
  logo: p.logo,
  copy: p.copy,
});

export function ProductDetail({ id }: { id: string }) {
  const q = useProduct(id);
  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.isError || !q.data) return <EmptyState title="Product not found" description={q.error ? errorMessage(q.error) : 'It may have been deleted.'} action={<Button asChild variant="outline"><Link href="/products">Back to products</Link></Button>} />;
  return <Loaded product={q.data} />;
}

function Loaded({ product: p }: { product: ProductView }) {
  const router = useRouter();
  const qc = useQueryClient();
  // The draft starts from a snapshot of the product; newer server data (an import landing)
  // replaces it only while there are no unsaved edits.
  const [base, setBase] = useState<ProductView>(p);
  const [draft, setDraft] = useState<Draft>(() => toDraft(p));
  const [pickImages, setPickImages] = useState(false);
  const [pickLogo, setPickLogo] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(base)), [draft, base]);
  useOnChange([p, base.updatedAt, dirty], () => {
    if (p.updatedAt !== base.updatedAt && !dirty) {
      setBase(p);
      setDraft(toDraft(p));
    }
  });

  const setCopy = <K extends keyof ProductCopy>(k: K, v: ProductCopy[K]) => setDraft((d) => ({ ...d, copy: { ...d.copy, [k]: v } }));
  const refresh = (next: ProductView) => {
    qc.setQueryData(['product', p.id], next);
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const price = draft.price.trim() === '' ? null : Number(draft.price);
      if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('Price must be a positive number.');
      if (draft.currency.trim() && !/^[A-Za-z]{3}$/.test(draft.currency.trim())) throw new Error('Use a 3-letter currency code, like USD or EUR.');
      return api.patch<ProductView>(`/products/${p.id}`, {
        ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
        brandName: draft.brandName.trim() || null,
        price,
        currency: draft.currency.trim() || null,
        description: draft.description.trim() || null,
        colors: draft.colors,
        imageAssetIds: draft.images.map((a) => a.id),
        logoAssetId: draft.logo?.id ?? null,
        copy: { ...draft.copy, offer: draft.copy.offer?.trim() || null },
      });
    },
    onSuccess: (next) => {
      refresh(next);
      setBase(next);
      setDraft(toDraft(next));
      toast.success('Product saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reimport = useMutation({
    mutationFn: () => api.post<ProductView>(`/products/${p.id}/reimport`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/products/${p.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push('/products');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const importing = p.status === 'importing';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link href="/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> URL to Video
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{p.title ?? (importing ? 'Reading the page…' : hostOf(p.sourceUrl))}</h1>
            <StatusPill status={p.status} label={importing ? 'Reading' : undefined} />
          </div>
          <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-sm text-muted-foreground hover:text-primary">
            {hostOf(p.sourceUrl)} <ExternalLink className="size-3.5 shrink-0" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clone?productId=${p.id}`}>
              <Copy className="size-4" /> Clone a winning ad
            </Link>
          </Button>
          <Button variant="outline" size="sm" loading={reimport.isPending} disabled={importing} onClick={() => reimport.mutate()}>
            <RefreshCw className="size-4" /> Read again
          </Button>
          <Confirm title="Delete this product?" description="Scripts and ads already made from it stay. Its photos stay in your library." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
            <Button variant="ghost" size="icon-sm" aria-label="Delete product">
              <Trash2 className="size-4" />
            </Button>
          </Confirm>
        </div>
      </div>

      {importing && (
        <div className="rounded-2xl border bg-card p-5">
          <JobLine job={p.job} label="Reading the page" />
          {!p.job && <p className="text-sm text-muted-foreground">Reading the page…</p>}
        </div>
      )}
      {p.status === 'failed' && (
        <Notice tone="error" title="The page could not be read" action={<Button size="sm" variant="outline" loading={reimport.isPending} onClick={() => reimport.mutate()}>Try again</Button>}>
          {p.error ?? 'Check that the link opens a product page and try again.'}
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Photos and logo</h2>
              <Button size="xs" variant="outline" onClick={() => setPickImages(true)}>
                <ImagePlus className="size-3.5" /> Add from library
              </Button>
            </div>
            {draft.images.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {draft.images.map((a, i) => (
                  <div key={a.id} className={cn('group relative aspect-square overflow-hidden rounded-xl border bg-muted', i === 0 && 'ring-2 ring-primary')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.thumbnailUrl && <img src={a.thumbnailUrl} alt={a.name} className="size-full object-cover" />}
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">Hero</span>}
                    <div className="absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      {i > 0 && (
                        <button type="button" aria-label="Use as hero" className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80" onClick={() => setDraft((d) => ({ ...d, images: [a, ...d.images.filter((x) => x.id !== a.id)] }))}>
                          <Star className="size-3.5" />
                        </button>
                      )}
                      <button type="button" aria-label="Remove photo" className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80" onClick={() => setDraft((d) => ({ ...d, images: d.images.filter((x) => x.id !== a.id) }))}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{importing ? 'Photos appear here once the page is read.' : 'No photos. Add some from your library so scripts and storyboards can use them.'}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 border-t pt-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPickLogo(true)} className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted hover:border-primary/60" aria-label="Choose logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {draft.logo?.thumbnailUrl ? <img src={draft.logo.thumbnailUrl} alt="Logo" className="size-full object-contain p-1" /> : <ImagePlus className="size-4 text-muted-foreground" />}
                </button>
                <div className="text-xs">
                  <div className="font-medium">Logo</div>
                  {draft.logo ? (
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, logo: null }))}>
                      Remove
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Used on end cards</span>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Colors</span>
                {draft.colors.map((c) => (
                  <button key={c} type="button" title={`Remove ${c}`} className="group relative size-7 rounded-full border shadow-sm" style={{ background: c }} onClick={() => setDraft((d) => ({ ...d, colors: d.colors.filter((x) => x !== c) }))}>
                    <X className="absolute inset-0 m-auto size-3.5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                  </button>
                ))}
                {draft.colors.length < 12 && (
                  <label className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed text-muted-foreground hover:border-primary/60" title="Add a color">
                    <span className="text-sm leading-none">+</span>
                    <input type="color" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => setDraft((d) => (d.colors.includes(e.target.value) ? d : { ...d, colors: [...d.colors, e.target.value.toLowerCase()] }))} />
                  </label>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Facts</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name">
                <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={300} />
              </Field>
              <Field label="Brand">
                <Input value={draft.brandName} onChange={(e) => setDraft((d) => ({ ...d, brandName: e.target.value }))} maxLength={200} />
              </Field>
              <Field label="Price" hint={p.price != null ? `Read as ${money(p.price, p.currency)}` : undefined}>
                <Input value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} inputMode="decimal" placeholder="29.00" />
              </Field>
              <Field label="Currency">
                <Input value={draft.currency} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase().slice(0, 3) }))} placeholder="USD" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea rows={4} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} maxLength={5000} />
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border bg-card p-5">
            <div>
              <h2 className="font-semibold">Selling angles</h2>
              <p className="text-xs text-muted-foreground">What the script writer works from. Fix anything the page got wrong; press Enter to add an item.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Input value={draft.copy.category} onChange={(e) => setCopy('category', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Offer">
                <Input value={draft.copy.offer ?? ''} onChange={(e) => setCopy('offer', e.target.value)} maxLength={500} placeholder="20% off this week" />
              </Field>
            </div>
            <Field label="Audience">
              <Textarea rows={2} value={draft.copy.audience} onChange={(e) => setCopy('audience', e.target.value)} maxLength={1000} />
            </Field>
            <Field label="Tone">
              <Input value={draft.copy.tone} onChange={(e) => setCopy('tone', e.target.value)} maxLength={200} />
            </Field>
            {(
              [
                ['hooks', 'Hooks', 'Opening lines that stop the scroll'],
                ['benefits', 'Benefits', 'What the buyer gets'],
                ['painPoints', 'Pain points', 'What they struggle with today'],
                ['usps', 'Why this one', 'What competitors cannot claim'],
                ['features', 'Features', 'Specs and details'],
                ['ctaSuggestions', 'Calls to action', 'How each ad should end'],
              ] as const
            ).map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <ChipList items={draft.copy[key]} onChange={(v) => setCopy(key, v)} max={key === 'ctaSuggestions' ? 10 : 20} />
              </Field>
            ))}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <MakeAd product={p} disabled={p.status !== 'ready' || dirty} hooks={draft.copy.hooks} />
          <div className={cn('flex items-center gap-2 rounded-2xl border bg-card p-4 transition', dirty ? 'border-primary/50' : 'opacity-70')}>
            <div className="min-w-0 flex-1 text-sm">{dirty ? 'Unsaved changes' : 'All changes saved'}</div>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(base))}>
                Discard
              </Button>
            )}
            <Button size="sm" loading={save.isPending} disabled={!dirty || importing} onClick={() => save.mutate()}>
              <Save className="size-4" /> Save
            </Button>
          </div>
        </aside>
      </div>

      <AssetPicker
        open={pickImages}
        onOpenChange={setPickImages}
        types={['image']}
        multiple
        max={20}
        title="Product photos"
        initial={draft.images}
        onPick={(list) => setDraft((d) => ({ ...d, images: list.slice(0, 20) }))}
      />
      <AssetPicker open={pickLogo} onOpenChange={setPickLogo} types={['image']} title="Logo" onPick={(list) => list[0] && setDraft((d) => ({ ...d, logo: list[0]! }))} />
    </div>
  );
}

function MakeAd({ product: p, disabled, hooks }: { product: ProductView; disabled: boolean; hooks: string[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState('tiktok');
  const [duration, setDuration] = useState('30');
  const [language, setLanguage] = useState('en');
  const [angle, setAngle] = useState('auto');
  const write = useMutation({
    mutationFn: () =>
      api.post<ScriptView>('/scripts', {
        mode: 'generate',
        title: p.title ? `${p.title} ad` : undefined,
        brief: {
          format: 'ad',
          product: '',
          productId: p.id,
          audience: p.copy.audience,
          goal: 'Drive purchases',
          ...(p.copy.tone ? { tone: p.copy.tone.slice(0, 200) } : {}),
          platform,
          durationS: Number(duration),
          language,
          characterIds: [],
          ...(angle !== 'auto' ? { angle: angle.slice(0, 500) } : {}),
        },
      }),
    onSuccess: (s) => router.push(`/scripts/${s.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="relative space-y-4 overflow-hidden rounded-2xl border bg-card p-5">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative">
        <h2 className="font-semibold">Make a video ad</h2>
        <p className="text-xs text-muted-foreground">A timed script with shots, on-screen text and voice-over, ready for a storyboard and the editor.</p>
      </div>
      <Field label="Platform">
        <Select value={platform} onValueChange={setPlatform} options={PLATFORMS} />
      </Field>
      <Field label="Length">
        <Segmented size="sm" value={duration} onChange={setDuration} options={['15', '30', '45', '60'].map((d) => ({ value: d, label: `${d}s` }))} />
      </Field>
      <Field label="Hook">
        <Select value={angle} onValueChange={setAngle} options={[{ value: 'auto', label: 'Let the writer choose' }, ...hooks.slice(0, 20).map((h) => ({ value: h, label: h.length > 70 ? `${h.slice(0, 70)}…` : h }))]} />
      </Field>
      <Field label="Language">
        <Select value={language} onValueChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="brand" loading={write.isPending} disabled={disabled} onClick={() => write.mutate()}>
          <PenLine className="size-4" /> Write the ad
        </Button>
        <LlmPrice task="writeScript" />
      </div>
      {disabled && p.status === 'ready' && <p className="text-xs text-muted-foreground">Save your changes first.</p>}
    </section>
  );
}
