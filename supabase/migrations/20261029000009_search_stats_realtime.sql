-- Hybrid search (text + meaning), dashboard stats and realtime publication.

-- Text matching uses the tsvector, trigram similarity and tag prefixes;
-- meaning matching uses the caller-supplied query embedding. Runs as the
-- caller, so RLS limits results to the caller's workspaces.
create or replace function public.search_assets(
  p_workspace uuid,
  p_query text default null,
  p_embedding extensions.vector(1536) default null,
  p_types text[] default null,
  p_limit integer default 60,
  p_include_deleted boolean default false
)
returns table (asset_id uuid, score real, matched text[])
language sql
stable
set search_path = ''
as $$
  with q as (
    select nullif(trim(coalesce(p_query, '')), '') as text_query
  ),
  candidates as (
    select a.id, a.name, a.tags, a.ai_tags, a.search_vector
    from public.assets a
    where a.workspace_id = p_workspace
      and (p_include_deleted or a.deleted_at is null)
      and (p_types is null or a.type = any (p_types))
  ),
  lexical as (
    select
      c.id,
      (
        coalesce(ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', q.text_query)), 0) * 2
        + extensions.similarity(c.name, q.text_query)
      )::real as score
    from candidates c
    cross join q
    where q.text_query is not null
      and (
        c.search_vector @@ websearch_to_tsquery('simple', q.text_query)
        or strpos(lower(c.name), lower(q.text_query)) > 0
        or extensions.similarity(c.name, q.text_query) > 0.25
        or exists (
          select 1 from unnest(c.tags || c.ai_tags) as t (tag)
          where starts_with(lower(t.tag), lower(q.text_query))
        )
      )
  ),
  semantic as (
    select e.asset_id as id, (1 - (e.embedding operator(extensions.<=>) p_embedding))::real as score
    from public.asset_embeddings e
    join candidates c on c.id = e.asset_id
    where p_embedding is not null
    order by e.embedding operator(extensions.<=>) p_embedding
    limit greatest(p_limit, 1)
  ),
  combined as (
    select l.id, l.score, 'text'::text as kind from lexical l
    union all
    select s.id, s.score, 'meaning'::text as kind from semantic s where s.score > 0.2
  )
  select c.id as asset_id, sum(c.score)::real as score, array_agg(distinct c.kind) as matched
  from combined c
  group by c.id
  order by sum(c.score) desc
  limit greatest(p_limit, 1);
$$;
revoke all on function public.search_assets(uuid, text, extensions.vector, text[], integer, boolean) from public, anon;
grant execute on function public.search_assets(uuid, text, extensions.vector, text[], integer, boolean) to authenticated, service_role;

create or replace function public.workspace_stats(ws uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'storage_bytes',
      coalesce((select sum(a.size_bytes + a.derived_bytes) from public.assets a where a.workspace_id = ws), 0)
      + coalesce((select sum(v.size_bytes) from public.asset_versions v where v.workspace_id = ws), 0),
    'asset_count', (select count(*) from public.assets a where a.workspace_id = ws and a.deleted_at is null),
    'video_count', (select count(*) from public.assets a where a.workspace_id = ws and a.deleted_at is null and a.type = 'video'),
    'image_count', (select count(*) from public.assets a where a.workspace_id = ws and a.deleted_at is null and a.type = 'image'),
    'audio_count', (select count(*) from public.assets a where a.workspace_id = ws and a.deleted_at is null and a.type = 'audio'),
    'trash_count', (select count(*) from public.assets a where a.workspace_id = ws and a.deleted_at is not null),
    'generation_count', (select count(*) from public.generations g where g.workspace_id = ws),
    'month_spend_usd', public.workspace_month_spend(ws),
    'monthly_budget_usd', (select w.monthly_budget_usd from public.workspaces w where w.id = ws),
    'active_jobs', (select count(*) from public.jobs j where j.workspace_id = ws and j.status in ('queued', 'running')),
    'scheduled_posts', (select count(*) from public.posts p where p.workspace_id = ws and p.status = 'scheduled'),
    'published_posts', (select count(*) from public.posts p where p.workspace_id = ws and p.status in ('published', 'partially_published'))
  );
$$;
revoke all on function public.workspace_stats(uuid) from public, anon;
grant execute on function public.workspace_stats(uuid) to authenticated, service_role;

create or replace function public.workspace_tags(ws uuid)
returns table (tag text, uses bigint)
language sql
stable
set search_path = ''
as $$
  select t.tag, count(*) as uses
  from public.assets a
  cross join lateral unnest(a.tags) as t (tag)
  where a.workspace_id = ws and a.deleted_at is null
  group by t.tag
  order by count(*) desc, t.tag
  limit 200;
$$;
revoke all on function public.workspace_tags(uuid) from public, anon;
grant execute on function public.workspace_tags(uuid) to authenticated, service_role;

revoke all on function public.workspace_month_spend(uuid) from public, anon;
grant execute on function public.workspace_month_spend(uuid) to authenticated, service_role;

alter publication supabase_realtime add table
  public.assets,
  public.jobs,
  public.generations,
  public.renders,
  public.posts,
  public.post_targets;
