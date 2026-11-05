'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AssetThumb } from '@/components/app/asset-card';
import { AssetPicker } from '@/components/app/asset-picker';
import { VoicePicker } from '@/components/app/voice-picker';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView, CharacterView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCharacters } from './use-scripts';

const COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#10B981', '#0EA5E9', '#EAB308', '#EF4444', '#64748B'];
const EMOTIONS = ['neutral', 'excited', 'warm', 'confident', 'playful', 'sarcastic', 'serious', 'curious', 'whispers', 'surprised'];

export function CharacterAvatar({ character, className }: { character: Pick<CharacterView, 'name' | 'color' | 'avatar'>; className?: string }) {
  if (character.avatar?.thumbnailUrl) return <AssetThumb asset={character.avatar} hoverPlay={false} className={cn('size-9 shrink-0 rounded-full', className)} />;
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white', className)} style={{ background: character.color ?? '#64748B' }}>
      {character.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Create or edit a recurring character: who they are, how they sound, how they look. */
export function CharacterDialog({ open, onOpenChange, character, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; character?: CharacterView | null; onSaved?: (c: CharacterView) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [emotion, setEmotion] = useState('neutral');
  const [pace, setPace] = useState(1);
  const [color, setColor] = useState<string>(COLORS[0]!);
  const [avatar, setAvatar] = useState<AssetView | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(character?.name ?? '');
    setDescription(character?.description ?? '');
    setVoiceId(character?.voiceId ?? null);
    setEmotion(character?.defaultEmotion ?? 'neutral');
    setPace(character?.defaultPace ?? 1);
    setColor(character?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)]!);
    setAvatar(character?.avatar ?? null);
  }, [open, character]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null, voiceId, defaultEmotion: emotion.trim() || 'neutral', defaultPace: pace, color, avatarAssetId: avatar?.id ?? null };
      return character ? api.patch<CharacterView>(`/characters/${character.id}`, body) : api.post<CharacterView>('/characters', body);
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['characters'] });
      toast.success(character ? 'Character saved' : `${c.name} added`);
      onSaved?.(c);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{character ? `Edit ${character.name}` : 'New character'}</DialogTitle>
            <DialogDescription>Characters keep the same voice, delivery and look across every script and dialogue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => setPicking(true)} className="group relative shrink-0" aria-label="Choose an avatar image">
                {avatar ? (
                  <AssetThumb asset={avatar} hoverPlay={false} className="size-16 rounded-full" />
                ) : (
                  <span className="flex size-16 items-center justify-center rounded-full text-xl font-semibold text-white" style={{ background: color }}>
                    {name.trim().slice(0, 1).toUpperCase() || <UserRound className="size-6" />}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
                  <ImagePlus className="size-5 text-white" />
                </span>
              </button>
              <div className="flex-1 space-y-3">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya" maxLength={80} autoFocus />
                </Field>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn('size-6 rounded-full ring-offset-2 ring-offset-popover transition', color === c && 'ring-2 ring-foreground')} style={{ background: c }} />
                  ))}
                  {avatar && (
                    <Button type="button" variant="ghost" size="xs" onClick={() => setAvatar(null)}>
                      <X className="size-3" /> Remove image
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <Field label="Who they are" hint="Age, personality, how they talk. The script writer uses this.">
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="28, gym regular, dry humour, talks fast and skeptical until she sees proof." maxLength={1000} />
            </Field>
            <Field label="Voice">
              <VoicePicker by="id" value={voiceId} onChange={setVoiceId} noneLabel="No voice yet" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Usual delivery">
                <Input list="character-emotions" value={emotion} onChange={(e) => setEmotion(e.target.value)} maxLength={40} />
                <datalist id="character-emotions">
                  {EMOTIONS.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </Field>
              <Field label="Pace" aside={<span className="text-xs tabular-nums text-muted-foreground">{pace.toFixed(2)}×</span>}>
                <Slider min={0.7} max={1.2} step={0.05} value={[pace]} onValueChange={([v]) => setPace(v ?? 1)} className="py-2" />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
              {character ? 'Save' : 'Add character'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssetPicker open={picking} onOpenChange={setPicking} types={['image']} title="Choose an avatar" onPick={([a]) => a && setAvatar(a)} />
    </>
  );
}

/** Grid of the workspace's characters with edit and delete. */
export function CharactersPanel({ action }: { action?: ReactNode }) {
  const qc = useQueryClient();
  const list = useCharacters();
  const [editing, setEditing] = useState<CharacterView | null>(null);
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/characters/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['characters'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const edit = (c: CharacterView | null) => {
    setEditing(c);
    setOpen(true);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Recurring people for dialogues and UGC-style ads, each with a fixed voice and delivery.</p>
        <div className="flex gap-2">
          {action}
          <Button size="sm" variant="secondary" onClick={() => edit(null)}>
            <Plus className="size-4" /> New character
          </Button>
        </div>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !list.data?.length ? (
        <EmptyState icon={<UserRound />} title="No characters yet" description="Add the people who appear in your ads. Dialogues are written for them, in their voice." action={<Button size="sm" variant="brand" onClick={() => edit(null)}><Plus className="size-4" /> New character</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((c) => (
            <div key={c.id} className="group flex gap-3 rounded-xl border bg-card p-4">
              <CharacterAvatar character={c} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <Button size="icon-xs" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => edit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Confirm title={`Delete ${c.name}?`} description="Scripts keep their lines; they just lose the link to this character." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync(c.id)}>
                      <Button size="icon-xs" variant="ghost" aria-label={`Delete ${c.name}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </Confirm>
                  </div>
                </div>
                {c.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{c.voice ? `Voice: ${c.voice.name}` : 'No voice'}</span>
                  <span>{c.defaultEmotion}</span>
                  <span>{c.defaultPace.toFixed(2)}×</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <CharacterDialog open={open} onOpenChange={setOpen} character={editing} />
    </div>
  );
}
