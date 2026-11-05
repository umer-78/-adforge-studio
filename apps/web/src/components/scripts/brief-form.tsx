'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, FilePlus2, Mic, PenLine, Plus, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { LANGUAGES } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDictation } from '@/lib/hooks/use-dictation';
import type { ScriptView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CharacterAvatar, CharacterDialog } from './characters';
import { LlmPrice } from './llm-price';
import { useCharacters } from './use-scripts';

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'meta', label: 'Meta ads (FB + IG)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
  { value: 'pinterest', label: 'Pinterest' },
];
const GOALS = ['Drive purchases', 'App installs', 'Sign-ups or leads', 'Book a call', 'Brand awareness', 'Win back past customers'];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface ProductLite {
  id: string;
  title: string | null;
  sourceUrl: string;
  status: string;
}

/** Brief for a new AI-written script, or a blank one to write by hand. */
export function BriefForm({ className }: { className?: string }) {
  const router = useRouter();
  const [format, setFormat] = useState<'ad' | 'dialogue'>('ad');
  const [product, setProduct] = useState('');
  const [productId, setProductId] = useState('none');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState(GOALS[0]!);
  const [tone, setTone] = useState('Confident, friendly, direct');
  const [platform, setPlatform] = useState('tiktok');
  const [duration, setDuration] = useState('30');
  const [language, setLanguage] = useState('en');
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [angle, setAngle] = useState('');
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [newCharacter, setNewCharacter] = useState(false);
  const characters = useCharacters();
  const products = useQuery({
    queryKey: ['products', 'ready'],
    queryFn: () => api.get<{ items: ProductLite[] }>('/products?status=ready&limit=50').then((r) => r.items),
    retry: false,
    staleTime: 60_000,
  });
  const dict = useDictation((text, final) => final && setProduct((v) => `${v}${v && !/\s$/.test(v) ? ' ' : ''}${text.trim()}`));

  const write = useMutation({
    mutationFn: () =>
      api.post<ScriptView>('/scripts', {
        mode: 'generate',
        brief: {
          format,
          product: product.trim(),
          ...(productId !== 'none' ? { productId } : {}),
          audience: audience.trim(),
          goal,
          tone: tone.trim(),
          platform,
          durationS: Number(duration),
          language,
          characterIds: format === 'dialogue' ? characterIds : [],
          ...(angle.trim() ? { angle: angle.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }),
    onSuccess: (s) => router.push(`/scripts/${s.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const blank = useMutation({
    mutationFn: () => api.post<ScriptView>('/scripts', { mode: 'blank', format, language }),
    onSuccess: (s) => router.push(`/scripts/${s.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggleCharacter = (id: string) => setCharacterIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 6 ? ids : [...ids, id]));
  const ready = (product.trim().length >= 3 || productId !== 'none') && (format === 'ad' || characterIds.length > 0);

  return (
    <div className={cn('space-y-4 rounded-2xl border bg-card p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">New script</h2>
        <Segmented size="sm" value={format} onChange={setFormat} options={[{ value: 'ad', label: 'Ad script' }, { value: 'dialogue', label: 'Dialogue' }]} />
      </div>

      {!!products.data?.length && (
        <Field label="Imported product page" hint="Facts, price and photos from the page are used in the script.">
          <Select value={productId} onValueChange={setProductId} options={[{ value: 'none', label: 'None' }, ...products.data.map((p) => ({ value: p.id, label: p.title ?? p.sourceUrl, hint: p.title ? hostOf(p.sourceUrl) : undefined }))]} />
        </Field>
      )}

      <Field label={productId !== 'none' ? 'Anything to add about the product' : 'What are you selling?'}>
        <div className="relative">
          <Textarea rows={4} value={product} onChange={(e) => setProduct(e.target.value)} maxLength={4000} placeholder="Insulated steel bottle, keeps drinks ice-cold for 24 h, leak-proof lid, $29. Launch offer: 20% off this week." className="pr-12" />
          <Button type="button" size="icon-sm" variant={dict.listening ? 'brand' : 'ghost'} className="absolute top-2 right-2" aria-label="Dictate" onClick={dict.toggle} loading={dict.busy}>
            {dict.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </Button>
        </div>
      </Field>

      {format === 'dialogue' && (
        <Field label="Characters" hint="Pick who talks. Each speaks in their own voice.">
          <div className="flex flex-wrap gap-2">
            {characters.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCharacter(c.id)}
                className={cn('flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition', characterIds.includes(c.id) ? 'border-primary bg-primary/10' : 'hover:border-input')}
                aria-pressed={characterIds.includes(c.id)}
              >
                <CharacterAvatar character={c} className="size-6 text-[11px]" />
                {c.name}
              </button>
            ))}
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setNewCharacter(true)}>
              <Plus className="size-3.5" /> New
            </Button>
          </div>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Platform">
          <Select value={platform} onValueChange={setPlatform} options={PLATFORMS} />
        </Field>
        <Field label="Goal">
          <Select value={goal} onValueChange={setGoal} options={GOALS.map((g) => ({ value: g, label: g }))} />
        </Field>
        <Field label="Length">
          <Segmented size="sm" value={duration} onChange={setDuration} options={['15', '30', '45', '60'].map((d) => ({ value: d, label: `${d}s` }))} />
        </Field>
        <Field label="Language">
          <Select value={language} onValueChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} />
        </Field>
      </div>

      <Field label="Audience">
        <Input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={1000} placeholder="Busy commuters 25–40 who forget to drink water" />
      </Field>

      <button type="button" onClick={() => setMore((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('size-3.5 transition', more && 'rotate-180')} /> Tone, angle and notes
      </button>
      {more && (
        <div className="space-y-3">
          <Field label="Tone">
            <Input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Angle" hint="Optional. Leave empty and the writer picks the strongest one.">
            <Input value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={500} placeholder="Before/after: warm water at 3 pm vs ice-cold at 3 pm" />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Mention free shipping. Avoid medical claims." />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="brand" loading={write.isPending} disabled={!ready} onClick={() => write.mutate()}>
          <PenLine className="size-4" /> Write script
        </Button>
        <LlmPrice task="writeScript" />
        <Button variant="ghost" className="ml-auto" loading={blank.isPending} onClick={() => blank.mutate()}>
          <FilePlus2 className="size-4" /> Blank script
        </Button>
      </div>
      <CharacterDialog open={newCharacter} onOpenChange={setNewCharacter} onSaved={(c) => setCharacterIds((ids) => (ids.length >= 6 ? ids : [...ids, c.id]))} />
    </div>
  );
}
