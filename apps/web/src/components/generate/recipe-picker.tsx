'use client';

import { BookOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fillRecipe, PROMPT_RECIPES, type AspectRatio, type PromptRecipe } from '@adforge/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export interface RecipeResult {
  recipe: PromptRecipe;
  prompt: string;
  aspect: AspectRatio;
  durationS?: number;
}

/** Fill-in-the-blank prompt templates for proven ad shots. */
export function RecipePicker({ open, onOpenChange, kind, onApply }: { open: boolean; onOpenChange: (v: boolean) => void; kind: 'video' | 'image'; onApply: (r: RecipeResult) => void }) {
  const recipes = useMemo(() => PROMPT_RECIPES.filter((r) => r.kind === kind), [kind]);
  const categories = useMemo(() => ['All', ...new Set(recipes.map((r) => r.category))], [recipes]);
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setSelectedId((id) => (id && recipes.some((r) => r.id === id) ? id : (recipes[0]?.id ?? null)));
      setValues({});
    }
  }, [open, recipes]);
  const visible = recipes.filter((r) => category === 'All' || r.category === category);
  const selected = recipes.find((r) => r.id === selectedId) ?? null;
  const preview = selected ? fillRecipe(selected, values) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> Prompt recipes
          </DialogTitle>
          <DialogDescription>Start from a shot that works, then fill in your product. Tokens like @image1 point at the reference images you attach.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={cn('h-7 rounded-full border px-3 text-xs font-medium transition', c === category ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {c}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {visible.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedId(r.id);
                  setValues({});
                }}
                className={cn('w-full rounded-xl border p-3 text-left transition hover:border-input', r.id === selectedId && 'border-primary bg-primary/5')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge variant="outline">{r.category}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              </button>
            ))}
          </div>
          {selected && (
            <div className="space-y-3">
              {selected.slots.map((s) => (
                <Field key={s.key} label={s.label}>
                  <Input value={values[s.key] ?? ''} placeholder={s.placeholder} onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))} />
                </Field>
              ))}
              <div className="rounded-xl border bg-surface-2 p-3 text-[13px] leading-relaxed text-foreground/90">{preview}</div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Aspect {selected.aspect}</span>
                {selected.durationS && <span>· {selected.durationS} s</span>}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onApply({ recipe: selected, prompt: preview, aspect: selected.aspect, ...(selected.durationS ? { durationS: selected.durationS } : {}) });
              onOpenChange(false);
            }}
          >
            Use recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
