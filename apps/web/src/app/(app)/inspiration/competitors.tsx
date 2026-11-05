'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, ExternalLink, Pause, Pencil, Play, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { hostOf } from '@/components/growth/shared';
import { useCompetitors } from '@/components/growth/use-growth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { CompetitorView, JobView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

/** Competitors whose ads are pulled from the Ad Library every day. */
export function CompetitorsPanel({ onShowAds }: { onShowAds: (id: string) => void }) {
  const list = useCompetitors();
  const [editing, setEditing] = useState<CompetitorView | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Each competitor's ads are checked every day. New ads land in your swipe file, stopped ones are marked, and run time keeps counting.</p>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Track a competitor
        </Button>
      </div>
      {list.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !list.data?.length ? (
        <EmptyState icon={<Users />} title="No competitors yet" description="Add a brand with its Facebook Page id. You find the id in the Ad Library page link (view_all_page_id=…) or on the Page's About section." action={<Button onClick={() => setEditing('new')}>Track a competitor</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((c) => (
            <CompetitorCard key={c.id} c={c} onEdit={() => setEditing(c)} onShowAds={() => onShowAds(c.id)} />
          ))}
        </div>
      )}
      <CompetitorDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CompetitorCard({ c, onEdit, onShowAds }: { c: CompetitorView; onEdit: () => void; onShowAds: () => void }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['competitors'] });
  const sync = useMutation({
    mutationFn: () => api.post<JobView>(`/competitors/${c.id}/sync`),
    onSuccess: () => {
      toast.success(`Checking ${c.name}'s ads. New ones appear in your swipe file.`);
      setTimeout(() => {
        refresh();
        qc.invalidateQueries({ queryKey: ['inspiration'] });
      }, 15_000);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({ mutationFn: () => api.patch<CompetitorView>(`/competitors/${c.id}`, { isActive: !c.isActive }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const [removing, setRemoving] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{c.name}</div>
          {c.website && (
            <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
              {hostOf(c.website)} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {c.isActive ? <Badge variant="success">Tracking</Badge> : <Badge variant="outline">Paused</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <button type="button" onClick={onShowAds} className="rounded-lg bg-secondary/60 p-2 transition hover:bg-secondary">
          <div className="text-lg font-semibold tabular-nums">{c.activeAdCount}</div>
          <div className="text-[11px] text-muted-foreground">running now</div>
        </button>
        <button type="button" onClick={onShowAds} className="rounded-lg bg-secondary/60 p-2 transition hover:bg-secondary">
          <div className="text-lg font-semibold tabular-nums">{c.adCount}</div>
          <div className="text-[11px] text-muted-foreground">ads saved</div>
        </button>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>
          {c.metaPageId ? `Page ${c.metaPageId}` : 'No Facebook Page id'}
          {c.tiktokHandle ? ` · @${c.tiktokHandle.replace(/^@/, '')}` : ''} · {c.countries.join(', ')}
        </div>
        <div>{c.lastSyncedAt ? `Checked ${timeAgo(c.lastSyncedAt)}` : 'Not checked yet'}</div>
        {c.lastError && (
          <p className="flex items-start gap-1 text-destructive">
            <CircleAlert className="mt-0.5 size-3 shrink-0" /> {c.lastError}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-3">
        <Button size="xs" variant="outline" loading={sync.isPending} disabled={!c.metaPageId} onClick={() => sync.mutate()} title={c.metaPageId ? undefined : 'Add the Facebook Page id to check ads'}>
          <RefreshCw className="size-3.5" /> Check now
        </Button>
        <Button size="xs" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button size="xs" variant="ghost" loading={toggle.isPending} onClick={() => toggle.mutate()}>
          {c.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {c.isActive ? 'Pause' : 'Resume'}
        </Button>
        <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Delete ${c.name}`} onClick={() => setRemoving(true)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <DeleteCompetitor c={c} open={removing} onOpenChange={setRemoving} />
    </div>
  );
}

function DeleteCompetitor({ c, open, onOpenChange }: { c: CompetitorView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [ads, setAds] = useState<'keep' | 'delete'>('keep');
  const remove = useMutation({
    mutationFn: () => api.delete(`/competitors/${c.id}?ads=${ads}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitors'] });
      qc.invalidateQueries({ queryKey: ['inspiration'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop tracking {c.name}?</DialogTitle>
          <DialogDescription>Choose what happens to the {c.adCount} ads already in your swipe file.</DialogDescription>
        </DialogHeader>
        <Segmented value={ads} onChange={setAds} options={[{ value: 'keep', label: 'Keep the ads' }, { value: 'delete', label: 'Delete them too' }]} />
        {ads === 'delete' && <p className="text-xs text-muted-foreground">Favorites are kept either way.</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompetitorDialog({ value, onClose }: { value: CompetitorView | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = value === 'new';
  const current = value && value !== 'new' ? value : null;
  const [f, setF] = useState({ name: '', website: '', metaPageId: '', tiktokHandle: '', countries: 'DE,FR,IE', notes: '' });
  useEffect(() => {
    if (value)
      setF({
        name: current?.name ?? '',
        website: current?.website ?? '',
        metaPageId: current?.metaPageId ?? '',
        tiktokHandle: current?.tiktokHandle ?? '',
        countries: (current?.countries ?? ['DE', 'FR', 'IE']).join(','),
        notes: current?.notes ?? '',
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const save = useMutation({
    mutationFn: () => {
      const countries = f.countries.toUpperCase().replace(/\s+/g, '').split(',').filter(Boolean);
      if (!countries.length || countries.some((c) => !/^[A-Z]{2}$/.test(c))) throw new Error('Countries are 2-letter codes separated by commas, like DE,FR,IE.');
      const website = f.website.trim() ? (/^https?:\/\//i.test(f.website.trim()) ? f.website.trim() : `https://${f.website.trim()}`) : null;
      const pageId = f.metaPageId.trim();
      if (pageId && !/^[0-9]{1,40}$/.test(pageId)) throw new Error('A Facebook Page id is a number.');
      const body = { name: f.name.trim(), website, metaPageId: pageId || null, tiktokHandle: f.tiktokHandle.trim().replace(/^@/, '') || null, countries, notes: f.notes.trim() || null };
      return isNew ? api.post<CompetitorView>('/competitors', body) : api.patch<CompetitorView>(`/competitors/${current!.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitors'] });
      toast.success(isNew ? 'Tracking started. The first check runs now.' : 'Saved');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Track a competitor' : `Edit ${current?.name ?? ''}`}</DialogTitle>
          <DialogDescription>Ads are read from Meta's Ad Library for the countries you list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input value={f.name} onChange={set('name')} maxLength={200} placeholder="Brand name" />
          </Field>
          <Field label="Facebook Page id" hint="In the Ad Library link: view_all_page_id=…">
            <Input value={f.metaPageId} onChange={set('metaPageId')} maxLength={40} inputMode="numeric" placeholder="1234567890" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website">
              <Input value={f.website} onChange={set('website')} maxLength={500} placeholder="brand.com" />
            </Field>
            <Field label="TikTok handle">
              <Input value={f.tiktokHandle} onChange={set('tiktokHandle')} maxLength={60} placeholder="@brand" />
            </Field>
          </div>
          <Field label="Countries" hint="EU countries give the fullest results.">
            <Input value={f.countries} onChange={set('countries')} maxLength={90} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={f.notes} onChange={set('notes')} maxLength={2000} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>
            {isNew ? 'Start tracking' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
