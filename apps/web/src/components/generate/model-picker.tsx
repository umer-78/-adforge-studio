'use client';

import { Check, ChevronsUpDown, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatUsd } from '@adforge/core';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ModelView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatEta } from './cost-estimate';

const PROVIDER_LABEL: Record<string, string> = { fal: 'fal.ai', replicate: 'Replicate', agnes: 'Agnes AI', elevenlabs: 'ElevenLabs', openai: 'OpenAI', anthropic: 'Anthropic' };

/** Model list with price, speed and whether its provider key is set. */
export function ModelPicker({ models, value, onChange, className }: { models: ModelView[]; value: string | undefined; onChange: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.id === value);
  const sorted = [...models].sort((a, b) => Number(b.available) - Number(a.available) || Number(b.recommended) - Number(a.recommended));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('flex w-full items-center gap-3 rounded-xl border bg-surface px-3 py-2 text-left transition hover:border-input', className)}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{current?.label ?? 'Choose a model'}</div>
            <div className="truncate text-xs text-muted-foreground">{current ? `${current.vendor} · ${current.available ? `from ${formatUsd(current.fromUsd)}` : 'needs a provider key'}` : `${models.length} models`}</div>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-1.5">
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {sorted.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!m.available}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={cn('flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:hover:bg-transparent', m.id === value && 'bg-accent')}
            >
              <div className={cn('min-w-0 flex-1', !m.available && 'opacity-55')}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.label}</span>
                  {m.recommended && <Badge variant="brand">Recommended</Badge>}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.description}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">{m.vendor} via {PROVIDER_LABEL[m.provider] ?? m.provider}</span>
                  {m.badges.slice(0, 3).map((b) => (
                    <Badge key={b} variant="outline" className="h-4 px-1.5 text-[10px]">
                      {b}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {m.available ? (
                  <>
                    <div className="text-xs font-semibold tabular-nums">{m.fromUsd > 0 ? formatUsd(m.fromUsd) : 'Varies'}</div>
                    {m.etaS > 0 && <div className="text-[11px] text-muted-foreground">{formatEta(m.etaS)}</div>}
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <KeyRound className="size-3" /> Key needed
                  </span>
                )}
                {m.id === value && <Check className="ml-auto mt-1 size-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>
        {sorted.some((m) => !m.available) && (
          <div className="border-t px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
            Greyed-out models need a provider key.{' '}
            <Link href="/settings/providers" className="font-medium text-primary hover:underline" onClick={() => setOpen(false)}>
              Add one in Settings
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
