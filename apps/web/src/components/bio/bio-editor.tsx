'use client';

import { bioSlugSchema, bioUrlSchema, MAX_BIO_LINKS, MAX_BIO_PAGES, type BioTheme } from '@adforge/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AssetSlot } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton, Stat } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView, BioPageView, BioStats } from '@/lib/types';
import { cn, copyText, formatNumber, formatPercent } from '@/lib/utils';
import { BioPage } from './bio-page';

const SWATCHES = ['#7c3aed', '#2563eb', '#0d9488', '#16a34a', '#ea580c', '#e11d48', '#0a0a0a', '#facc15'];
const DEFAULT_THEME: BioTheme = { mode: 'light', accent: '#7c3aed', buttons: 'rounded' };

interface DraftLink {
  key: string;
  id?: string;
  label: string;
  url: string;
  enabled: boolean;
}

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

export function BioView() {
  const { data, isLoading, error } = useQuery({ queryKey: ['bio'], queryFn: () => api.get<{ items: BioPageView[] }>('/bio') });
  const [selected, setSelected] = useState<string | null>(null);
  const pages = data?.items ?? [];
  const creating = selected === 'new';
  const current = creating ? null : (pages.find((p) => p.id === selected) ?? pages[0] ?? null);

  if (isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (error) return <Notice tone="error" title="Could not load your link pages">{errorMessage(error)}</Notice>;
  if (!pages.length && !creating) {
    return (
      <EmptyState
        icon={<Link2 className="size-6" />}
        title="No link page yet"
        description="Make one page for the link in your Instagram, TikTok or YouTube bio. Every button press is counted, so you can see which links people use."
        action={
          <Button onClick={() => setSelected('new')}>
            <Plus /> Create a page
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      {(pages.length > 1 || creating || pages.length < MAX_BIO_PAGES) && (
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Link pages">
          {pages.map((p) => (
            <Button key={p.id} role="tab" aria-selected={p.id === current?.id} size="sm" variant={p.id === current?.id ? 'secondary' : 'ghost'} onClick={() => setSelected(p.id)}>
              /b/{p.slug}
              {!p.published && <span className="text-xs text-muted-foreground">(draft)</span>}
            </Button>
          ))}
          {creating && (
            <Button role="tab" aria-selected size="sm" variant="secondary">
              New page
            </Button>
          )}
          {!creating && pages.length < MAX_BIO_PAGES && (
            <Button size="sm" variant="outline" onClick={() => setSelected('new')}>
              <Plus /> New page
            </Button>
          )}
        </div>
      )}
      <BioEditor key={current?.id ?? 'new'} page={current} onSaved={(p) => setSelected(p.id)} onDeleted={() => setSelected(null)} onCancel={creating ? () => setSelected(null) : undefined} />
    </div>
  );
}

function BioEditor({ page, onSaved, onDeleted, onCancel }: { page: BioPageView | null; onSaved: (p: BioPageView) => void; onDeleted: () => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [bio, setBio] = useState(page?.bio ?? '');
  const [avatar, setAvatar] = useState<AssetView | null | undefined>(undefined);
  const [theme, setTheme] = useState<BioTheme>(page?.theme ?? DEFAULT_THEME);
  const [published, setPublished] = useState(page?.published ?? true);
  const [links, setLinks] = useState<DraftLink[]>(() =>
    page?.links.length ? page.links.map((l) => ({ key: l.id, id: l.id, label: l.label, url: l.url, enabled: l.enabled })) : [{ key: crypto.randomUUID(), label: '', url: '', enabled: true }],
  );

  const savedAvatar = useQuery({
    queryKey: ['asset', page?.avatarAssetId],
    queryFn: () => api.get<AssetView>(`/assets/${page!.avatarAssetId}`),
    enabled: !!page?.avatarAssetId && avatar === undefined,
  });
  const stats = useQuery({ queryKey: ['bio', page?.id, 'stats'], queryFn: () => api.get<{ stats: BioStats }>(`/bio/${page!.id}`), enabled: !!page });

  const slugCheck = bioSlugSchema.safeParse(slug);
  const linkErrors = links.map((l) => (!l.label.trim() && !l.url.trim() ? null : !l.label.trim() ? 'Add a label.' : bioUrlSchema.safeParse(l.url).success ? null : 'Enter a web address such as https://example.com.'));
  const filled = links.filter((l) => l.label.trim() || l.url.trim());
  const valid = slugCheck.success && linkErrors.every((e) => !e);
  const avatarView = avatar === undefined ? (savedAvatar.data ?? null) : avatar;
  const avatarUrl = avatar === undefined ? (page?.avatarUrl ?? null) : (avatar?.thumbnailUrl ?? null);
  const publicUrl = `${origin()}/b/${slugCheck.success ? slugCheck.data : slug || 'yourname'}`;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug,
        title,
        bio,
        avatarAssetId: avatar === undefined ? (page?.avatarAssetId ?? null) : (avatar?.id ?? null),
        theme,
        published,
        links: filled.map((l) => ({ ...(l.id ? { id: l.id } : {}), label: l.label, url: l.url, enabled: l.enabled })),
      };
      return page ? api.put<BioPageView>(`/bio/${page.id}`, body) : api.post<BioPageView>('/bio', body);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['bio'] });
      toast.success(p.published ? 'Saved. Your page is live.' : 'Saved as a draft.');
      onSaved(p);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/bio/${page!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bio'] });
      toast.success('Page deleted.');
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const move = (i: number, by: number) =>
    setLinks((all) => {
      const next = [...all];
      const [l] = next.splice(i, 1);
      next.splice(i + by, 0, l!);
      return next;
    });
  const update = (i: number, patch: Partial<DraftLink>) => setLinks((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const days = stats.data?.stats.days ?? [];
  const views30 = days.reduce((s, d) => s + d.views, 0);
  const clicks30 = days.reduce((s, d) => s + d.clicks, 0);
  const linkClicks30 = stats.data?.stats.linkClicks ?? {};

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
          <Field label="Address" error={slug && !slugCheck.success ? slugCheck.error.issues[0]?.message : undefined} hint={slugCheck.success ? publicUrl : undefined}>
            <div className="flex items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 pl-3 text-sm text-muted-foreground">/b/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                maxLength={40}
                placeholder="yourbrand"
                aria-label="Page address"
                className="h-9 min-w-0 flex-1 bg-transparent pr-3 pl-0.5 text-sm outline-none"
              />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="bio-name">
              <Input id="bio-name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Everyday Bottle Co." />
            </Field>
            <AssetSlot label="Profile picture" types={['image']} value={avatarView} onChange={setAvatar} hint="A square photo works best." />
          </div>
          <Field label="Bio" htmlFor="bio-text" aside={<span className="tabular-nums">{bio.length}/300</span>}>
            <Textarea id="bio-text" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} placeholder="Bottles that keep drinks cold for 24 hours." />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Links</h2>
            <Button size="xs" variant="outline" disabled={links.length >= MAX_BIO_LINKS} onClick={() => setLinks((all) => [...all, { key: crypto.randomUUID(), label: '', url: '', enabled: true }])}>
              <Plus /> Add link
            </Button>
          </div>
          <ol className="space-y-2">
            {links.map((l, i) => {
              const clicks = page?.links.find((x) => x.id === l.id)?.clicks;
              return (
                <li key={l.key} className={cn('rounded-xl border p-3', !l.enabled && 'opacity-60')}>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <Input value={l.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={80} placeholder="Shop the sale" aria-label={`Link ${i + 1} label`} />
                    <Input value={l.url} onChange={(e) => update(i, { url: e.target.value })} maxLength={2000} placeholder="example.com/sale" inputMode="url" aria-label={`Link ${i + 1} address`} aria-invalid={!!linkErrors[i]} />
                  </div>
                  {linkErrors[i] && <p className="mt-1.5 text-xs text-destructive">{linkErrors[i]}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={l.enabled} onCheckedChange={(v) => update(i, { enabled: v })} aria-label={`Show link ${i + 1}`} /> Shown
                    </label>
                    {clicks != null && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatNumber(clicks)} clicks{l.id && linkClicks30[l.id] != null ? `, ${formatNumber(linkClicks30[l.id]!)} in 30 days` : ''}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === links.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Remove link" onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {!links.length && <p className="text-sm text-muted-foreground">No links. Add one to give visitors somewhere to go.</p>}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Look</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Background">
              <Segmented
                value={theme.mode}
                onChange={(mode) => setTheme((t) => ({ ...t, mode }))}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'brand', label: 'Brand color' },
                ]}
              />
            </Field>
            <Field label="Buttons">
              <Segmented
                value={theme.buttons}
                onChange={(buttons) => setTheme((t) => ({ ...t, buttons }))}
                options={[
                  { value: 'rounded', label: 'Rounded' },
                  { value: 'pill', label: 'Pill' },
                  { value: 'square', label: 'Square' },
                ]}
              />
            </Field>
          </div>
          <Field label="Brand color" hint="Text color is picked automatically so it stays readable.">
            <ColorInput value={theme.accent} onChange={(accent) => /^#[0-9a-f]{6}$/i.test(accent) && setTheme((t) => ({ ...t, accent }))} swatches={SWATCHES} />
          </Field>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={published} onCheckedChange={setPublished} /> {published ? 'Public' : 'Draft (only you can see it here)'}
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {page && (
              <Confirm title="Delete this page?" description={`/b/${page.slug} stops working and its click counts are deleted.`} confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
                <Button variant="ghost" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              </Confirm>
            )}
            <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              {page ? 'Save' : 'Create page'}
            </Button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {page && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{`${origin()}/b/${page.slug}`}</span>
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                const ok = await copyText(`${origin()}/b/${page.slug}`);
                if (ok) toast.success('Link copied.');
                else toast.error('Could not copy the link.');
              }}
            >
              <Copy /> Copy
            </Button>
            {page.published && (
              <Button size="xs" variant="outline" asChild>
                <a href={`/b/${page.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open
                </a>
              </Button>
            )}
          </div>
        )}
        <div className="overflow-hidden rounded-[2rem] border-8 border-foreground/10 shadow-sm">
          <div className="h-[560px] overflow-y-auto" aria-label="Preview">
            <BioPage preview page={{ slug: slugCheck.success ? slugCheck.data : slug || 'yourname', title, bio, avatarUrl, theme, links: filled.map((l) => ({ id: l.key, label: l.label || 'Untitled link', url: bioUrlSchema.safeParse(l.url).data ?? '#', enabled: l.enabled, clicks: 0 })) }} className="min-h-full" />
          </div>
        </div>
        {page && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Visits, 30 days" value={stats.isLoading ? '…' : formatNumber(views30)} />
            <Stat label="Clicks, 30 days" value={stats.isLoading ? '…' : formatNumber(clicks30)} />
            <Stat label="Click rate" value={stats.isLoading ? '…' : views30 ? formatPercent(clicks30 / views30) : '–'} />
          </div>
        )}
        {page && <p className="text-xs text-muted-foreground">Visits count once per browser session. Crawlers and link previews are left out.</p>}
      </aside>
    </div>
  );
}
