'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { displayName, MUSIC_GENRES, MUSIC_MOODS, SFX_CATEGORIES } from '@adforge/core';
import { AssetSlot } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';
import { emptyLicense, LicenseFields, licenseProblems, toLicenseInput, type LicenseDraft } from './license-fields';

const NONE = '__none';
const pickOptions = (list: readonly string[], none: string) => [{ value: NONE, label: none }, ...list.map((v) => ({ value: v, label: v }))];
export const sfxCategoryLabel = (c: string) => (c === 'ui' ? 'UI' : c.charAt(0).toUpperCase() + c.slice(1));

/**
 * Files an uploaded track as music or a sound effect. Files without a license on record
 * need one, so nothing uncleared ends up in an ad by accident.
 */
export function AddAudioDialog({ kind, open, onOpenChange }: { kind: 'music' | 'sfx'; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState(NONE);
  const [mood, setMood] = useState(NONE);
  const [category, setCategory] = useState<string>('foley');
  const [tags, setTags] = useState('');
  const [logo, setLogo] = useState(false);
  const [withLicense, setWithLicense] = useState(true);
  const [license, setLicense] = useState<LicenseDraft>(emptyLicense);

  useEffect(() => {
    if (!open) return;
    setAsset(null);
    setTitle('');
    setGenre(NONE);
    setMood(NONE);
    setCategory('foley');
    setTags('');
    setLogo(false);
    setWithLicense(true);
    setLicense(emptyLicense());
  }, [open]);

  const covered = !!asset && (!!asset.licenseId || asset.source === 'generated' || (kind === 'sfx' && asset.source === 'recording'));
  const needLicense = !covered || withLicense;
  const problems = [
    !asset ? 'Choose an audio file.' : asset.type !== 'audio' ? 'Pick an audio file.' : asset.status === 'failed' ? 'This file could not be processed.' : '',
    ...(needLicense ? licenseProblems(license) : []),
  ].filter(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const lic = needLicense ? { license: toLicenseInput(license) } : {};
      const name = title.trim() || undefined;
      return kind === 'music'
        ? api.post('/music', { assetId: asset!.id, title: name, genre: genre === NONE ? null : genre, mood: mood === NONE ? null : mood, isAudioLogo: logo, ...lic })
        : api.post('/sfx', {
            mode: 'asset',
            assetId: asset!.id,
            name,
            category,
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 12),
            ...lic,
          });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(kind === 'music' ? 'Track added to your music' : 'Sound added to your effects');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === 'music' ? 'Add a licensed track' : 'Add a sound effect'}</DialogTitle>
          <DialogDescription>{kind === 'music' ? 'Bring in music you have the rights to. AdForge keeps the license with the track and checks it on every export.' : 'Bring in your own sound. Its license travels with it into every edit.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <AssetSlot
            label={kind === 'music' ? 'Track' : 'Sound'}
            types={['audio']}
            value={asset}
            onChange={(a) => {
              setAsset(a);
              if (a && !title) setTitle(displayName(a.name));
              setWithLicense(!(a && (a.licenseId || a.source === 'generated' || (kind === 'sfx' && a.source === 'recording'))));
            }}
            required
          />
          <Field label={kind === 'music' ? 'Title' : 'Name'}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={kind === 'music' ? 120 : 80} placeholder={kind === 'music' ? 'Summer launch theme' : 'Bottle cap pop'} />
          </Field>
          {kind === 'music' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Genre">
                  <Select value={genre} onValueChange={setGenre} options={pickOptions(MUSIC_GENRES, 'Not set')} />
                </Field>
                <Field label="Mood">
                  <Select value={mood} onValueChange={setMood} options={pickOptions(MUSIC_MOODS, 'Not set')} />
                </Field>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">Audio logo</span>
                  <span className="block text-xs text-muted-foreground">A short sonic signature to end your ads with.</span>
                </span>
                <Switch checked={logo} onCheckedChange={setLogo} />
              </label>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select value={category} onValueChange={setCategory} options={SFX_CATEGORIES.filter((c) => c !== 'generated').map((c) => ({ value: c, label: sfxCategoryLabel(c) }))} />
              </Field>
              <Field label="Tags" hint="Separate with commas.">
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pop, bottle, open" />
              </Field>
            </div>
          )}
          {covered && (
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
              <span>
                <span className="font-medium">{asset?.licenseId ? 'A license is already on file' : asset?.source === 'generated' ? 'Generated with AI' : 'Your own recording'}</span>
                <span className="block text-xs text-muted-foreground">Turn on to record a different license.</span>
              </span>
              <Switch checked={withLicense} onCheckedChange={setWithLicense} />
            </label>
          )}
          {needLicense && <LicenseFields value={license} onChange={setLicense} />}
          {problems.length > 0 && asset && <Notice tone="warning">{problems[0]}</Notice>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={save.isPending} disabled={problems.length > 0} onClick={() => save.mutate()}>
            {kind === 'music' ? 'Add track' : 'Add sound'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Records a new license for a file that has none, or the wrong one. */
export function LicenseDialog({ asset, open, onOpenChange }: { asset: AssetView | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [license, setLicense] = useState<LicenseDraft>(emptyLicense);
  useEffect(() => {
    if (open) setLicense(emptyLicense());
  }, [open]);
  const problems = licenseProblems(license);
  const save = useMutation({
    mutationFn: () => api.post('/licenses', { ...toLicenseInput(license), assetIds: [asset!.id] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success('License saved');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>License for “{asset?.name}”</DialogTitle>
          <DialogDescription>Exports check this before anything is published or launched as an ad.</DialogDescription>
        </DialogHeader>
        <LicenseFields value={license} onChange={setLicense} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={save.isPending} disabled={!asset || problems.length > 0} onClick={() => save.mutate()}>
            Save license
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
