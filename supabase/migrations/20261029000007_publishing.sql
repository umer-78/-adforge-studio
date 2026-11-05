-- Social publishing, encrypted credentials and the new-user bootstrap.

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'x', 'pinterest')),
  provider text not null default 'native' check (provider in ('native', 'ayrshare')),
  external_id text not null,
  handle text,
  display_name text,
  avatar_url text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  status_detail text,
  meta jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);
create index social_accounts_connected_by_idx on public.social_accounts (connected_by);

-- OAuth tokens live apart from social_accounts so no client policy can
-- ever expose them. Values are AES-256-GCM ciphertext produced by the server.
create table public.social_account_tokens (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Short-lived OAuth state + PKCE verifier, consumed by the callback route.
create table public.oauth_states (
  state text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  code_verifier text,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create index oauth_states_workspace_id_idx on public.oauth_states (workspace_id);
create index oauth_states_user_id_idx on public.oauth_states (user_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  asset_id uuid references public.assets (id) on delete set null,
  render_id uuid references public.renders (id) on delete set null,
  title text,
  caption text not null default '',
  hashtags text[] not null default '{}',
  status text not null default 'draft' check (status in (
    'draft', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'canceled'
  )),
  scheduled_at timestamptz,
  published_at timestamptz,
  ab_group uuid,
  ab_variant text check (ab_variant in ('A', 'B', 'C', 'D')),
  ai_generated_label boolean not null default false,
  rights_acknowledged boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_workspace_schedule_idx on public.posts (workspace_id, scheduled_at);
create index posts_due_idx on public.posts (scheduled_at) where status = 'scheduled';
create index posts_ab_group_idx on public.posts (ab_group);
create index posts_project_id_idx on public.posts (project_id);
create index posts_asset_id_idx on public.posts (asset_id);
create index posts_render_id_idx on public.posts (render_id);
create index posts_created_by_idx on public.posts (created_by);

create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform text not null,
  caption_override text,
  hashtags_override text[],
  options jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'publishing', 'processing', 'published', 'failed', 'canceled')),
  external_id text,
  external_url text,
  error text,
  attempts integer not null default 0,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  metrics_updated_at timestamptz,
  job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index post_targets_workspace_idx on public.post_targets (workspace_id, status);
create index post_targets_social_account_id_idx on public.post_targets (social_account_id);
create index post_targets_job_id_idx on public.post_targets (job_id);

create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.post_targets (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  ctr numeric(8, 5),
  watch_time_s numeric(14, 2),
  raw jsonb not null default '{}'::jsonb
);
create index post_metrics_target_idx on public.post_metrics (post_target_id, captured_at desc);
create index post_metrics_workspace_idx on public.post_metrics (workspace_id, captured_at desc);

-- Bring-your-own provider keys (fal, Replicate, ElevenLabs, LLMs, Mux...).
create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  label text,
  key_hint text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
create index provider_credentials_created_by_idx on public.provider_credentials (created_by);

create table public.provider_secrets (
  credential_id uuid primary key references public.provider_credentials (id) on delete cascade,
  secret_enc text not null,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.set_updated_at();
create trigger social_account_tokens_updated_at before update on public.social_account_tokens
  for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
create trigger post_targets_updated_at before update on public.post_targets
  for each row execute function public.set_updated_at();
create trigger provider_credentials_updated_at before update on public.provider_credentials
  for each row execute function public.set_updated_at();
create trigger provider_secrets_updated_at before update on public.provider_secrets
  for each row execute function public.set_updated_at();

alter table public.social_accounts enable row level security;
alter table public.social_account_tokens enable row level security;
alter table public.oauth_states enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
alter table public.post_metrics enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.provider_secrets enable row level security;

-- Connections are created by the OAuth callback (service role); clients read them.
create policy "social_accounts: members read" on public.social_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "provider_credentials: members read" on public.provider_credentials
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "post_metrics: members read" on public.post_metrics
  for select to authenticated using (public.is_workspace_member(workspace_id));

do $$
declare
  t text;
begin
  foreach t in array array['posts', 'post_targets'] loop
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "%1$s: editors insert" on public.%1$I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors update" on public.%1$I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors delete" on public.%1$I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;
-- social_account_tokens, oauth_states and provider_secrets: no policies (service role only).

-- New user bootstrap: personal workspace, owner membership, profile, brand kit.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_display_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'creator'), '@', 1)
  );
  v_slug text := trim(both '-' from lower(regexp_replace(split_part(coalesce(new.email, 'studio'), '@', 1), '[^a-zA-Z0-9]+', '-', 'g')));
begin
  if v_slug = '' then
    v_slug := 'studio';
  end if;
  v_slug := left(v_slug, 60) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.workspaces (name, slug, owner_id)
  values (left(v_display_name || '''s Studio', 120), v_slug, new.id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  insert into public.profiles (id, full_name, avatar_url, default_workspace_id)
  values (
    new.id,
    v_display_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_workspace_id
  );

  insert into public.brand_kits (workspace_id, name, is_default, colors, fonts)
  values (
    v_workspace_id,
    'Default brand kit',
    true,
    '[{"name":"Primary","hex":"#7C5CFF"},{"name":"Accent","hex":"#22D3EE"},{"name":"Ink","hex":"#0B0B12"},{"name":"Paper","hex":"#F5F5FA"}]'::jsonb,
    '{"display":"Unbounded","body":"Geist"}'::jsonb
  );

  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
