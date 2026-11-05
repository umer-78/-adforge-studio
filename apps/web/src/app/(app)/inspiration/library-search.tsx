'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useCompetitors } from '@/components/growth/use-growth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ApiError, api, errorMessage } from '@/lib/api-client';
import type { InspirationAdView, LibraryAdView } from '@/lib/types';
import { formatNumber, qs } from '@/lib/utils';

interface Search {
  q: string;
  pageId: string;
  countries: string;
  active: boolean;
}

/** Live search of Meta's Ad Library. Results can be saved to the swipe file one by one or all at once. */
export function LibrarySearch({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const competitors = useCompetitors();
  const [form, setForm] = useState<Search>({ q: '', pageId: '', countries: 'DE,FR,IE', active: true });
  const [search, setSearch] = useState<Search | null>(null);
  const [competitorId, setCompetitorId] = useState('none');
  const results = useQuery({
    queryKey: ['ad-library', search],
    queryFn: () =>
      api.get<{ items: LibraryAdView[] }>(
        `/inspiration/library${qs({ q: search!.pageId ? undefined : search!.q, pageId: search!.pageId || undefined, countries: search!.countries, active: search!.active ? '1' : '0' })}`,
      ),
    enabled: !!search,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (ads: LibraryAdView[]) =>
      api.post<{ items: InspirationAdView[] }>('/inspiration/library', {
        ads: ads.map(({ savedId: _, ...a }) => a),
        competitorId: competitorId === 'none' ? null : competitorId,
      }),
    onSuccess: (r, ads) => {
      const byExternal = new Map(r.items.flatMap((it) => (it.externalId ? [[it.externalId, it.id] as const] : [])));
      qc.setQueryData<{ items: LibraryAdView[] }>(['ad-library', search], (old) => (old ? { items: old.items.map((a) => (byExternal.has(a.externalId) ? { ...a, savedId: byExternal.get(a.externalId) ?? a.savedId } : a)) } : old));
      qc.invalidateQueries({ queryKey: ['inspiration'] });
      toast.success(ads.length === 1 ? 'Saved to your swipe file' : `${ads.length} ads saved`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const countries = form.countries.toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(countries)) return toast.error('Countries are 2-letter codes separated by commas, like DE,FR,IE.');
    if (!form.q.trim() && !form.pageId.trim()) return toast.error('Search for a brand or keyword, or enter a Facebook Page id.');
    setSearch({ ...form, q: form.q.trim(), pageId: form.pageId.trim(), countries });
  };
  const unsaved = results.data?.items.filter((a) => !a.savedId) ?? [];
  const notConfigured = results.error instanceof ApiError && results.error.code === 'ad_library_not_configured';

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-4">
        <label className="grid min-w-56 flex-1 gap-1 text-xs font-medium">
          Brand or keyword
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={form.q} onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))} maxLength={100} placeholder="hydration bottle" className="pl-9" />
          </div>
        </label>
        <label className="grid w-44 gap-1 text-xs font-medium">
          or Facebook Page id
          <Input value={form.pageId} onChange={(e) => setForm((f) => ({ ...f, pageId: e.target.value.replace(/\D/g, '') }))} maxLength={40} placeholder="1234567890" inputMode="numeric" />
        </label>
        <label className="grid w-36 gap-1 text-xs font-medium">
          Countries
          <Input value={form.countries} onChange={(e) => setForm((f) => ({ ...f, countries: e.target.value }))} maxLength={90} />
        </label>
        <label className="flex h-9 items-center gap-2 text-xs font-medium">
          <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} /> Running only
        </label>
        <Button type="submit" loading={results.isFetching}>
          Search
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Meta lists every ad it delivers in the EU, so EU countries give the fullest results. Searches use your connected Meta ad account.</p>

      {!search ? (
        <EmptyState icon={<Search />} title="Search Meta's Ad Library" description="Find what a competitor runs right now, how long each ad has run and where. Save the ones worth studying." />
      ) : results.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : results.isError ? (
        <Notice
          tone={notConfigured ? 'info' : 'error'}
          title={notConfigured ? 'Connect Meta to search' : 'The search failed'}
          action={
            notConfigured ? (
              <Button size="sm" asChild>
                <Link href="/settings/ad-accounts">Connect Meta</Link>
              </Button>
            ) : undefined
          }
        >
          {errorMessage(results.error)}
        </Notice>
      ) : !results.data?.items.length ? (
        <EmptyState title="No ads found" description="Try another keyword, the brand's Page id, or other countries." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{results.data.items.length} ads</span>
            <div className="ml-auto flex items-center gap-2">
              <Select size="sm" className="w-48" value={competitorId} onValueChange={setCompetitorId} options={[{ value: 'none', label: 'No competitor' }, ...(competitors.data ?? []).map((c) => ({ value: c.id, label: `Tag: ${c.name}` }))]} />
              <Button size="sm" variant="outline" disabled={!unsaved.length} loading={save.isPending && save.variables?.length !== 1} onClick={() => save.mutate(unsaved.slice(0, 50))}>
                <Bookmark className="size-4" /> Save all {unsaved.length ? `(${Math.min(50, unsaved.length)})` : ''}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.data.items.map((ad) => (
              <LibraryCard key={ad.externalId} ad={ad} saving={save.isPending && save.variables?.length === 1 && save.variables[0]?.externalId === ad.externalId} onSave={() => save.mutate([ad])} onOpen={() => ad.savedId && onOpen(ad.savedId)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LibraryCard({ ad, saving, onSave, onOpen }: { ad: LibraryAdView; saving: boolean; onSave: () => void; onOpen: () => void }) {
  const long = (ad.daysRunning ?? 0) >= 30;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{ad.brand}</div>
          <div className="text-xs text-muted-foreground">
            {ad.startedAt ? `Since ${new Date(ad.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Start unknown'}
            {!ad.active && ad.stoppedAt ? ` · stopped ${new Date(ad.stoppedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
          </div>
        </div>
        {ad.daysRunning != null && <Badge variant={long ? 'brand' : 'outline'}>{ad.daysRunning}d</Badge>}
      </div>
      {ad.headline && <div className="text-sm font-medium">{ad.headline}</div>}
      {ad.body && <p className="line-clamp-4 text-sm text-muted-foreground">{ad.body}</p>}
      <div className="flex flex-wrap gap-1">
        {ad.active && <Badge variant="success">Running</Badge>}
        {ad.platforms.map((p) => (
          <Badge key={p} variant="outline" className="capitalize">
            {p.replace(/_/g, ' ').toLowerCase()}
          </Badge>
        ))}
        {ad.euReach != null && <Badge variant="secondary">EU reach {formatNumber(ad.euReach)}</Badge>}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t pt-3">
        <Button variant="ghost" size="xs" asChild>
          <a href={ad.libraryUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> Watch in Ad Library
          </a>
        </Button>
        {ad.savedId ? (
          <Button variant="secondary" size="xs" className="ml-auto" onClick={onOpen}>
            <BookmarkCheck className="size-3.5" /> Saved
          </Button>
        ) : (
          <Button size="xs" className="ml-auto" loading={saving} onClick={onSave}>
            <Bookmark className="size-3.5" /> Save
          </Button>
        )}
      </div>
    </div>
  );
}
