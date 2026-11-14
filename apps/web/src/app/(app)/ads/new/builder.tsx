'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Rocket, Save, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AD_CTAS, AD_OBJECTIVES } from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { AssetThumb } from '@/components/app/asset-card';
import { PlatformIcon } from '@/components/app/platform-icon';
import { ctaLabel, OBJECTIVE_LABEL } from '@/components/distribution/labels';
import { useAdsSetup } from '@/components/distribution/use-distribution';
import { ChipList, money } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView, CampaignView, VariantBatchView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useOnChange } from '@/lib/hooks/use-on-change';

interface Creative {
  asset: AssetView;
  headline: string;
  primaryText: string;
  variantLabel: string;
}


export function CampaignBuilder() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const setup = useAdsSetup();
  const batchId = params.get('batch');
  const assetId = params.get('asset');
  const batch = useQuery({ queryKey: ['variant', batchId], queryFn: () => api.get<VariantBatchView>(`/variants/${batchId}`), enabled: !!batchId });
  const single = useQuery({ queryKey: ['asset', assetId, 'view'], queryFn: () => api.get<{ asset: AssetView }>(`/assets/${assetId}`).then((r) => r.asset), enabled: !!assetId });

  const accounts = useMemo(() => (setup.data?.accounts ?? []).filter((a) => a.status === 'active'), [setup.data]);
  const [accountId, setAccountId] = useState<string>('');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<(typeof AD_OBJECTIVES)[number]>('traffic');
  const [budget, setBudget] = useState('20');
  const [countries, setCountries] = useState<string[]>(['US']);
  const [ages, setAges] = useState<[number, number]>([18, 65]);
  const [landingUrl, setLandingUrl] = useState('');
  const [cta, setCta] = useState<(typeof AD_CTAS)[number]>('SHOP_NOW');
  const [headline, setHeadline] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<'launch' | 'draft'>('launch');

  useOnChange([accounts, accountId], () => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  });
  useOnChange([batch.data], () => {
    const b = batch.data;
    if (!b) return;
    setName((n) => n || `${b.name} test`.slice(0, 200));
    setCreatives(
      b.variants.flatMap((v) => (v.status === 'done' && v.asset ? [{ asset: v.asset, headline: '', primaryText: '', variantLabel: v.label.slice(0, 20) }] : [])).slice(0, 10),
    );
  });
  useOnChange([single.data], () => {
    if (single.data) setCreatives((c) => (c.length ? c : [{ asset: single.data, headline: '', primaryText: '', variantLabel: 'A' }]));
  });

  const account = accounts.find((a) => a.id === accountId);
  const platform = account?.platform;
  const create = useMutation({
    mutationFn: () => {
      const daily = Number(budget);
      if (!Number.isFinite(daily) || daily <= 0) throw new Error('Set a daily budget above zero.');
      const url = landingUrl.trim();
      if (!/^https?:\/\/\S+\.\S+/i.test(url)) throw new Error('The landing page must be a full link, starting with https://');
      if (ages[0] > ages[1]) throw new Error('The minimum age must be below the maximum.');
      return api.post<CampaignView>('/campaigns', {
        adAccountId: accountId,
        name: name.trim() || 'Campaign',
        objective,
        dailyBudget: daily,
        countries,
        ageMin: ages[0],
        ageMax: ages[1],
        landingUrl: url,
        cta,
        ...(batchId && batch.data ? { variantBatchId: batchId } : {}),
        ads: creatives.map((c) => ({ assetId: c.asset.id, headline: (c.headline || headline).slice(0, 255), primaryText: (c.primaryText || primaryText).slice(0, 2200), variantLabel: c.variantLabel.slice(0, 20) || undefined })),
        launch: mode === 'launch',
      });
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(mode === 'launch' ? 'Creating the campaign, paused' : 'Draft saved');
      router.push(`/ads/${c.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (setup.isLoading) return <Skeleton className="h-[60vh] rounded-2xl" />;
  if (!accounts.length)
    return <EmptyState title="Connect an ad account first" description="Sign in with Meta or TikTok in Settings to launch campaigns." action={<Button asChild><Link href="/settings/ad-accounts">Connect</Link></Button>} />;

  const tiktokNeedsVideo = platform === 'tiktok' && creatives.some((c) => c.asset.type !== 'video');
  const metaNoPage = platform === 'meta' && !account?.pageId;
  const missing = [
    ...(!creatives.length ? ['Add at least one video or photo.'] : []),
    ...(!countries.length ? ['Pick at least one country.'] : []),
    ...(!landingUrl.trim() ? ['Add the landing page link.'] : []),
    ...(tiktokNeedsVideo ? ['TikTok ads need videos, not photos.'] : []),
    ...(metaNoPage ? ['Choose the Facebook Page these ads run as.'] : []),
  ];
  const cur = account?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Campaign</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ad account">
            <Select
              value={accountId}
              onValueChange={setAccountId}
              options={accounts.map((a) => ({ value: a.id, label: <span className="flex items-center gap-2"><PlatformIcon platform={a.platform} className="size-4" /> {a.name ?? a.externalId}</span>, hint: [a.currency, a.timezone].filter(Boolean).join(' · ') }))}
            />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Spring launch · UGC hooks" />
          </Field>
          <Field label="Goal">
            <Select value={objective} onValueChange={(v) => setObjective(v as typeof objective)} options={AD_OBJECTIVES.map((o) => ({ value: o, label: OBJECTIVE_LABEL[o] }))} />
          </Field>
          <Field label={`Daily budget (${cur})`} hint={Number(budget) > 0 ? `Up to ${money(Number(budget) * 30, cur, 0)} a month once switched on.` : undefined}>
            <Input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" />
          </Field>
        </div>
        {metaNoPage && (
          <Notice tone="warning" title="No Facebook Page chosen" action={<Button size="sm" variant="outline" asChild><Link href="/settings/ad-accounts">Choose</Link></Button>}>
            Meta ads run as a Page, optionally with its Instagram account.
          </Notice>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Audience</h2>
        <Field label="Countries" hint="2-letter codes, e.g. US, GB, DE. Press Enter after each.">
          <ChipList items={countries} onChange={(v) => setCountries([...new Set(v.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 25))} max={25} maxLength={2} placeholder="US" />
        </Field>
        <Field label="Age" aside={<span className="font-medium text-foreground tabular-nums">{ages[0]}–{ages[1] === 65 ? '65+' : ages[1]}</span>}>
          <Slider min={18} max={65} step={1} value={ages} onValueChange={(v) => setAges([v[0] ?? 18, v[1] ?? 65])} />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Ads</h2>
          <Button size="xs" variant="outline" disabled={creatives.length >= 10} onClick={() => setPicking(true)}>
            <ImagePlus className="size-3.5" /> Add videos
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Landing page">
            <Input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://yourstore.com/products/…" inputMode="url" />
          </Field>
          <Field label="Button">
            <Select value={cta} onValueChange={(v) => setCta(v as typeof cta)} options={AD_CTAS.map((c) => ({ value: c, label: ctaLabel(c) }))} />
          </Field>
        </div>
        <Field label="Headline" hint="Used for every ad unless an ad has its own.">
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={255} placeholder="Ice-cold for 24 hours" />
        </Field>
        <Field label="Primary text">
          <Textarea rows={3} value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} maxLength={2200} placeholder="The bottle that keeps up with your day…" />
        </Field>
        {batch.isLoading && <Skeleton className="h-24 rounded-xl" />}
        {creatives.length ? (
          <div className="space-y-2">
            {creatives.map((c, i) => (
              <div key={`${c.asset.id}-${i}`} className="flex gap-3 rounded-xl border p-3">
                <AssetThumb asset={c.asset} className="aspect-[9/16] w-16 shrink-0 rounded-lg" />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                  <Input value={c.variantLabel} onChange={(e) => setCreatives((all) => all.map((x, j) => (j === i ? { ...x, variantLabel: e.target.value.slice(0, 20) } : x)))} placeholder={`Ad ${i + 1}`} aria-label="Label" className="h-8" />
                  <Input value={c.headline} onChange={(e) => setCreatives((all) => all.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)))} maxLength={255} placeholder={headline || 'Own headline (optional)'} className="h-8" aria-label="Headline" />
                  <Textarea rows={2} value={c.primaryText} onChange={(e) => setCreatives((all) => all.map((x, j) => (j === i ? { ...x, primaryText: e.target.value } : x)))} maxLength={2200} placeholder={primaryText || 'Own primary text (optional)'} className="sm:col-span-2" aria-label="Primary text" />
                  {platform === 'tiktok' && c.asset.type !== 'video' && <p className="text-xs text-destructive sm:col-span-2">TikTok needs a video here.</p>}
                </div>
                <button type="button" aria-label="Remove" className="self-start text-muted-foreground hover:text-foreground" onClick={() => setCreatives((all) => all.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground transition hover:border-primary/60 hover:bg-primary/5">
            <ImagePlus className="size-5" /> Add up to 10 videos or photos. Each becomes its own ad, so the platform can find the winner.
          </button>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3 rounded-xl bg-success/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <span>Everything is created paused. Nothing spends until you switch an ad on and confirm. Media with unlicensed music is refused.</span>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'launch', label: `Create on ${platform === 'tiktok' ? 'TikTok' : 'Meta'} (paused)` }, { value: 'draft', label: 'Save as draft' }]} />
        {missing.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {missing.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        )}
        <Button variant="brand" size="lg" className={cn('w-full')} loading={create.isPending} disabled={missing.length > 0} onClick={() => create.mutate()}>
          {mode === 'launch' ? <Rocket className="size-4" /> : <Save className="size-4" />} {mode === 'launch' ? 'Create campaign' : 'Save draft'}
        </Button>
      </section>

      <AssetPicker
        open={picking}
        onOpenChange={setPicking}
        types={platform === 'tiktok' ? ['video'] : ['video', 'image']}
        multiple
        max={10 - creatives.length}
        title="Ad videos"
        onPick={(list) => setCreatives((all) => [...all, ...list.map((a, i) => ({ asset: a, headline: '', primaryText: '', variantLabel: String.fromCharCode(65 + all.length + i) }))].slice(0, 10))}
      />
    </div>
  );
}
