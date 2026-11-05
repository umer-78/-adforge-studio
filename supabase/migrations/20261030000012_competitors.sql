-- Competitor tracker: brands whose ads are watched in Meta's Ad Library,
-- plus manual entries for TikTok and other platforms.

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  website text check (website is null or website ~* '^https?://'),
  meta_page_id text check (meta_page_id is null or meta_page_id ~ '^[0-9]{1,40}$'),
  tiktok_handle text check (tiktok_handle is null or char_length(tiktok_handle) <= 60),
  countries text[] not null default array['DE', 'FR', 'IE']
    check (cardinality(countries) between 1 and 30),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  ad_count integer not null default 0,
  active_ad_count integer not null default 0,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competitors_workspace_idx on public.competitors (workspace_id, created_at desc);
create index competitors_created_by_idx on public.competitors (created_by);

create trigger competitors_updated_at before update on public.competitors
  for each row execute function public.set_updated_at();

alter table public.inspiration_ads
  add column competitor_id uuid references public.competitors (id) on delete set null,
  add column started_at timestamptz,
  add column stopped_at timestamptz;
create index inspiration_ads_competitor_idx on public.inspiration_ads (competitor_id, started_at);
-- One row per library ad per workspace, so syncs update instead of duplicating.
create unique index inspiration_ads_external_uniq
  on public.inspiration_ads (workspace_id, platform, external_id);

alter table public.competitors enable row level security;
create policy "competitors: members read" on public.competitors
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "competitors: editors insert" on public.competitors
  for insert to authenticated with check (private.can_edit_workspace(workspace_id));
create policy "competitors: editors update" on public.competitors
  for update to authenticated
  using (private.can_edit_workspace(workspace_id))
  with check (private.can_edit_workspace(workspace_id));
create policy "competitors: editors delete" on public.competitors
  for delete to authenticated using (private.can_edit_workspace(workspace_id));

alter publication supabase_realtime add table public.competitors, public.inspiration_ads;
