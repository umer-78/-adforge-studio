-- Auto-approve can change while a step is running, so it lives in its own column rather than in
-- the steps document the worker rewrites at the end of each step.
alter table public.agent_runs
  add column auto_approve_under_usd numeric(8, 2) not null default 0
    check (auto_approve_under_usd >= 0 and auto_approve_under_usd <= 25);

update public.agent_runs
set auto_approve_under_usd = least(25, greatest(0, coalesce((steps -> 'config' ->> 'autoApproveUnderUsd')::numeric, 0)))
where steps -> 'config' ? 'autoApproveUnderUsd';

create index agent_runs_status_idx on public.agent_runs (workspace_id, status);
