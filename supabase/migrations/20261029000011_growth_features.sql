-- Growth features: product import (URL-to-video), competitor ad library,
-- ad blueprints (Ad Clone), batch variants, paid ad launcher, agent runs,
-- and personal API keys for the public API / MCP server.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_url text not null,
  title text,
  description text,
  price numeric(12, 2),
  currency text,
  brand_name text,
  copy jsonb not null default '{}'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  image_asset_ids uuid[] not null default '{}',
  logo_asset_id uuid references public.assets (id) on delete set null,
  status text not null default 'importing' check (status in ('importing', 'ready', 'failed')),
  error text,
  raw jsonb not null default '{}'::jsonb,
  job_id uuid references public.jobs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_workspace_idx on public.products (workspace_id, created_at desc);
create index products_logo_asset_id_idx on public.products (logo_asset_id);
create index products_job_id_idx on public.products (job_id);
create index products_created_by_idx on public.products (created_by);

-- Saved competitor / inspiration ads with a simple "still running" tracker.
create table public.inspiration_ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand text not null,
  platform text not null check (platform in ('meta', 'tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'pinterest', 'other')),
  source_url text,
  asset_id uuid references public.assets (id) on delete set null,
  thumbnail_url text,
  headline text,
  body text,
  cta text,
  tags text[] not null default '{}',
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  external_id text,
  metrics jsonb not null default '{}'::jsonb,
  analysis jsonb,
  is_favorite boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inspiration_ads_workspace_idx on public.inspiration_ads (workspace_id, created_at desc);
create index inspiration_ads_tags_idx on public.inspiration_ads using gin (tags);
create index inspiration_ads_asset_id_idx on public.inspiration_ads (asset_id);
create index inspiration_ads_created_by_idx on public.inspiration_ads (created_by);

-- Structure extracted from a reference ad, re-targeted at one of my products.
create table public.ad_blueprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  reference_asset_id uuid references public.assets (id) on delete set null,
  inspiration_ad_id uuid references public.inspiration_ads (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  status text not null default 'analyzing' check (status in ('analyzing', 'ready', 'failed')),
  structure jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  script_id uuid references public.scripts (id) on delete set null,
  timeline_id uuid references public.timelines (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_blueprints_workspace_idx on public.ad_blueprints (workspace_id, created_at desc);
create index ad_blueprints_reference_asset_id_idx on public.ad_blueprints (reference_asset_id);
create index ad_blueprints_inspiration_ad_id_idx on public.ad_blueprints (inspiration_ad_id);
create index ad_blueprints_product_id_idx on public.ad_blueprints (product_id);
create index ad_blueprints_script_id_idx on public.ad_blueprints (script_id);
create index ad_blueprints_timeline_id_idx on public.ad_blueprints (timeline_id);
create index ad_blueprints_job_id_idx on public.ad_blueprints (job_id);
create index ad_blueprints_created_by_idx on public.ad_blueprints (created_by);

-- One click -> N variants of a timeline (hooks, CTAs, voices) for A/B tests.
create table public.variant_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_timeline_id uuid references public.timelines (id) on delete set null,
  name text not null,
  dimensions text[] not null default '{hook,cta}',
  count integer not null check (count between 2 and 10),
  status text not null default 'planning'
    check (status in ('planning', 'ready', 'rendering', 'done', 'failed')),
  variants jsonb not null default '[]'::jsonb,
  cost_estimate_usd numeric(12, 4),
  ab_group uuid not null default gen_random_uuid(),
  job_id uuid references public.jobs (id) on delete set null,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index variant_batches_workspace_idx on public.variant_batches (workspace_id, created_at desc);
create index variant_batches_source_timeline_id_idx on public.variant_batches (source_timeline_id);
create index variant_batches_job_id_idx on public.variant_batches (job_id);
create index variant_batches_created_by_idx on public.variant_batches (created_by);

-- Paid ads (Meta Marketing API, TikTok Marketing API).
create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('meta', 'tiktok')),
  external_id text not null,
  name text,
  currency text,
  timezone text,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  status_detail text,
  meta jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);
create index ad_accounts_connected_by_idx on public.ad_accounts (connected_by);

create table public.ad_account_tokens (
  ad_account_id uuid primary key references public.ad_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  name text not null,
  objective text not null,
  daily_budget numeric(12, 2) not null check (daily_budget > 0),
  currency text,
  targeting jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'launching', 'paused', 'active', 'completed', 'failed')),
  external_campaign_id text,
  external_adset_id text,
  variant_batch_id uuid references public.variant_batches (id) on delete set null,
  error text,
  launched_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_campaigns_workspace_idx on public.ad_campaigns (workspace_id, created_at desc);
create index ad_campaigns_ad_account_id_idx on public.ad_campaigns (ad_account_id);
create index ad_campaigns_variant_batch_id_idx on public.ad_campaigns (variant_batch_id);
create index ad_campaigns_created_by_idx on public.ad_campaigns (created_by);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete set null,
  variant_label text,
  headline text,
  primary_text text,
  cta text,
  landing_url text,
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'paused', 'active', 'rejected', 'failed', 'archived')),
  external_ad_id text,
  external_creative_id text,
  external_video_id text,
  review_status text,
  is_winner boolean not null default false,
  metrics jsonb not null default '{}'::jsonb,
  metrics_updated_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ads_workspace_idx on public.ads (workspace_id, campaign_id);
