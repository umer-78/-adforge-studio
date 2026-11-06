'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookA, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { applyPronunciations, parseWorkspaceSettings, pronunciationsSchema, type Pronunciation } from '@adforge/core';
import { isAdmin } from '@/components/settings/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { Me } from '@/lib/types';

const blank = (): Pronunciation => ({ word: '', sayAs: '', matchCase: false });

/** Workspace dictionary of how voice-overs say brand names, initialisms and product codes. */
export function PronunciationsButton() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const count = me.data ? parseWorkspaceSettings(me.data.workspace.settings).pronunciations.length : 0;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!me.data}>
        <BookA /> Pronunciations{count ? ` (${count})` : ''}
      </Button>
      {open && me.data && <PronunciationsDialog me={me.data} onClose={() => setOpen(false)} />}
    </>
  );
}

function PronunciationsDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const qc = useQueryClient();
  const admin = isAdmin(me);
  const [rows, setRows] = useState<Pronunciation[]>(() => {
    const saved = parseWorkspaceSettings(me.workspace.settings).pronunciations;
    return saved.length ? saved : [blank()];
  });
  const [sample, setSample] = useState('Meet AdForge, the fastest way to make ads.');
  const filled = rows.filter((r) => r.word.trim() || r.sayAs.trim());
  const parsed = pronunciationsSchema.safeParse(filled);
  const dupes = new Set(filled.map((r) => r.word.trim().toLowerCase())).size !== filled.length;
  const problem = !parsed.success ? 'Fill in both columns of every row (up to 60 and 120 characters).' : dupes ? 'Each word can only appear once.' : null;
  const save = useMutation({
    mutationFn: () => api.patch<Me>('/workspace', { settings: { pronunciations: parsed.success ? parsed.data : [] } }),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data);
      toast.success('Pronunciations saved');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (i: number, patch: Partial<Pronunciation>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Pronunciations</DialogTitle>
          <DialogDescription>How every voice-over and dialogue in this workspace says your brand names, initialisms and product codes. Write it the way it sounds.</DialogDescription>
        </DialogHeader>
        {!admin && <Notice tone="info">Only owners and admins can change pronunciations.</Notice>}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Written</span>
            <span>Say it as</span>
            <span>Match case</span>
            <span className="sr-only">Remove</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
              <Input aria-label="Written" value={r.word} maxLength={60} disabled={!admin} placeholder="AdForge" onChange={(e) => set(i, { word: e.target.value })} />
              <Input aria-label="Say it as" value={r.sayAs} maxLength={120} disabled={!admin} placeholder="Ad Forge" onChange={(e) => set(i, { sayAs: e.target.value })} />
              <div className="flex w-[4.5rem] justify-center">
                <Checkbox aria-label="Match case" checked={r.matchCase} disabled={!admin} onCheckedChange={(v) => set(i, { matchCase: v === true })} />
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="Remove" disabled={!admin} onClick={() => setRows((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [blank()]))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {admin && rows.length < 300 && (
            <Button size="sm" variant="ghost" onClick={() => setRows((all) => [...all, blank()])}>
              <Plus /> Add a word
            </Button>
          )}
        </div>
        <div className="space-y-1.5 rounded-xl border bg-surface-2 p-3">
          <label htmlFor="pron-sample" className="text-xs font-medium">
            Try it
          </label>
          <Input id="pron-sample" value={sample} onChange={(e) => setSample(e.target.value)} maxLength={300} />
          <p className="text-sm">
            <span className="text-muted-foreground">Spoken as: </span>
            {applyPronunciations(sample, parsed.success ? parsed.data : [])}
          </p>
        </div>
        {problem && filled.length > 0 && <p className="text-xs text-destructive">{problem}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {admin && (
            <Button loading={save.isPending} disabled={!!problem} onClick={() => save.mutate()}>
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
