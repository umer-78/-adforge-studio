-- Media library: projects, folders, assets (+ versions, embeddings, shares),
-- plus the licenses, consents and generations that assets reference.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  color text,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_idx on public.projects (workspace_id, created_at desc);
create index projects_created_by_idx on public.projects (created_by);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index folders_workspace_idx on public.folders (workspace_id);
create index folders_project_id_idx on public.folders (project_id);
create index folders_parent_id_idx on public.folders (parent_id);

-- Usage rights for audio and other media. Publishing warns when audio has
-- no license with commercial_use = true.
create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('generated', 'owned', 'licensed', 'royalty_free', 'public_domain', 'unknown')),
  commercial_use boolean not null default false,
  source text,
  provider text,
  terms_url text,
  proof_asset_id uuid,
  notes text,
  territories text[] not null default '{}',
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index licenses_workspace_idx on public.licenses (workspace_id);
create index licenses_created_by_idx on public.licenses (created_by);
create index licenses_proof_asset_id_idx on public.licenses (proof_asset_id);

-- Recorded consent for voice cloning, face likeness and lip-synced dubbing.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('voice_clone', 'face_likeness', 'lipsync_dub')),
  subject_name text not null,
  is_self boolean not null default true,
  statement text not null,
  evidence_asset_id uuid,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index consents_workspace_idx on public.consents (workspace_id, kind);
create index consents_accepted_by_idx on public.consents (accepted_by);
create index consents_evidence_asset_id_idx on public.consents (evidence_asset_id);

-- One row per AI provider run (one per variant).
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  capability text not null,
  provider text not null,
  model text not null,
  prompt text,
  negative_prompt text,
  params jsonb not null default '{}'::jsonb,
  input_asset_ids uuid[] not null default '{}',
  output_asset_ids uuid[] not null default '{}',
  output jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  progress numeric(5, 2) not null default 0,
  cost_estimate_usd numeric(12, 4),
  cost_actual_usd numeric(12, 4),
  eta_seconds integer,
  provider_request_id text,
  error text,
  variant_group uuid,
  variant_index integer not null default 0,
  seed bigint,
  source_ref jsonb not null default '{}'::jsonb,
  job_id uuid references public.jobs (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generations_workspace_created_idx on public.generations (workspace_id, created_at desc);
create index generations_variant_group_idx on public.generations (variant_group);
create index generations_provider_request_idx on public.generations (provider, provider_request_id);
create index generations_project_id_idx on public.generations (project_id);
create index generations_created_by_idx on public.generations (created_by);
create index generations_job_id_idx on public.generations (job_id);

alter table public.usage_ledger
  add constraint usage_ledger_generation_id_fkey
  foreign key (generation_id) references public.generations (id) on delete set null;

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  folder_id uuid references public.folders (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  type text not null check (type in ('video', 'image', 'audio', 'model3d')),
  source text not null default 'upload'
    check (source in ('upload', 'generated', 'render', 'recording', 'import', 'derived')),
  name text not null check (char_length(name) between 1 and 300),
  description text,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  derived_bytes bigint not null default 0 check (derived_bytes >= 0),
  storage_driver text not null default 'supabase' check (storage_driver in ('supabase', 's3')),
  storage_key text not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  processing_error text,
  upload_state jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  duration_s numeric(12, 3),
  width integer,
  height integer,
  fps numeric(8, 3),
  thumbnail_key text,
  preview_key text,
  proxy_key text,
  hls_key text,
  waveform_key text,
  playback jsonb not null default '{}'::jsonb,
  transcript text,
  transcript_segments jsonb,
  transcript_language text,
  ai_caption text,
  ai_tags text[] not null default '{}',
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  version integer not null default 1 check (version >= 1),
  parent_asset_id uuid references public.assets (id) on delete set null,
  generation_id uuid references public.generations (id) on delete set null,
  license_id uuid references public.licenses (id) on delete set null,
  is_ai_generated boolean not null default false,
  search_vector tsvector,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assets_workspace_list_idx on public.assets (workspace_id, deleted_at, created_at desc);
create index assets_workspace_type_idx on public.assets (workspace_id, type);
create index assets_project_id_idx on public.assets (project_id);
create index assets_folder_id_idx on public.assets (folder_id);
create index assets_created_by_idx on public.assets (created_by);
create index assets_parent_asset_id_idx on public.assets (parent_asset_id);
create index assets_generation_id_idx on public.assets (generation_id);
create index assets_license_id_idx on public.assets (license_id);
create index assets_tags_idx on public.assets using gin (tags);
create index assets_ai_tags_idx on public.assets using gin (ai_tags);
create index assets_search_idx on public.assets using gin (search_vector);
create index assets_name_trgm_idx on public.assets using gin (name extensions.gin_trgm_ops);

alter table public.licenses
  add constraint licenses_proof_asset_id_fkey
  foreign key (proof_asset_id) references public.assets (id) on delete set null;
alter table public.consents
  add constraint consents_evidence_asset_id_fkey
  foreign key (evidence_asset_id) references public.assets (id) on delete set null;

create or replace function public.assets_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple'::regconfig, coalesce(new.name, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, array_to_string(new.tags, ' ')), 'A')
    || setweight(to_tsvector('simple'::regconfig, array_to_string(new.ai_tags, ' ')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.ai_caption, '') || ' ' || coalesce(new.description, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.transcript, '')), 'C');
  return new;
end;
$$;
create trigger assets_search_vector_trg
  before insert or update of name, tags, ai_tags, ai_caption, description, transcript on public.assets
  for each row execute function public.assets_search_vector();
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

create table public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version integer not null check (version >= 1),
  storage_key text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  meta jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);
create index asset_versions_workspace_idx on public.asset_versions (workspace_id);
create index asset_versions_created_by_idx on public.asset_versions (created_by);

-- Text embedding of each asset's caption, tags and transcript, for search by meaning.
create table public.asset_embeddings (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  model text not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now()
);
create index asset_embeddings_workspace_idx on public.asset_embeddings (workspace_id);
create index asset_embeddings_hnsw_idx on public.asset_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  token text not null unique check (char_length(token) >= 24),
  password_hash text,
  expires_at timestamptz,
  allow_download boolean not null default true,
  view_count integer not null default 0,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((asset_id is not null) <> (project_id is not null))
);
create index share_links_workspace_idx on public.share_links (workspace_id);
create index share_links_asset_id_idx on public.share_links (asset_id);
create index share_links_project_id_idx on public.share_links (project_id);
create index share_links_created_by_idx on public.share_links (created_by);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger folders_updated_at before update on public.folders
  for each row execute function public.set_updated_at();
create trigger licenses_updated_at before update on public.licenses
  for each row execute function public.set_updated_at();
create trigger generations_updated_at before update on public.generations
  for each row execute function public.set_updated_at();

-- Standard workspace policies: members read, owners/admins/editors write.
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'folders', 'licenses', 'assets', 'share_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "%1$s: editors insert" on public.%1$I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors update" on public.%1$I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors delete" on public.%1$I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;

-- Read-only for clients; the server records consents, generations, versions and embeddings.
do $$
declare
  t text;
begin
  foreach t in array array['consents', 'generations', 'asset_versions', 'asset_embeddings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
  end loop;
end;
$$;