create index ads_campaign_id_idx on public.ads (campaign_id);
create index ads_asset_id_idx on public.ads (asset_id);

create table public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  captured_at timestamptz not null default now(),
  date_start date,
  impressions bigint,
  clicks bigint,
  spend numeric(14, 4),
  ctr numeric(10, 6),
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  conversions numeric(14, 2),
  cpa numeric(14, 4),
  roas numeric(14, 4),
  video_views bigint,
  thruplays bigint,
  raw jsonb not null default '{}'::jsonb
);
create index ad_metrics_ad_idx on public.ad_metrics (ad_id, captured_at desc);
create index ad_metrics_workspace_idx on public.ad_metrics (workspace_id, captured_at desc);

-- Agent mode: research -> script -> generate -> launch -> optimize, with a
-- human approval gate before each step runs.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  goal text not null,
  product_id uuid references public.products (id) on delete set null,
  product_url text,
  budget_usd numeric(12, 2),
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval', 'running', 'completed', 'failed', 'canceled')),
  current_step text not null default 'research'
    check (current_step in ('research', 'script', 'generate', 'launch', 'optimize', 'done')),
  steps jsonb not null default '{}'::jsonb,
  job_id uuid references public.jobs (id) on delete set null,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_runs_workspace_idx on public.agent_runs (workspace_id, created_at desc);
create index agent_runs_product_id_idx on public.agent_runs (product_id);
create index agent_runs_job_id_idx on public.agent_runs (job_id);
create index agent_runs_created_by_idx on public.agent_runs (created_by);

-- Personal API keys for /api/v1 and the MCP server. Only a SHA-256 hash is stored.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{read,write}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_workspace_idx on public.api_keys (workspace_id);
create index api_keys_user_id_idx on public.api_keys (user_id);

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger inspiration_ads_updated_at before update on public.inspiration_ads
  for each row execute function public.set_updated_at();
create trigger ad_blueprints_updated_at before update on public.ad_blueprints
  for each row execute function public.set_updated_at();
create trigger variant_batches_updated_at before update on public.variant_batches
  for each row execute function public.set_updated_at();
create trigger ad_accounts_updated_at before update on public.ad_accounts
  for each row execute function public.set_updated_at();
create trigger ad_account_tokens_updated_at before update on public.ad_account_tokens
  for each row execute function public.set_updated_at();
create trigger ad_campaigns_updated_at before update on public.ad_campaigns
  for each row execute function public.set_updated_at();
create trigger ads_updated_at before update on public.ads
  for each row execute function public.set_updated_at();
create trigger agent_runs_updated_at before update on public.agent_runs
  for each row execute function public.set_updated_at();

-- Client-editable tables.
do $$
declare
  t text;
begin
  foreach t in array array['inspiration_ads', 'variant_batches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (private.is_workspace_member(workspace_id))', t);
    execute format('create policy "%1$s: editors insert" on public.%1$I for insert to authenticated with check (private.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors update" on public.%1$I for update to authenticated using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors delete" on public.%1$I for delete to authenticated using (private.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;

-- Server-written tables: clients read only.
do $$
declare
  t text;
begin
  foreach t in array array['products', 'ad_blueprints', 'ad_accounts', 'ad_campaigns', 'ads', 'ad_metrics', 'agent_runs', 'api_keys'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (private.is_workspace_member(workspace_id))', t);
  end loop;
end;
$$;

-- Tokens: service role only.
alter table public.ad_account_tokens enable row level security;

-- Hide the key hash from clients even though members may list their keys:
-- drop the table-wide grant and re-grant every column except key_hash.
revoke select on public.api_keys from authenticated, anon;
grant select (id, workspace_id, user_id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at)
  on public.api_keys to authenticated;

alter publication supabase_realtime add table
  public.products,
  public.ad_blueprints,
  public.variant_batches,
  public.agent_runs,
  public.ads;
