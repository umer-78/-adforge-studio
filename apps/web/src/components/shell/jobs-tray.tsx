'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CircleAlert, CircleCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api-client';
import type { JobView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

export function useJobs(status: 'active' | 'recent' = 'recent') {
  return useQuery({ queryKey: ['jobs', status], queryFn: () => api.get<{ items: JobView[] }>(`/jobs?status=${status}&limit=30`), refetchInterval: 20_000 });
}

export function JobRow({ job, compact }: { job: JobView; compact?: boolean }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.post(`/jobs/${job.id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
  const active = job.status === 'queued' || job.status === 'running';
  return (
    <div className={cn('group rounded-lg px-2 py-2', !compact && 'hover:bg-accent/60')}>
      <div className="flex items-center gap-2">
        {job.status === 'succeeded' ? (
          <CircleCheck className="size-4 shrink-0 text-success" />
        ) : job.status === 'failed' ? (
          <CircleAlert className="size-4 shrink-0 text-destructive" />
        ) : job.status === 'canceled' ? (
          <X className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <span className="absolute size-2 animate-ping rounded-full bg-primary/60" />
            <span className="size-2 rounded-full bg-primary" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{job.label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {job.status === 'failed' ? job.error : active ? (job.progressMessage ?? (job.status === 'queued' ? 'Waiting for a worker…' : 'Working…')) : timeAgo(job.completedAt ?? job.createdAt)}
          </div>
        </div>
        {active && (
          <Button size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100" title="Cancel" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            <X />
          </Button>
        )}
      </div>
      {active && <Progress className="mt-2 h-1" value={job.progress} indeterminate={job.status === 'queued' || job.progress <= 0} />}
    </div>
  );
}

export function JobsTray() {
  const { data } = useJobs('recent');
  const jobs = data?.items ?? [];
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Background jobs">
          <Activity className={cn(active.length && 'text-primary')} />
          {active.length > 0 && <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{active.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-2">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <div className="text-sm font-semibold">Background jobs</div>
          <div className="text-xs text-muted-foreground">{active.length ? `${active.length} running` : 'All done'}</div>
        </div>
        <div className="max-h-[60vh] space-y-0.5 overflow-y-auto scrollbar-thin">
          {jobs.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Uploads, generations, renders and posts show up here.</p>}
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
