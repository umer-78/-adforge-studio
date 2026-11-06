-- Data deletion requests that Meta sends when someone removes the app in their Facebook settings.
-- Only the confirmation code and the outcome are kept, so the person can check the status on
-- /data-deletion?code=… without anything about them being stored.
create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9]{16,40}$'),
  source text not null check (source in ('meta')),
  status text not null default 'received' check (status in ('received', 'completed')),
  accounts_removed integer not null default 0 check (accounts_removed >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index data_deletion_requests_created_at_idx on public.data_deletion_requests (created_at);

-- No policies: only the service role reads and writes these rows.
alter table public.data_deletion_requests enable row level security;
