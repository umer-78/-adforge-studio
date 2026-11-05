-- Prompt & Script Studio, voices, characters and the audio catalog.

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text,
  idea text not null,
  mode text not null default 'cinematic' check (mode in ('cinematic', 'ad')),
  platform text,
  structured jsonb not null default '{}'::jsonb,
  prompt text not null,
  negative_prompt text,
  parent_id uuid references public.prompts (id) on delete set null,
  is_saved boolean not null default false,
  tags text[] not null default '{}',
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prompts_workspace_idx on public.prompts (workspace_id, is_saved, created_at desc);
create index prompts_parent_id_idx on public.prompts (parent_id);
create index prompts_created_by_idx on public.prompts (created_by);

create table public.voices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  provider_voice_id text not null,
  name text not null,
  labels jsonb not null default '{}'::jsonb,
  preview_url text,
  is_cloned boolean not null default false,
  consent_id uuid references public.consents (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, provider_voice_id),
  check (not is_cloned or consent_id is not null)
);
create index voices_consent_id_idx on public.voices (consent_id);
create index voices_created_by_idx on public.voices (created_by);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  voice_id uuid references public.voices (id) on delete set null,
  default_emotion text not null default 'neutral',
  default_pace numeric(4, 2) not null default 1.0 check (default_pace between 0.5 and 2.0),
  avatar_asset_id uuid references public.assets (id) on delete set null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_workspace_idx on public.characters (workspace_id);
create index characters_voice_id_idx on public.characters (voice_id);
create index characters_avatar_asset_id_idx on public.characters (avatar_asset_id);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  title text not null default 'Untitled script',
  format text not null default 'ad' check (format in ('ad', 'dialogue')),
  brief jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  lines jsonb not null default '[]'::jsonb,
  captions text,
  hashtags text[] not null default '{}',
  storyboard jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'final')),
  timeline_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scripts_workspace_idx on public.scripts (workspace_id, updated_at desc);
create index scripts_project_id_idx on public.scripts (project_id);
create index scripts_created_by_idx on public.scripts (created_by);
create index scripts_timeline_id_idx on public.scripts (timeline_id);

create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  asset_id uuid not null unique references public.assets (id) on delete cascade,
  kind text not null check (kind in ('voiceover', 'music', 'sfx', 'recording', 'stem', 'other')),
  bpm numeric(6, 2),
  musical_key text,
  beats jsonb,
  loudness_lufs numeric(6, 2),
  voice_id uuid references public.voices (id) on delete set null,
  script_id uuid references public.scripts (id) on delete set null,
  line_id text,
  stem text check (stem in ('vocals', 'drums', 'bass', 'other')),
  license_id uuid references public.licenses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audio_tracks_workspace_idx on public.audio_tracks (workspace_id, kind);
create index audio_tracks_voice_id_idx on public.audio_tracks (voice_id);
create index audio_tracks_script_id_idx on public.audio_tracks (script_id);
create index audio_tracks_license_id_idx on public.audio_tracks (license_id);

create table public.music (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete set null,
  generation_id uuid references public.generations (id) on delete set null,
  license_id uuid references public.licenses (id) on delete set null,
  title text not null,
  genre text,
  mood text,
  bpm numeric(6, 2),
  musical_key text,
  duration_s numeric(10, 3),
  instrumental boolean not null default true,
  lyrics text,
  is_audio_logo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index music_workspace_idx on public.music (workspace_id, created_at desc);
create index music_asset_id_idx on public.music (asset_id);
create index music_generation_id_idx on public.music (generation_id);
create index music_license_id_idx on public.music (license_id);
create index music_created_by_idx on public.music (created_by);

-- Sound effects. Rows with workspace_id null are the built-in library.
create table public.sfx (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null,
  category text not null,
  tags text[] not null default '{}',
  asset_id uuid references public.assets (id) on delete set null,
  builtin_path text,
  duration_s numeric(8, 3),
  generation_id uuid references public.generations (id) on delete set null,
  license_id uuid references public.licenses (id) on delete set null,
  created_at timestamptz not null default now(),
  check (asset_id is not null or builtin_path is not null)
);
create index sfx_workspace_idx on public.sfx (workspace_id, category);
create index sfx_asset_id_idx on public.sfx (asset_id);
create index sfx_generation_id_idx on public.sfx (generation_id);
create index sfx_license_id_idx on public.sfx (license_id);

create trigger prompts_updated_at before update on public.prompts
  for each row execute function public.set_updated_at();
create trigger voices_updated_at before update on public.voices
  for each row execute function public.set_updated_at();
create trigger characters_updated_at before update on public.characters
  for each row execute function public.set_updated_at();
create trigger scripts_updated_at before update on public.scripts
  for each row execute function public.set_updated_at();
create trigger audio_tracks_updated_at before update on public.audio_tracks
  for each row execute function public.set_updated_at();
create trigger music_updated_at before update on public.music
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['prompts', 'characters', 'scripts', 'audio_tracks', 'music'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "%1$s: editors insert" on public.%1$I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors update" on public.%1$I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "%1$s: editors delete" on public.%1$I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;

-- Voices: clients may read and delete; cloned voices are created by the
-- server only, after a consent row exists.
alter table public.voices enable row level security;
create policy "voices: members read" on public.voices
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "voices: editors delete" on public.voices
  for delete to authenticated using (public.can_edit_workspace(workspace_id));

alter table public.sfx enable row level security;
create policy "sfx: read builtin and own" on public.sfx
  for select to authenticated using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy "sfx: editors insert" on public.sfx
  for insert to authenticated with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy "sfx: editors update" on public.sfx
  for update to authenticated
  using (workspace_id is not null and public.can_edit_workspace(workspace_id))
  with check (workspace_id is not null and public.can_edit_workspace(workspace_id));
create policy "sfx: editors delete" on public.sfx
  for delete to authenticated using (workspace_id is not null and public.can_edit_workspace(workspace_id));
