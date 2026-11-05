-- Durable job queue (claimed by the worker with SKIP LOCKED), usage ledger,
-- webhook idempotency, rate limiting and the activity feed.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  progress numeric(5, 2) not null default 0 check (progress between 0 and 100),
  progress_message text,
  result jsonb,
  error text,
  idempotency_key text unique,
  parent_job_id uuid references public.jobs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (priority desc, run_at) where status = 'queued';
create index jobs_lease_idx on public.jobs (locked_until) where status = 'running';
create index jobs_workspace_created_idx on public.jobs (workspace_id, created_at desc);
create index jobs_parent_job_id_idx on public.jobs (parent_job_id);
create index jobs_created_by_idx on public.jobs (created_by);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Claims up to p_limit runnable jobs for one worker. Expired leases are
-- returned to the queue first (or failed once attempts are exhausted), which
-- makes crashed workers safe: every job handler must be idempotent.
create or replace function public.claim_jobs(
  p_worker text,
  p_types text[] default null,
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
  set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      error = concat_ws(E'\n', error, 'lease expired (worker ' || coalesce(locked_by, '?') || ')'),
      completed_at = case when attempts >= max_attempts then now() else completed_at end,
      locked_by = null,
      locked_until = null
  where status = 'running' and locked_until < now();

  return query
  with next_jobs as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.run_at <= now()
      and (p_types is null or j.type = any (p_types))
    order by j.priority desc, j.run_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_by = p_worker,
      locked_until = now() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(j.started_at, now())
  from next_jobs
  where j.id = next_jobs.id
  returning j.*;
end;
$$;
revoke all on function public.claim_jobs(text, text[], integer, integer) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, text[], integer, integer) to service_role;

-- Money spent per workspace. Every provider call writes one row.
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'generation', 'llm', 'transcription', 'embedding', 'moderation', 'tts',
    'music', 'render', 'storage', 'streaming', 'publish', 'other'
  )),
  provider text not null,
  model text,
  units numeric(14, 4) not null default 0,
  unit text not null default 'request',
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  is_estimate boolean not null default false,
  generation_id uuid,
  job_id uuid references public.jobs (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_ledger_workspace_created_idx on public.usage_ledger (workspace_id, created_at desc);
create index usage_ledger_user_id_idx on public.usage_ledger (user_id);
create index usage_ledger_job_id_idx on public.usage_ledger (job_id);
create index usage_ledger_generation_id_idx on public.usage_ledger (generation_id);

create or replace function public.workspace_month_spend(ws uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.cost_usd), 0)
  from public.usage_ledger l
  where l.workspace_id = ws
    and l.created_at >= date_trunc('month', now());
$$;

-- Webhook deliveries, unique per provider event id, so retries are no-ops.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

-- Fixed-window rate limiting, called by the server with the service role.
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  verb text not null,
  object_type text not null,
  object_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_workspace_created_idx on public.activity (workspace_id, created_at desc);
create index activity_actor_id_idx on public.activity (actor_id);

alter table public.jobs enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.webhook_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.activity enable row level security;

-- Clients may watch their jobs, spend and activity; only the server writes.
create policy "jobs: members read" on public.jobs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "usage_ledger: members read" on public.usage_ledger
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "activity: members read" on public.activity
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- webhook_events and rate_limits have no policies: service role only.
