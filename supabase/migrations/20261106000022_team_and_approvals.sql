-- Team invites, and posts that wait for an admin's approval before they go out.

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invites_open on public.workspace_invites (workspace_id) where accepted_at is null and revoked_at is null;

alter table public.workspace_invites enable row level security;
create policy "workspace_invites: admins read" on public.workspace_invites for select to authenticated using (private.is_workspace_admin(workspace_id));

-- Posts: a status for waiting on approval, and who reviewed them.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%draft%'
  loop
    execute format('alter table public.posts drop constraint %I', c);
  end loop;
end $$;
alter table public.posts add constraint posts_status_check check (status in (
  'draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'canceled'
));
alter table public.posts
  add column submitted_by uuid references auth.users(id) on delete set null,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or char_length(review_note) <= 1000);

-- True when the signed-in user belongs to a workspace someone else owns (they joined by invite).
create or replace function public.has_joined_workspace()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.user_id = auth.uid() and w.owner_id <> auth.uid()
  );
$$;
revoke all on function public.has_joined_workspace() from public, anon;
grant execute on function public.has_joined_workspace() to authenticated, service_role;
