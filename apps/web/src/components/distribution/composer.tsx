'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FlaskConical, Plus, Send, Sparkles, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { creditsCaption, mergeCredits, missingCredits, PLATFORM_SPECS } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { PlatformIcon, PLATFORM_META } from '@/components/app/platform-icon';
import { ChipList } from '@/components/growth/shared';
import { LlmPrice } from '@/components/scripts/llm-price';
import { FeedPreviewButton } from '@/components/preview/feed-preview';
import { AdChecksPanel } from './ad-checks-panel';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { useMe } from '@/lib/hooks/use-me';
import { useNow } from '@/lib/hooks/use-now';
import type { AssetView, PlatformCheckView, PostView, SocialAccountView, SocialPlatformId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toLocalInput } from './post-sheet';
import { useAccountOptions, useSocialAccounts } from './use-distribution';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Options = Record<string, unknown>;

interface Variant {
  asset: AssetView | null;
  /** Own caption for this variant; null uses the shared caption. */
  caption: string | null;
}

interface SocialCopy {
  title: string;
  caption: string;
  hashtags: string[];
  altText: string;
  platformCaptions: { platform: SocialPlatformId; caption: string }[];
}

const TIKTOK_PRIVACY: Record<string, string> = { PUBLIC_TO_EVERYONE: 'Everyone', MUTUAL_FOLLOW_FRIENDS: 'Friends', FOLLOWER_OF_CREATOR: 'Followers', SELF_ONLY: 'Only me' };

