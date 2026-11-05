-- Dashboard stats: storage split by file type, and generations per day over the last two weeks.
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
    'published_posts', (select count(*) from public.posts p where p.workspace_id = ws and p.status in ('published', 'partially_published')),
    'storage_by_type', coalesce((
      select jsonb_object_agg(s.kind, s.bytes)
      from (
        select a.type::text as kind, sum(a.size_bytes + a.derived_bytes) as bytes
        from public.assets a
        where a.workspace_id = ws
        group by a.type
        union all
        select 'versions', sum(v.size_bytes)
        from public.asset_versions v
        where v.workspace_id = ws
        having count(*) > 0
      ) s
    ), '{}'::jsonb),
    'generations_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(
        date_trunc('day', now() at time zone 'utc') - interval '13 days',
        date_trunc('day', now() at time zone 'utc'),
        interval '1 day'
      ) as d (day)
      left join (
        select date_trunc('day', g.created_at at time zone 'utc') as day, count(*) as n
        from public.generations g
        where g.workspace_id = ws
          and g.created_at >= (date_trunc('day', now() at time zone 'utc') - interval '13 days') at time zone 'utc'
        group by 1
      ) c on c.day = d.day
    )
  );
$$;
revoke all on function public.workspace_stats(uuid) from public, anon;
grant execute on function public.workspace_stats(uuid) to authenticated, service_role;
