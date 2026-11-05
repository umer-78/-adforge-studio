'use client';

import { LICENSE_KIND_LABELS, OWNED_LICENSE_KINDS, type LicenseInput, type OwnedLicenseKind } from '@adforge/core';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export interface LicenseDraft {
  kind: OwnedLicenseKind;
  commercialUse: boolean;
  source: string;
  termsUrl: string;
  expiresAt: string;
  notes: string;
}

export const emptyLicense = (): LicenseDraft => ({ kind: 'licensed', commercialUse: true, source: '', termsUrl: '', expiresAt: '', notes: '' });

const HINTS: Record<OwnedLicenseKind, string> = {
  licensed: 'From a music library or store such as Artlist, Epidemic Sound or Musicbed.',
  royalty_free: 'A royalty-free pack or site. Check that ads and paid social are allowed.',
  owned: 'You or your team made it, or you commissioned it with full rights.',
  public_domain: 'No copyright applies. Recordings of old songs are often still protected.',
};

const isUrl = (s: string) => {
  try {
    return /^https?:$/.test(new URL(s).protocol);
  } catch {
    return false;
  }
};

export function licenseProblems(d: LicenseDraft): string[] {
  return [
    d.kind !== 'owned' && !d.source.trim() ? 'Say where the track comes from.' : '',
    d.termsUrl.trim() && !isUrl(d.termsUrl.trim()) ? 'The license link must start with https://.' : '',
  ].filter(Boolean);
}

export function toLicenseInput(d: LicenseDraft): LicenseInput {
  return {
    kind: d.kind,
    commercialUse: d.commercialUse,
    source: d.source.trim() || null,
    termsUrl: d.termsUrl.trim() || null,
    notes: d.notes.trim() || null,
    expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59`).toISOString() : null,
  };
}

/** Where a track comes from and what it may be used for. Exports check this before publishing. */
export function LicenseFields({ value, onChange }: { value: LicenseDraft; onChange: (v: LicenseDraft) => void }) {
  const set = <K extends keyof LicenseDraft>(k: K, v: LicenseDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3 rounded-xl border bg-surface-2/40 p-3">
      <Field label="Rights" hint={HINTS[value.kind]}>
        <Select value={value.kind} onValueChange={(v) => set('kind', v as OwnedLicenseKind)} options={OWNED_LICENSE_KINDS.map((k) => ({ value: k, label: LICENSE_KIND_LABELS[k] }))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source">
          <Input value={value.source} onChange={(e) => set('source', e.target.value)} placeholder={value.kind === 'owned' ? 'Our studio' : 'Artlist'} maxLength={300} />
        </Field>
        <Field label="Expires" hint="Leave empty if it never does.">
          <Input type="date" value={value.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
        </Field>
      </div>
      <Field label="License link">
        <Input value={value.termsUrl} onChange={(e) => set('termsUrl', e.target.value)} placeholder="https://…" inputMode="url" maxLength={1000} />
      </Field>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium">Covers commercial use</span>
          <span className="block text-xs text-muted-foreground">Ads, paid social and client work.</span>
        </span>
        <Switch checked={value.commercialUse} onCheckedChange={(v) => set('commercialUse', v)} />
      </label>
      {!value.commercialUse && <Notice tone="warning">You can keep this track for drafts, but exports that use it are blocked from publishing and ad launches.</Notice>}
    </div>
  );
}
