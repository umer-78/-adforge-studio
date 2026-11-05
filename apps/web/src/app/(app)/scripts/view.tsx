'use client';

import { CircleAlert, Clock, FileText, Languages, MessagesSquare, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { languageName } from '@adforge/core';
import { PlatformIcon } from '@/components/app/platform-icon';
import { BriefForm } from '@/components/scripts/brief-form';
import { CharactersPanel } from '@/components/scripts/characters';
import { StatusBadge } from '@/components/scripts/status-badge';
import { formatSeconds, useScripts } from '@/components/scripts/use-scripts';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { ScriptView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

type Tab = 'scripts' | 'characters';
type Filter = 'all' | 'draft' | 'final';

export function ScriptsView() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'characters' ? 'characters' : 'scripts';
  const setTab = (t: Tab) => router.replace(t === 'scripts' ? '/scripts' : '/scripts?tab=characters', { scroll: false });
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const list = useScripts({ q: dq || undefined, status: filter === 'all' ? undefined : filter });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <BriefForm className="self-start xl:sticky xl:top-20" />
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'scripts', label: 'Scripts' }, { value: 'characters', label: 'Characters' }]} />
          {tab === 'scripts' && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'final', label: 'Approved' }]} />
              <div className="relative w-56">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scripts" className="h-8 pl-9" />
              </div>
            </div>
          )}
        </div>
        {tab === 'characters' ? (
          <CharactersPanel />
        ) : list.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<FileText />}
            title={dq || filter !== 'all' ? 'No matching scripts' : 'No scripts yet'}
            description={dq || filter !== 'all' ? 'Try another search or filter.' : 'Describe what you sell and who it is for. You get a timed script with shots, on-screen text, a caption and hashtags.'}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.data.items.map((s) => (
              <ScriptCard key={s.id} script={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ScriptCard({ script: s }: { script: ScriptView }) {
  return (
    <Link href={`/scripts/${s.id}`} className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:text-primary">{s.status === 'generating' && s.title === 'Untitled script' ? 'Writing…' : s.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {s.platform && <PlatformIcon platform={s.platform} className="size-4" />}
            <span className="flex items-center gap-1">
              {s.format === 'dialogue' ? <MessagesSquare className="size-3" /> : <FileText className="size-3" />}
              {s.format === 'dialogue' ? 'Dialogue' : 'Ad script'}
            </span>
            {s.language !== 'en' && (
              <span className="flex items-center gap-1">
                <Languages className="size-3" /> {languageName(s.language)}
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      {s.status === 'failed' ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {s.error ?? 'Writing failed.'}
        </p>
      ) : s.status === 'generating' ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : (
        s.hook && <p className="line-clamp-2 text-sm text-muted-foreground">“{s.hook}”</p>
      )}
      <div className="mt-auto flex items-center gap-3 text-[11px] text-muted-foreground">
        {s.lineCount > 0 && <span>{s.lineCount} lines</span>}
        {s.durationS > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {formatSeconds(s.durationS)}
          </span>
        )}
        {s.timelineId && <Badge variant="outline">In editor</Badge>}
        <span className="ml-auto">{timeAgo(s.updatedAt)}</span>
      </div>
    </Link>
  );
}
