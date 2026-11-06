-- Link-in-bio pages: a public page of links with view and click counts.

create table public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  title text not null default '' check (char_length(title) <= 80),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_asset_id uuid references public.assets(id) on delete set null,
  theme jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  views bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bio_pages_workspace on public.bio_pages (workspace_id);

create table public.bio_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.bio_pages(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  url text not null check (char_length(url) <= 2000 and url ~* '^https?://'),
  position integer not null default 0,
  enabled boolean not null default true,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bio_links_page on public.bio_links (page_id, position);

-- One row per page per day for views (link_id null) and per link per day for clicks.
create table public.bio_daily (
  page_id uuid not null references public.bio_pages(id) on delete cascade,
  link_id uuid references public.bio_links(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  constraint bio_daily_key unique nulls not distinct (page_id, link_id, day)
);

create trigger bio_pages_updated_at before update on public.bio_pages for each row execute function public.set_updated_at();
create trigger bio_links_updated_at before update on public.bio_links for each row execute function public.set_updated_at();

alter table public.bio_pages enable row level security;
alter table public.bio_links enable row level security;
alter table public.bio_daily enable row level security;

create policy "bio_pages: members read" on public.bio_pages for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "bio_pages: editors write" on public.bio_pages for all to authenticated using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy "bio_links: members read" on public.bio_links for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "bio_links: editors write" on public.bio_links for all to authenticated using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy "bio_daily: members read" on public.bio_daily for select to authenticated
  using (exists (select 1 from public.bio_pages p where p.id = page_id and private.is_workspace_member(p.workspace_id)));

-- Counts a page view (no link) or a link click. Only the server calls it, after its own checks.
create or replace function public.bio_track(p_page uuid, p_link uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bio_daily (page_id, link_id, day, count)
  values (p_page, p_link, (now() at time zone 'utc')::date, 1)
  on conflict (page_id, link_id, day) do update set count = public.bio_daily.count + 1;
  if p_link is null then
    update public.bio_pages set views = views + 1 where id = p_page;
  else
    update public.bio_links set clicks = clicks + 1 where id = p_link and page_id = p_page;
  end if;
end;
$$;
revoke all on function public.bio_track(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bio_track(uuid, uuid) to service_role;
