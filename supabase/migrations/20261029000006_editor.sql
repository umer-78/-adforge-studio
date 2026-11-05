-- Editor: templates, brand kits, timelines (JSON document), snapshots, renders.

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('timeline', 'motion', 'caption_style', 'text_preset', 'mockup_scene')),
  name text not null,
  description text,
  aspect text check (aspect in ('9:16', '1:1', '4:5', '16:9')),
  category text,
  data jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  is_builtin boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_builtin = (workspace_id is null))
);
create index templates_workspace_kind_idx on public.templates (workspace_id, kind);
create index templates_created_by_idx on public.templates (created_by);

create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default 'Brand kit',
  is_default boolean not null default false,
  logo_asset_id uuid references public.assets (id) on delete set null,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '{}'::jsonb,
  intro_asset_id uuid references public.assets (id) on delete set null,
  outro_asset_id uuid references public.assets (id) on delete set null,
  watermark_asset_id uuid references public.assets (id) on delete set null,
  watermark jsonb not null default '{"position":"bottom-right","opacity":0.8,"scale":0.12}'::jsonb,
  caption_style jsonb not null default '{}'::jsonb,
  tone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brand_kits_workspace_idx on public.brand_kits (workspace_id);
create unique index brand_kits_one_default_idx on public.brand_kits (workspace_id) where is_default;
create index brand_kits_logo_asset_id_idx on public.brand_kits (logo_asset_id);
create index brand_kits_intro_asset_id_idx on public.brand_kits (intro_asset_id);
create index brand_kits_outro_asset_id_idx on public.brand_kits (outro_asset_id);
create index brand_kits_watermark_asset_id_idx on public.brand_kits (watermark_asset_id);

create table public.timelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  template_id uuid references public.templates (id) on delete set null,
  name text not null default 'Untitled edit',
  data jsonb not null,
  version integer not null default 1,
  width integer not null default 1080 check (width between 16 and 7680),
  height integer not null default 1920 check (height between 16 and 7680),
  fps numeric(6, 3) not null default 30 check (fps between 1 and 120),
  duration_s numeric(10, 3) not null default 0,
  aspect text not null default '9:16',
  thumbnail_asset_id uuid references public.assets (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index timelines_workspace_idx on public.timelines (workspace_id, updated_at desc);
create index timelines_project_id_idx on public.timelines (project_id);
create index timelines_template_id_idx on public.timelines (template_id);
create index timelines_thumbnail_asset_id_idx on public.timelines (thumbnail_asset_id);
create index timelines_created_by_idx on public.timelines (created_by);

alter table public.scripts
  add constraint scripts_timeline_id_fkey
  foreign key (timeline_id) references public.timelines (id) on delete set null;

create table public.timeline_snapshots (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version integer not null,
  data jsonb not null,
  label text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index timeline_snapshots_timeline_idx on public.timeline_snapshots (timeline_id, created_at desc);
create index timeline_snapshots_workspace_idx on public.timeline_snapshots (workspace_id);
create index timeline_snapshots_created_by_idx on public.timeline_snapshots (created_by);

create table public.renders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  timeline_id uuid references public.timelines (id) on delete set null,
  preset text not null,
  format text not null check (format in ('mp4', 'mov', 'gif', 'webm')),
  width integer not null,
  height integer not null,
  fps numeric(6, 3) not null,
  timeline_version integer,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  progress numeric(5, 2) not null default 0,
  output_asset_id uuid references public.assets (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index renders_workspace_idx on public.renders (workspace_id, created_at desc);
create index renders_timeline_id_idx on public.renders (timeline_id);
create index renders_output_asset_id_idx on public.renders (output_asset_id);
create index renders_job_id_idx on public.renders (job_id);
create index renders_created_by_idx on public.renders (created_by);

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();
create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();
create trigger timelines_updated_at before update on public.timelines
  for each row execute function public.set_updated_at();
create trigger renders_updated_at before update on public.renders
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['brand_kits', 'timelines', 'timeline_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "%1$s: editors insert" on public.%1$I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors update" on public.%1$I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors delete" on public.%1$I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;

alter table public.renders enable row level security;
create policy "renders: members read" on public.renders
  for select to authenticated using (public.is_workspace_member(workspace_id));

alter table public.templates enable row level security;
create policy "templates: read builtin and own" on public.templates
  for select to authenticated using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy "templates: editors insert" on public.templates
  for insert to authenticated with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy "templates: editors update" on public.templates
  for update to authenticated
  using (workspace_id is not null and public.can_edit_workspace(workspace_id))
  with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy "templates: editors delete" on public.templates
  for delete to authenticated using (workspace_id is not null and public.can_edit_workspace(workspace_id));
