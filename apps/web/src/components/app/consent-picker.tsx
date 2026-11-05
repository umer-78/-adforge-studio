'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { consentStatement, type ConsentKind } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';
import { AssetSlot } from './asset-picker';

export interface ConsentView {
  id: string;
  kind: ConsentKind;
  subjectName: string;
  isSelf: boolean;
  statement: string;
  evidenceAssetId: string | null;
  acceptedAt: string;
  revokedAt: string | null;
}

export const CONSENT_KIND_LABEL: Record<ConsentKind, string> = { voice_clone: 'Voice cloning', face_likeness: 'Face & likeness', lipsync_dub: 'Lip-sync & dubbing' };

export function useConsents() {
  return useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ items: ConsentView[] }>('/consents').then((r) => r.items) });
}

/** Choose or record the consent that covers a real person's face or voice. */
export function ConsentPicker({ kinds, value, onChange }: { kinds: ConsentKind[]; value: string | null; onChange: (id: string | null) => void }) {
  const consents = useConsents();
  const [open, setOpen] = useState(false);
  const list = (consents.data ?? []).filter((c) => kinds.includes(c.kind));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-success" /> Consent <span className="text-destructive">*</span>
        </span>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen(true)}>
          Add consent
        </button>
      </div>
      {list.length ? (
        <Select
          value={value ?? undefined}
          onValueChange={onChange}
          placeholder="Who is shown or heard?"
          options={list.map((c) => ({ value: c.id, label: `${c.isSelf ? `${c.subjectName} (me)` : c.subjectName} · ${CONSENT_KIND_LABEL[c.kind]}` }))}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">Real faces and voices need recorded consent first. It takes ten seconds.</p>
      )}
      <ConsentDialog open={open} onOpenChange={setOpen} kind={kinds[0]!} onCreated={(c) => onChange(c.id)} />
    </div>
  );
}

export function ConsentDialog({ open, onOpenChange, kind, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; kind: ConsentKind; onCreated: (c: ConsentView) => void }) {
  const qc = useQueryClient();
  const [subjectName, setSubjectName] = useState('');
  const [isSelf, setIsSelf] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [evidence, setEvidence] = useState<AssetView | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<ConsentView>('/consents', { kind, subjectName: subjectName.trim(), isSelf, accepted: true, ...(evidence ? { evidenceAssetId: evidence.id } : {}) }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['consents'] });
      toast.success('Consent recorded');
      onCreated(c);
      onOpenChange(false);
      setAccepted(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const name = subjectName.trim() || (isSelf ? 'me' : 'this person');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{CONSENT_KIND_LABEL[kind]} consent</DialogTitle>
          <DialogDescription>We keep a dated record of who agreed and from where. You can revoke it in Settings at any time.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Person's full name">
            <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Jane Doe" autoFocus />
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>This is me</span>
            <Switch checked={isSelf} onCheckedChange={setIsSelf} />
          </label>
          {!isSelf && <AssetSlot label="Signed release (optional)" types={['image', 'video', 'audio']} value={evidence} onChange={setEvidence} hint="A photo of the signed form or a recorded statement." />}
          <label className="flex items-start gap-3 rounded-xl border bg-surface-2 p-3 text-[13px] leading-relaxed">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} className="mt-0.5" />
            <span>{consentStatement(kind, name, isSelf)}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!accepted || !subjectName.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Record consent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
