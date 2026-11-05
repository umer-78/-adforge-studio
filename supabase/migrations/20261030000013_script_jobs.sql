-- Scripts are written by the worker: track generation state and the job.

alter table public.scripts drop constraint scripts_status_check;
alter table public.scripts
  add constraint scripts_status_check check (status in ('generating', 'draft', 'final', 'failed')),
  add column error text,
  add column job_id uuid references public.jobs (id) on delete set null;
create index scripts_job_id_idx on public.scripts (job_id);
