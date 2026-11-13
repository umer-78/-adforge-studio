'use client';

import { useMutation } from '@tanstack/react-query';
import { BookOpen, Mic, Square, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usedReferences, type EnhancedPrompt } from '@adforge/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useDictation } from '@/lib/hooks/use-dictation';
import { cn } from '@/lib/utils';
import { RecipePicker, type RecipeResult } from './recipe-picker';

export type EnhanceResult = EnhancedPrompt & { id: string | null };

export interface RefCounts {
  images: number;
  audios: number;
  videos: number;
}

/**
 * The prompt field used across studios: voice dictation, one-click enhance with variations,
 * recipes, and @image1-style reference tokens.
 */
export function PromptBox({
  value,
  onChange,
  kind = 'video',
  placeholder = 'Describe the shot: subject, setting, camera move, mood…',
  refs,
  onRecipe,
  onEnhanced,
  context,
  maxLength = 5000,
  minRows = 4,
  enhance = true,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  kind?: 'video' | 'image';
  placeholder?: string;
  refs?: RefCounts;
  onRecipe?: (r: RecipeResult) => void;
  onEnhanced?: (r: EnhanceResult) => void;
  context?: { aspect?: string; durationS?: number; platform?: string; productId?: string };
  maxLength?: number;
  minRows?: number;
  enhance?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [mode, setMode] = useState<'ad' | 'cinematic'>('ad');
  const committed = useRef('');
  const latest = useRef(value);
  useEffect(() => { latest.current = value; });

  const dictation = useDictation((text, final) => {
    const sep = committed.current && !/\s$/.test(committed.current) ? ' ' : '';
    const next = `${committed.current}${sep}${text.trim()}`;
    if (final) committed.current = next;
    onChange(next.slice(0, maxLength));
  });

  const enhanceMut = useMutation({
    mutationFn: (m: 'ad' | 'cinematic') =>
      api.post<EnhanceResult>('/prompts/enhance', {
        idea: value.trim(),
        mode: m,
        ...(context?.aspect ? { aspect: context.aspect } : {}),
        ...(context?.durationS ? { durationS: context.durationS } : {}),
        ...(context?.platform ? { platform: context.platform } : {}),
        ...(context?.productId ? { productId: context.productId } : {}),
        save: true,
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const next = `${before}${pad}${token} ${value.slice(end)}`;
    onChange(next.slice(0, maxLength));
    requestAnimationFrame(() => {
      const pos = before.length + pad.length + token.length + 1;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const used = usedReferences(value);
  const missing = refs
    ? [...used.image.filter((n) => n > refs.images).map((n) => `@image${n}`), ...used.audio.filter((n) => n > refs.audios).map((n) => `@audio${n}`), ...used.video.filter((n) => n > refs.videos).map((n) => `@video${n}`)]
    : [];
  const tokens = refs
    ? [...Array.from({ length: refs.images }, (_, i) => `@image${i + 1}`), ...Array.from({ length: refs.audios }, (_, i) => `@audio${i + 1}`), ...Array.from({ length: refs.videos }, (_, i) => `@video${i + 1}`)]
    : [];

  return (
    <div className={cn('rounded-2xl border bg-surface transition focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/15', dictation.listening && 'border-primary/60', className)}>
      <textarea
        ref={ref}
        value={value}
        maxLength={maxLength}
        rows={minRows}
        placeholder={dictation.listening ? 'Listening… speak your idea' : placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          committed.current = e.target.value;
        }}
        onFocus={() => (committed.current = latest.current)}
        className="block w-full resize-y bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />
      {(tokens.length > 0 || missing.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {tokens.map((t) => (
            <button key={t} type="button" onClick={() => insert(t)} className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary transition hover:bg-primary/20">
              {t}
            </button>
          ))}
          {missing.length > 0 && <span className="text-[11px] text-warning">Not attached: {missing.join(', ')}</span>}
        </div>
      )}
      <div className="flex items-center gap-1 border-t px-2 py-1.5">
        <Tip content={dictation.listening ? 'Stop dictation' : dictation.native ? 'Dictate (live)' : 'Dictate (records, then transcribes)'}>
          <Button
            type="button"
            size="icon-sm"
            variant={dictation.listening ? 'brand' : 'ghost'}
            aria-label="Dictate"
            onClick={() => {
              committed.current = latest.current;
              dictation.toggle();
            }}
            disabled={dictation.busy}
            className={cn(dictation.listening && 'animate-pulse-ring')}
          >
            {dictation.busy ? <Spinner className="size-4" /> : dictation.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </Button>
        </Tip>
        {onRecipe && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRecipesOpen(true)}>
            <BookOpen className="size-4" /> Recipes
          </Button>
        )}
        {enhance && (
          <Button type="button" size="sm" variant="ghost" loading={enhanceMut.isPending} disabled={value.trim().length < 2} onClick={() => enhanceMut.mutate(mode)}>
            <WandSparkles className="size-4" /> Enhance
          </Button>
        )}
        <span className="ml-auto pr-1 text-[11px] text-muted-foreground tabular-nums">
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
      {onRecipe && <RecipePicker open={recipesOpen} onOpenChange={setRecipesOpen} kind={kind} onApply={onRecipe} />}
      <EnhanceDialog
        result={result}
        mode={mode}
        busy={enhanceMut.isPending}
        onMode={(m) => {
          setMode(m);
          enhanceMut.mutate(m);
        }}
        onClose={() => setResult(null)}
        onUse={(prompt) => {
          onChange(prompt.slice(0, maxLength));
          committed.current = prompt;
          if (result) onEnhanced?.({ ...result, prompt });
          setResult(null);
        }}
      />
    </div>
  );
}

function EnhanceDialog({ result, mode, busy, onMode, onClose, onUse }: { result: EnhanceResult | null; mode: 'ad' | 'cinematic'; busy: boolean; onMode: (m: 'ad' | 'cinematic') => void; onClose: () => void; onUse: (prompt: string) => void }) {
  const [pick, setPick] = useState(0);
  const options = result ? [result.prompt, ...result.variations] : [];
  return (
    <Dialog
      open={!!result}
      onOpenChange={(v) => {
        if (!v) onClose();
        setPick(0);
      }}
    >
      <DialogContent wide className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WandSparkles className="size-4 text-primary" /> {result?.title ?? 'Enhanced prompt'}
          </DialogTitle>
          <DialogDescription>Pick the version you like. It is also saved to your prompt library.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <Segmented
            value={mode}
            onChange={onMode}
            options={[
              { value: 'ad', label: 'Ad mode' },
              { value: 'cinematic', label: 'Cinematic' },
            ]}
          />
          {busy && <Spinner className="size-4" />}
        </div>
        {result && (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {result.hook && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="font-medium text-primary">3-second hook: </span>
                {result.hook}
              </div>
            )}
            {options.map((o, i) => (
              <button key={i} type="button" onClick={() => setPick(i)} className={cn('w-full rounded-xl border p-3 text-left text-[13px] leading-relaxed transition hover:border-input', pick === i && 'border-primary bg-primary/5')}>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">{i === 0 ? 'Main prompt' : `Variation ${i}`}</div>
                {o}
              </button>
            ))}
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {Object.entries(result.style).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 p-2">
                  <div className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
                  <div className="mt-0.5 text-foreground/90">{v}</div>
                </div>
              ))}
            </div>
            {result.shotList.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Shot list</div>
                {result.shotList.map((s, i) => (
                  <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{s.durationS}s</Badge>
                    <span className="text-foreground/90">{s.shot}</span>
                    <span>· {s.camera}</span>
                  </div>
                ))}
              </div>
            )}
            {result.negativePrompt && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Avoid: </span>
                {result.negativePrompt}
              </p>
            )}
            {result.notes && <p className="text-xs text-muted-foreground">{result.notes}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep mine
          </Button>
          <Button variant="brand" onClick={() => onUse(options[pick] ?? '')}>
            Use this prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
