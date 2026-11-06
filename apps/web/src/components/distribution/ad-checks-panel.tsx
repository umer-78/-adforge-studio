'use client';

import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';
import { adChecksOf, checkAdPolicy, type AdChecks, type CheckStatus } from '@adforge/core';
import { StatusIcon } from '@/components/library/ad-checks';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { AssetView } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Line {
  key: string;
  status: CheckStatus;
  text: string;
  hint?: string;
  href?: string;
}

/** Wording rules on the post's text, plus the saved flash, loudness and sound-off checks of its media. */
export function AdChecksPanel({ text, assets }: { text: string; assets: (AssetView | null)[] }) {
  const copy = useDebounced(text, 400);
  const findings = useMemo(() => checkAdPolicy(copy), [copy]);
  const media = assets.filter((a): a is AssetView => !!a && a.type === 'video');
  const details = useQueries({
    queries: media.map((a) => ({ queryKey: ['asset', a.id], queryFn: () => api.get<{ meta: Record<string, unknown> }>(`/assets/${a.id}`), staleTime: 30_000 })),
  });
  const lines: Line[] = findings.map((f) => ({ key: f.id, status: f.severity === 'high' ? 'fail' : f.severity === 'medium' ? 'warn' : 'warn', text: `${f.title}: “${f.match}”`, hint: f.detail }));
  media.forEach((a, i) => {
    const checks: AdChecks | null = adChecksOf(details[i]?.data?.meta);
    const name = media.length > 1 ? `${a.name}: ` : '';
    const href = `/library/${a.id}`;
    if (!checks) {
      if (details[i]?.isSuccess) lines.push({ key: `${a.id}-none`, status: 'none', text: `${name}media checks have not run yet`, href });
      return;
    }
    if (checks.flash && checks.flash.status !== 'pass') lines.push({ key: `${a.id}-flash`, status: checks.flash.status, text: `${name}${checks.flash.status === 'fail' ? 'Rapid flashing that can trigger seizures' : 'Flashing close to the safe limit'}`, href });
    if (checks.loudness.status === 'warn' || checks.loudness.status === 'fail') lines.push({ key: `${a.id}-loud`, status: checks.loudness.status, text: `${name}${checks.loudness.message}`, href });
    if (checks.soundOff.status === 'warn') lines.push({ key: `${a.id}-muted`, status: 'warn', text: `${name}${checks.soundOff.message}`, href });
    for (const f of checks.policy.findings) lines.push({ key: `${a.id}-${f.id}`, status: f.severity === 'high' ? 'fail' : 'warn', text: `${name}Said in the video: ${f.title.toLowerCase()} (“${f.match}”)`, hint: f.detail, href });
  });
  const clean = lines.length === 0;
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Ad checks</h3>
        <span className="text-[11px] text-muted-foreground">Wording, flashing, loudness, sound off</span>
      </div>
      {clean ? (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <StatusIcon status="pass" /> Nothing found that ad networks usually reject or that would hurt viewers.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start gap-2 text-xs">
              <StatusIcon status={l.status} />
              <span className={cn('min-w-0 flex-1', l.status === 'none' && 'text-muted-foreground')}>
                {l.hint ? (
                  <Tip content={l.hint}>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">{l.text}</span>
                  </Tip>
                ) : (
                  l.text
                )}
                {l.href && (
                  <>
                    {' '}
                    <Link href={l.href} className="text-primary hover:underline">
                      Fix
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Rule-based and free. Each network still reviews the ad under its own policies.</p>
    </section>
  );
}