/** Composer for one post, or an A/B test of up to four variants sent to the same accounts. */
export function Composer({ initialAssetIds, initialAbGroup, onPublished }: { initialAssetIds: string[]; initialAbGroup: string | null; onPublished: () => void }) {
  const qc = useQueryClient();
  const me = useMe();
  const social = useSocialAccounts();
  const [variants, setVariants] = useState<Variant[]>([{ asset: null, caption: null }]);
  const [abGroup, setAbGroup] = useState<string | null>(initialAbGroup);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Options>>({});
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(toLocalInput(null));
  const [aiLabel, setAiLabel] = useState<boolean | null>(null);
  const [rights, setRights] = useState(false);
  // Free media that asks for a credit: remind until every credit line is in the caption.
  const credits = mergeCredits(...variants.map((v) => v.asset?.credits ?? []));
  const missingCredit = missingCredits(credits, [caption, ...variants.map((v) => v.caption ?? '')].join('\n'));

  // Prefill from ?asset= / ?assets= (variants of an A/B test).
  const preload = useQueries({ queries: initialAssetIds.slice(0, 4).map((id) => ({ queryKey: ['asset', id, 'view'], queryFn: () => api.get<{ asset: AssetView }>(`/assets/${id}`).then((r) => r.asset), staleTime: 60_000 })) });
  const preloaded = preload.every((q) => q.isSuccess) ? preload.map((q) => q.data!) : null;
  const preloadKey = preloaded?.map((a) => a.id).join(',') ?? '';
  const [loadedKey, setLoadedKey] = useState('');
  if (preloaded?.length && preloadKey !== loadedKey) {
    setLoadedKey(preloadKey);
    setVariants(preloaded.map((a) => ({ asset: a, caption: null })));
  }
  const now = useNow();

  const accounts = useMemo(() => (social.data?.accounts ?? []).filter((a) => a.status === 'active'), [social.data]);
  const selected = accounts.filter((a) => accountIds.includes(a.id));
  const platforms = [...new Set(selected.map((a) => a.platform))];
  const abMode = variants.length > 1;
  const anyAi = variants.some((v) => v.asset?.isAiGenerated);
  const label = aiLabel ?? (anyAi || !!me.data?.workspace.aiLabelDefault);
  const needsTitle = platforms.some((p) => PLATFORM_SPECS[p].requiresTitle);

  const targets = selected.map((a) => ({ socialAccountId: a.id, captionOverride: overrides[a.id]?.trim() ? overrides[a.id] : null }));
  const checkKey = useDebounced(JSON.stringify({ v: variants.map((v) => [v.asset?.id, v.caption]), title, caption, hashtags, targets }), 500);
  const checks = useQuery({
    queryKey: ['post-check', checkKey],
    queryFn: () =>
      Promise.all(
        variants.map((v) =>
          v.asset
            ? api.post<{ checks: PlatformCheckView[]; license: string | null; ready: boolean }>('/posts/check', { assetId: v.asset.id, title: title || null, caption: v.caption ?? caption, hashtags, targets })
            : Promise.resolve(null),
        ),
      ),
    enabled: targets.length > 0 && variants.some((v) => v.asset),
    retry: false,
  });

  const optionProblems = selected.flatMap((a) => {
    const o = options[a.id] ?? {};
    if (a.platform === 'tiktok' && a.provider === 'native') {
      if (typeof o.privacyLevel !== 'string') return [`Choose who can see the TikTok post (${a.handle ?? 'TikTok'}).`];
      if (o.commercial === true && o.yourBrand !== true && o.brandedContent !== true) return ['Say whether the TikTok post promotes your brand, a third party, or both.'];
      if (o.brandedContent === true && o.privacyLevel === 'SELF_ONLY') return ['Branded content on TikTok cannot be private.'];
    }
    if (a.platform === 'pinterest' && a.provider === 'native' && typeof o.boardId !== 'string') return ['Pick a Pinterest board.'];
    return [];
  });
  const blocking = (checks.data ?? []).flatMap((r) => (r ? [...r.checks.flatMap((c) => c.issues.filter((i) => i.level === 'error').map((i) => `${c.label}: ${i.message}`)), ...(r.license ? [r.license] : [])] : []));
  const missing = [
    ...(variants.some((v) => !v.asset) ? [abMode ? 'Pick media for every variant.' : 'Pick a video or photo.'] : []),
    ...(!selected.length ? ['Pick at least one account.'] : []),
    ...(needsTitle && !title.trim() ? ['Add a title (YouTube and Pinterest need one).'] : []),
    ...(when === 'later' && (!at || new Date(at).getTime() < now + 60_000) ? ['Pick a time at least a minute from now.'] : []),
    ...optionProblems,
    ...(!rights ? ['Confirm you have the rights to publish this.'] : []),
  ];

  const writeCopy = useMutation({
    mutationFn: () => api.post<SocialCopy>('/posts/copy', { assetId: variants[0]!.asset!.id, platforms: platforms.length ? platforms : ['tiktok', 'instagram'] }),
    onSuccess: (c) => {
      setTitle(c.title.slice(0, 200));
      setCaption(c.caption.slice(0, 5000));
      setHashtags(c.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 30));
      const byPlatform = new Map(c.platformCaptions.map((p) => [p.platform, p.caption]));
      setOverrides((o) => {
        const next = { ...o };
        for (const a of selected) {
          const pc = byPlatform.get(a.platform);
          if (pc && pc.trim() !== c.caption.trim()) next[a.id] = pc.slice(0, 5000);
        }
        return next;
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const group = abMode ? (abGroup ?? crypto.randomUUID()) : null;
      const scheduledAt = when === 'later' ? new Date(at).toISOString() : null;
      const out: PostView[] = [];
      for (const [i, v] of variants.entries()) {
        out.push(
          await api.post<PostView>('/posts', {
            assetId: v.asset!.id,
            title: title.trim() || null,
            caption: v.caption ?? caption,
            hashtags,
            targets: selected.map((a) => {
              const o = { ...(options[a.id] ?? {}) };
              delete o.commercial;
              return { socialAccountId: a.id, captionOverride: overrides[a.id]?.trim() ? overrides[a.id] : null, options: o };
            }),
            scheduledAt,
            aiLabel: label,
            rightsAcknowledged: true,
            abGroup: group,
            abVariant: group ? LETTERS[i] : null,
          }),
        );
      }
      return out;
    },
    onSuccess: (posts) => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      toast.success(when === 'later' ? `Scheduled ${posts.length > 1 ? `${posts.length} variants` : 'the post'}` : `Publishing ${posts.length > 1 ? `${posts.length} variants` : 'now'}…`);
      setVariants([{ asset: null, caption: null }]);
      setAbGroup(null);
      setTitle('');
      setCaption('');
      setHashtags([]);
      setOverrides({});
      setRights(false);
      onPublished();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggleAccount = (a: SocialAccountView) => setAccountIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : ids.length >= 14 ? ids : [...ids, a.id]));
  const captionLimit = Math.min(...(platforms.length ? platforms.map((p) => PLATFORM_SPECS[p].captionLimit) : [5000]));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{abMode ? `A/B test · ${variants.length} variants` : 'Media'}</h2>
            {variants.length < 4 && (
              <Button size="xs" variant="outline" onClick={() => setVariants((v) => [...v, { asset: null, caption: null }])}>
                <FlaskConical className="size-3.5" /> {abMode ? 'Add variant' : 'Make it an A/B test'}
              </Button>
            )}
          </div>
          <div className={cn('grid gap-3', abMode && 'sm:grid-cols-2')}>
            {variants.map((v, i) => (
              <div key={i} className={cn('space-y-2', abMode && 'rounded-xl border p-3')}>
                {abMode && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Variant {LETTERS[i]}</span>
                    <button type="button" aria-label={`Remove variant ${LETTERS[i]}`} className="text-muted-foreground hover:text-foreground" onClick={() => setVariants((all) => all.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </button>
                  </div>
                )}
                <AssetSlot label="Video or photo" types={['video', 'image']} value={v.asset} onChange={(a) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, asset: a } : x)))} required />
                {v.asset && (
                  <FeedPreviewButton
                    asset={v.asset}
                    size="xs"
                    label="Preview in feed"
                    defaults={{
                      caption: [v.caption ?? caption, hashtags.map((h) => `#${h}`).join(' ')].filter((x) => x.trim()).join(' '),
                      handle: selected[0]?.handle ?? selected[0]?.displayName ?? null,
                      avatarUrl: selected[0]?.avatarUrl ?? null,
                      platform: selected[0]?.platform ?? null,
                    }}
                  />
                )}
                {abMode && (
                  <Textarea
                    rows={2}
                    value={v.caption ?? ''}
                    onChange={(e) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, caption: e.target.value || null } : x)))}
                    placeholder="Own caption (optional; otherwise the shared one)"
                    maxLength={5000}
                  />
                )}
              </div>
            ))}
          </div>
          {abMode && <p className="text-xs text-muted-foreground">Each variant goes to the same accounts at the same time. Analytics compares their engagement and names a winner once there is enough data.</p>}
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Accounts</h2>
            <Link href="/settings/accounts" className="text-xs text-muted-foreground hover:text-primary">
              Manage connections
            </Link>
          </div>
          {social.isLoading ? null : !accounts.length ? (
            <Notice title="No accounts connected" action={<Button size="sm" asChild><Link href="/settings/accounts">Connect</Link></Button>}>
              Connect YouTube, TikTok, Instagram, Facebook, LinkedIn, X or Pinterest to publish.
            </Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={accountIds.includes(a.id)}
                  onClick={() => toggleAccount(a)}
                  className={cn('flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition', accountIds.includes(a.id) ? 'border-primary bg-primary/10' : 'hover:border-input hover:bg-accent/40')}
                >
                  <span className="relative">
                    <Avatar src={a.avatarUrl} name={a.displayName ?? a.handle} className="size-6" />
                    <PlatformIcon platform={a.platform} className="absolute -right-1 -bottom-1 size-3.5" />
                  </span>
                  <span className="max-w-40 truncate">{a.displayName ?? a.handle ?? PLATFORM_META[a.platform]?.label}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Copy</h2>
            <div className="flex items-center gap-2">
              <LlmPrice task="socialCopy" />
              <Button size="xs" variant="outline" loading={writeCopy.isPending} disabled={!variants[0]?.asset} onClick={() => writeCopy.mutate()}>
                <Sparkles className="size-3.5" /> Write with AI
              </Button>
            </div>
          </div>
          <Field label="Title" hint={needsTitle ? 'Required for YouTube and Pinterest.' : 'Used where the platform shows one.'}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Caption" aside={<span className={cn('tabular-nums', caption.length > captionLimit && 'text-destructive')}>{caption.length}/{captionLimit}</span>}>
            <Textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={5000} />
          </Field>
          {missingCredit.length > 0 && (
            <Notice
              tone="warning"
              title={missingCredit.length === 1 ? 'This media asks for a credit' : `This media asks for ${missingCredit.length} credits`}
              action={
                <Button size="xs" variant="outline" onClick={() => setCaption((c) => `${c.trimEnd()}${c.trim() ? '\n\n' : ''}${creditsCaption(missingCredit)}`.slice(0, 5000))}>
                  Add to caption
                </Button>
              }
            >
              Its license allows free use when the creator is credited where people see the post:
              <ul className="mt-1 list-disc pl-4 text-xs">
                {missingCredit.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Notice>
          )}
          <Field label="Hashtags" hint="Without the #. Each platform's limit is checked below.">
            <ChipList items={hashtags} onChange={(h) => setHashtags(h.map((x) => x.replace(/^#/, '').replace(/\s+/g, '')))} max={30} maxLength={80} placeholder="skincare" />
          </Field>
        </section>

        {selected.length > 0 && (
          <section className="space-y-3">
            {selected.map((a) => (
              <AccountPanel key={a.id} account={a} options={options[a.id] ?? {}} onOptions={(o) => setOptions((all) => ({ ...all, [a.id]: o }))} override={overrides[a.id] ?? ''} onOverride={(v) => setOverrides((all) => ({ ...all, [a.id]: v }))} sharedCaption={caption} />
            ))}
          </section>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <Field label="When">
            <Segmented value={when} onChange={setWhen} options={[{ value: 'now', label: 'Publish now' }, { value: 'later', label: 'Schedule' }]} />
          </Field>
          {when === 'later' && <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} min={toLocalInput(new Date().toISOString())} aria-label="Publish at" />}
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>
              Label as AI-generated
              <span className="block text-xs text-muted-foreground">{anyAi ? 'This media was made with AI.' : 'Uses each platform’s own AI disclosure where it has one.'}</span>
            </span>
            <Switch checked={label} onCheckedChange={setAiLabel} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
            <span>I own or have licensed everything in this post (footage, music, voices, faces) for this use.</span>
          </label>
          {selected.some((a) => a.platform === 'tiktok') && (
            <p className="text-[11px] text-muted-foreground">
              By posting to TikTok you agree to TikTok’s{' '}
              <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
                Music Usage Confirmation
              </a>
              {selected.some((a) => options[a.id]?.brandedContent === true) && (
                <>
                  {' '}
                  and{' '}
                  <a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">
                    Branded Content Policy
                  </a>
                </>
              )}
              .
            </p>
          )}
        </section>

        <Checks results={checks.data ?? []} loading={checks.isFetching} error={checks.error} letters={abMode} />
        <AdChecksPanel text={[title, caption, ...variants.map((v) => v.caption ?? ''), ...Object.values(overrides), hashtags.map((h) => `#${h}`).join(' ')].join('\n')} assets={variants.map((v) => v.asset)} />

        {missing.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 size-3 shrink-0" /> {m}
              </li>
            ))}
          </ul>
        )}
        <Button variant="brand" size="lg" className="w-full" loading={publish.isPending} disabled={missing.length > 0 || blocking.length > 0 || checks.isFetching} onClick={() => publish.mutate()}>
          <Send className="size-4" /> {when === 'later' ? 'Schedule' : 'Publish'}
          {abMode ? ` ${variants.length} variants` : ''}
        </Button>
      </aside>
    </div>
  );
}

function Checks({ results, loading, error, letters }: { results: ({ checks: PlatformCheckView[]; license: string | null; ready: boolean } | null)[]; loading: boolean; error: unknown; letters: boolean }) {
  if (error) return <Notice tone="error" title="Could not check the post">{errorMessage(error)}</Notice>;
  const rows = results.flatMap((r, i) => (r ? [{ r, i }] : []));
  if (!rows.length) return null;
  return (
    <section className={cn('space-y-3 rounded-2xl border bg-card p-4 transition', loading && 'opacity-60')}>
      <h3 className="text-sm font-semibold">Platform checks</h3>
      {rows.map(({ r, i }) => (
        <div key={i} className="space-y-2">
          {letters && <div className="text-xs font-medium text-muted-foreground">Variant {LETTERS[i]}</div>}
          {r.license && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {r.license}
            </p>
          )}
          {!r.ready && <p className="text-xs text-muted-foreground">The media is still processing; it publishes once ready.</p>}
          {r.checks.map((c) => (
            <div key={c.platform} className="flex items-start gap-2 text-xs">
              <PlatformIcon platform={c.platform} className="mt-0.5 size-4" />
              {c.issues.length ? (
                <ul className="space-y-0.5">
                  {c.issues.map((iss, k) => (
                    <li key={k} className={cn('flex items-start gap-1', iss.level === 'error' ? 'text-destructive' : 'text-warning')}>
                      {iss.level === 'error' ? <CircleAlert className="mt-0.5 size-3 shrink-0" /> : <TriangleAlert className="mt-0.5 size-3 shrink-0" />} {iss.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-success">Ready for {c.label}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function AccountPanel({ account: a, options: o, onOptions, override, onOverride, sharedCaption }: { account: SocialAccountView; options: Options; onOptions: (o: Options) => void; override: string; onOverride: (v: string) => void; sharedCaption: string }) {
  const info = useAccountOptions(a.provider === 'native' ? a.id : null, a.platform);
  const [customOpen, setCustom] = useState(false);
  const custom = customOpen || !!override;
  const set = (k: string, v: unknown) => onOptions({ ...o, [k]: v });
  const t = info.data?.tiktok;
  // Interactions the creator turned off in TikTok stay off for this post too.
  useEffect(() => {
    if (!t) return;
    const forced = { ...(t.commentDisabled ? { disableComment: true } : {}), ...(t.duetDisabled ? { disableDuet: true } : {}), ...(t.stitchDisabled ? { disableStitch: true } : {}) };
    if (Object.entries(forced).some(([k]) => o[k] !== true)) onOptions({ ...o, ...forced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <PlatformIcon platform={a.platform} className="size-5" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.displayName ?? a.handle}</span>
        {a.provider === 'ayrshare' && <span className="text-[11px] text-muted-foreground">via Ayrshare</span>}
      </div>
      {info.isError && <p className="text-xs text-destructive">{errorMessage(info.error)}</p>}

      {a.platform === 'tiktok' && a.provider === 'native' && (
        <div className="space-y-3">
          {t && (
            <p className="text-xs text-muted-foreground">
              Posting as <span className="font-medium text-foreground">{t.nickname || t.username}</span>
              {t.maxDurationS ? ` · videos up to ${Math.floor(t.maxDurationS / 60)} min` : ''}
            </p>
          )}
          <Field label="Who can see this post">
            <Select value={typeof o.privacyLevel === 'string' ? o.privacyLevel : undefined} placeholder="Choose…" onValueChange={(v) => set('privacyLevel', v)} options={(t?.privacyLevels ?? []).map((p) => ({ value: p, label: TIKTOK_PRIVACY[p] ?? p, disabled: p === 'SELF_ONLY' && o.brandedContent === true }))} disabled={!t} />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(
              [
                ['disableComment', 'Comments', t?.commentDisabled],
                ['disableDuet', 'Duet', t?.duetDisabled],
                ['disableStitch', 'Stitch', t?.stitchDisabled],
              ] as const
            ).map(([k, label, off]) => (
              <label key={k} className={cn('flex items-center gap-2', off && 'opacity-50')}>
                <Checkbox checked={!off && o[k] !== true} disabled={!!off} onCheckedChange={(v) => set(k, v !== true)} /> Allow {label}
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Promotional content
              <span className="block text-xs text-muted-foreground">Turn on if this promotes a brand, product or service.</span>
            </span>
            <Switch checked={o.commercial === true} onCheckedChange={(v) => onOptions({ ...o, commercial: v, ...(v ? {} : { yourBrand: false, brandedContent: false }) })} />
          </label>
          {o.commercial === true && (
            <div className="space-y-2 rounded-lg bg-secondary/50 p-3 text-sm">
              <label className="flex items-start gap-2">
                <Checkbox checked={o.yourBrand === true} onCheckedChange={(v) => set('yourBrand', v === true)} className="mt-0.5" />
                <span>
                  Your brand
                  <span className="block text-xs text-muted-foreground">Labeled “Promotional content”.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox checked={o.brandedContent === true} onCheckedChange={(v) => onOptions({ ...o, brandedContent: v === true, ...(v === true && o.privacyLevel === 'SELF_ONLY' ? { privacyLevel: undefined } : {}) })} className="mt-0.5" />
                <span>
                  Branded content
                  <span className="block text-xs text-muted-foreground">For a third party. Labeled “Paid partnership”.</span>
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {a.platform === 'youtube' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Visibility">
            <Select value={typeof o.privacy === 'string' ? o.privacy : 'public'} onValueChange={(v) => set('privacy', v)} options={[{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }]} />
          </Field>
          <label className="flex items-center justify-between gap-3 self-end pb-2 text-sm">
            Made for kids
            <Switch checked={o.madeForKids === true} onCheckedChange={(v) => set('madeForKids', v)} />
          </label>
        </div>
      )}

      {a.platform === 'instagram' && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Also show the reel in the main feed
          <Switch checked={o.shareToFeed !== false} onCheckedChange={(v) => set('shareToFeed', v)} />
        </label>
      )}

      {a.platform === 'facebook' && (
        <Field label="Post as">
          <Select value={typeof o.format === 'string' ? o.format : 'auto'} onValueChange={(v) => set('format', v === 'auto' ? undefined : v)} options={[{ value: 'auto', label: 'Reel when vertical, otherwise video' }, { value: 'reel', label: 'Reel' }, { value: 'video', label: 'Video' }]} />
        </Field>
      )}

      {a.platform === 'pinterest' && a.provider === 'native' && (
        <Field label="Board">
          <Select value={typeof o.boardId === 'string' ? o.boardId : undefined} placeholder={info.isLoading ? 'Loading boards…' : 'Pick a board'} onValueChange={(v) => set('boardId', v)} options={(info.data?.boards ?? []).map((b) => ({ value: b.id, label: b.name, hint: b.privacy === 'SECRET' ? 'Secret' : undefined }))} />
        </Field>
      )}

      {custom ? (
        <Field label="Caption for this account" aside={<button type="button" className="hover:text-foreground" onClick={() => { onOverride(''); setCustom(false); }}>Use shared caption</button>}>
          <Textarea rows={3} value={override} onChange={(e) => onOverride(e.target.value)} maxLength={5000} placeholder={sharedCaption} />
        </Field>
      ) : (
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => { onOverride(sharedCaption); setCustom(true); }}>
          <Plus className="size-3" /> Own caption for {PLATFORM_META[a.platform]?.label ?? 'this account'}
        </button>
      )}
    </div>
  );
}
