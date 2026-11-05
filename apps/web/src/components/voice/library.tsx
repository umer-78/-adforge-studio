'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Check, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { LANGUAGES } from '@adforge/core';
import { ConsentPicker } from '@/components/app/consent-picker';
import { useVoices, voiceHint, VoicePreview } from '@/components/app/voice-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { api, ApiError, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { VoiceView } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CatalogVoice {
  providerVoiceId: string;
  publicOwnerId: string | null;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
  cloned: boolean;
  savedId: string | null;
}

interface Usage {
  tier: string;
  characterCount: number;
  characterLimit: number;
  resetsAt: string | null;
}

export function VoiceLibrary() {
  const qc = useQueryClient();
  const voices = useVoices();
  const usage = useQuery({ queryKey: ['voices', 'usage'], queryFn: () => api.get<Usage>('/voices/usage'), retry: false, staleTime: 60_000 });
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<VoiceView | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/voices/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['voices'] });
      void qc.invalidateQueries({ queryKey: ['characters'] });
      toast.success('Voice removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {usage.data ? (
          <div className="min-w-64 flex-1 space-y-1.5 rounded-xl border bg-card px-4 py-3 sm:max-w-md">
            <div className="flex justify-between text-xs">
              <span className="font-medium capitalize">ElevenLabs · {usage.data.tier.replace(/_/g, ' ')}</span>
              <span className="tabular-nums text-muted-foreground">
                {usage.data.characterCount.toLocaleString()} / {usage.data.characterLimit.toLocaleString()} characters
              </span>
            </div>
            <Progress value={(usage.data.characterCount / Math.max(1, usage.data.characterLimit)) * 100} className="h-1.5" />
            {usage.data.resetsAt && <div className="text-[11px] text-muted-foreground">Resets {new Date(usage.data.resetsAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>}
          </div>
        ) : usage.error instanceof ApiError && usage.error.code === 'provider_not_configured' ? (
          <Notice tone="warning" className="flex-1" action={<Button asChild size="sm" variant="secondary"><Link href="/settings/providers">Add key</Link></Button>}>
            Add an ElevenLabs API key to use voices.
          </Notice>
        ) : (
          <div />
        )}
        <Button variant="brand" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add voices
        </Button>
      </div>

      {voices.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !voices.data?.length ? (
        <EmptyState icon={<AudioLines />} title="No voices yet" description="Add voices from your ElevenLabs account or the public voice library, or clone a voice with the speaker's consent." action={<Button variant="brand" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add voices</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {voices.data.map((v) => (
            <div key={v.id} className="group flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-brand-to/30 text-sm font-semibold">{v.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    {v.isCloned && (
                      <Badge variant="success">
                        <ShieldCheck /> Cloned
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{voiceHint(v) || 'ElevenLabs voice'}</div>
                </div>
                <VoicePreview url={v.previewUrl} />
              </div>
              <div className="mt-auto flex items-center gap-1 pt-1">
                <Button asChild size="xs" variant="secondary">
                  <Link href={`/voice?tab=speak&voice=${encodeURIComponent(v.providerVoiceId)}`}>
                    <AudioLines className="size-3.5" /> Use
                  </Link>
                </Button>
                <div className="ml-auto flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <Button size="icon-xs" variant="ghost" aria-label={`Rename ${v.name}`} onClick={() => setRenaming(v)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Confirm
                    title={`Remove ${v.name}?`}
                    description={v.isCloned ? 'The cloned voice is deleted from ElevenLabs too. Takes already made stay in your library.' : 'It is removed from this workspace. Takes already made stay in your library.'}
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => remove.mutateAsync(v.id)}
                  >
                    <Button size="icon-xs" variant="ghost" aria-label={`Remove ${v.name}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </Confirm>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <CatalogDialog onClose={() => setAdding(false)} />}
      {renaming && <RenameDialog voice={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}

function RenameDialog({ voice, onClose }: { voice: VoiceView; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(voice.name);
  const save = useMutation({
    mutationFn: () => api.patch(`/voices/${voice.id}`, { name: name.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['voices'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename voice</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus onKeyDown={(e) => e.key === 'Enter' && name.trim() && save.mutate()} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Browse the ElevenLabs account's voices or the shared library and save voices to the workspace. */
function CatalogDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'account' | 'shared'>('account');
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState('any');
  const [language, setLanguage] = useState('any');
  const [needsConsent, setNeedsConsent] = useState<CatalogVoice | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const q = useDebounced(search.trim(), 350);
  const list = useQuery({
    queryKey: ['voices', 'catalog', scope, q, gender, language],
    queryFn: () => api.get<{ items: CatalogVoice[] }>(`/voices/catalog?${new URLSearchParams({ scope, search: q, ...(scope === 'shared' && gender !== 'any' ? { gender } : {}), ...(scope === 'shared' && language !== 'any' ? { language } : {}) })}`).then((r) => r.items),
    retry: false,
  });
  const add = useMutation({
    mutationFn: (v: { voice: CatalogVoice; consentId?: string }) =>
      v.voice.publicOwnerId
        ? api.post<VoiceView>('/voices', { source: 'shared', publicOwnerId: v.voice.publicOwnerId, providerVoiceId: v.voice.providerVoiceId, name: v.voice.name.slice(0, 100), labels: v.voice.labels, previewUrl: v.voice.previewUrl })
        : api.post<VoiceView>('/voices', { source: 'account', providerVoiceId: v.voice.providerVoiceId, ...(v.consentId ? { consentId: v.consentId } : {}) }),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['voices'] });
      toast.success(`${saved.name} added`);
      setNeedsConsent(null);
      setConsentId(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pick = (v: CatalogVoice) => (v.cloned ? setNeedsConsent(v) : add.mutate({ voice: v }));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Add voices</DialogTitle>
          <DialogDescription>Voices you add show up in every voice picker in the studio.</DialogDescription>
        </DialogHeader>
        {needsConsent ? (
          <div className="space-y-4">
            <Notice tone="warning" title={`${needsConsent.name} is a cloned voice`}>
              Choose the consent from the person whose voice it is. Without it the voice cannot be used here.
            </Notice>
            <ConsentPicker kinds={['voice_clone']} value={consentId} onChange={setConsentId} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNeedsConsent(null)}>
                Back
              </Button>
              <Button variant="brand" disabled={!consentId} loading={add.isPending} onClick={() => consentId && add.mutate({ voice: needsConsent, consentId })}>
                Add with consent
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'account', label: 'My ElevenLabs voices' }, { value: 'shared', label: 'Voice library' }]} />
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={scope === 'shared' ? 'Search: warm, British, narrator…' : 'Search your voices'} className="h-8 pl-9" />
              </div>
              {scope === 'shared' && (
                <>
                  <Select size="sm" value={gender} onValueChange={setGender} options={[{ value: 'any', label: 'Any gender' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }]} className="w-32" />
                  <Select size="sm" value={language} onValueChange={setLanguage} options={[{ value: 'any', label: 'Any language' }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]} className="w-36" />
                </>
              )}
            </div>
            <div className="-mx-1 min-h-64 overflow-y-auto scrollbar-thin px-1">
              {list.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : list.error ? (
                <Notice tone="error">{errorMessage(list.error)}</Notice>
              ) : !list.data?.length ? (
                <EmptyState title="No voices found" description={scope === 'shared' ? 'Try another search.' : 'Your ElevenLabs account has no voices that match.'} className="py-10" />
              ) : (
                <ul className="divide-y rounded-xl border">
                  {list.data.map((v) => (
                    <li key={`${v.publicOwnerId ?? 'own'}:${v.providerVoiceId}`} className="flex items-center gap-3 p-3">
                      <VoicePreview url={v.previewUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{v.name}</span>
                          {v.cloned && <Badge variant="warning">Cloned</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{[v.labels.gender, v.labels.accent, v.labels.age, v.labels.use_case, v.labels.descriptive].filter(Boolean).join(' · ') || v.description || v.category}</div>
                      </div>
                      <Button size="sm" variant={v.savedId ? 'ghost' : 'secondary'} disabled={!!v.savedId || add.isPending} onClick={() => pick(v)} className={cn(v.savedId && 'text-success')}>
                        {v.savedId ? (
                          <>
                            <Check className="size-4" /> Added
                          </>
                        ) : (
                          <>
                            <Plus className="size-4" /> Add
                          </>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
