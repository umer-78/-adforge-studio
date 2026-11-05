'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CONSENT_KINDS, type ConsentKind } from '@adforge/core';
import { CONSENT_KIND_LABEL, ConsentDialog, type ConsentView } from '@/components/app/consent-picker';
import { SettingsSection } from '@/components/settings/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import { cn } from '@/lib/utils';

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function ConsentsView() {
  const me = useMe();
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [kind, setKind] = useState<ConsentKind | null>(null);
  const consents = useQuery({
    queryKey: ['consents', 'settings', show],
    queryFn: () => api.get<{ items: ConsentView[] }>(`/consents${show === 'all' ? '?active=0' : ''}`).then((r) => r.items),
  });
  const canEdit = me.data?.workspace.role !== 'viewer';
  const items = consents.data ?? [];
  return (
    <div className="space-y-6">
      <SettingsSection
        title="Consents"
        description="A record of who agreed to have their voice cloned, their face or likeness used, or their speech dubbed: the exact statement, when, and from which device. Generations that use a real person's voice or face need one."
        actions={
          canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus /> Record consent <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {CONSENT_KINDS.map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => setKind(k)}>
                    {CONSENT_KIND_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      >
        <Segmented
          value={show}
          onChange={setShow}
          size="sm"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'Including revoked' },
          ]}
        />
        {consents.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : consents.isError ? (
          <Notice tone="error">Could not load consents. {errorMessage(consents.error)}</Notice>
        ) : items.length ? (
          <ul className="divide-y rounded-xl border">
            {items.map((c) => (
              <ConsentRow key={c.id} c={c} canEdit={canEdit} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ShieldCheck />} title={show === 'active' ? 'No active consents' : 'No consents recorded'} description="Record one before cloning a voice or using a real person's face. It takes a few seconds." />
        )}
      </SettingsSection>
      {kind && <ConsentDialog open={!!kind} onOpenChange={(v) => !v && setKind(null)} kind={kind} onCreated={() => setKind(null)} />}
    </div>
  );
}

function ConsentRow({ c, canEdit }: { c: ConsentView; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoked = !!c.revokedAt;
  return (
    <li className={cn('space-y-2 p-3', revoked && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{c.isSelf ? `${c.subjectName} (me)` : c.subjectName}</span>
        <Badge variant="secondary">{CONSENT_KIND_LABEL[c.kind]}</Badge>
        {revoked ? <Badge variant="outline">Revoked {when(c.revokedAt!)}</Badge> : <Badge variant="success">Active</Badge>}
        <span className="text-xs text-muted-foreground">Given {when(c.acceptedAt)}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Hide statement' : 'Statement'}
          </Button>
          {canEdit && !revoked && (
            <Confirm
              title={`Revoke consent from ${c.subjectName}?`}
              description="New generations that rely on it are blocked. Cloned voices are not deleted automatically; remove them in Voice-over if needed."
              confirmLabel="Revoke"
              destructive
              onConfirm={async () => {
                try {
                  await api.delete(`/consents/${c.id}`);
                  void qc.invalidateQueries({ queryKey: ['consents'] });
                  toast.success('Consent revoked');
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <Button size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive">
                Revoke
              </Button>
            </Confirm>
          )}
        </div>
      </div>
      {open && <blockquote className="rounded-lg border-l-2 border-primary/40 bg-surface-2/50 p-3 text-xs leading-relaxed text-muted-foreground">{c.statement}</blockquote>}
    </li>
  );
}
