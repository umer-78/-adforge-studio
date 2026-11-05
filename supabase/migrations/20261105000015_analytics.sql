-- Analytics: daily results from the lifetime snapshots that metric syncs store.
--
-- Platforms report lifetime totals, so a day's value is how much the total grew
-- that day: the last snapshot of the day minus the highest earlier snapshot of
-- the same ad or post. The baseline for the first day in the window is the last
-- snapshot before the window, so an ad or post first measured inside the window
-- counts everything it had gathered by then on that first day. Downward
-- corrections by a platform count as zero rather than as negative days.
-- Days are UTC dates. Both functions run with the caller's rights, so row-level
-- security limits them to workspaces the caller belongs to.

create or replace function public.ad_daily_metrics(ws uuid, since timestamptz, campaign uuid default null)
returns table (
  day date,
  spend numeric,
  impressions bigint,
  clicks bigint,
  conversions numeric,
  video_views bigint
)
language sql
stable
set search_path = ''
as $$
  with snaps as (
    select m.ad_id, m.captured_at, m.spend, m.impressions, m.clicks, m.conversions, m.video_views
    from public.ad_metrics m
    where m.workspace_id = ws
      and (campaign is null or m.ad_id in (select a.id from public.ads a where a.workspace_id = ws and a.campaign_id = campaign))
  ),
  baseline as (
    select distinct on (s.ad_id) s.ad_id, null::date as day, s.spend, s.impressions, s.clicks, s.conversions, s.video_views
    from snaps s
    where s.captured_at < since
    order by s.ad_id, s.captured_at desc
  ),
  closing as (
    select distinct on (s.ad_id, (s.captured_at at time zone 'utc')::date)
      s.ad_id, (s.captured_at at time zone 'utc')::date as day, s.spend, s.impressions, s.clicks, s.conversions, s.video_views
    from snaps s
    where s.captured_at >= since
    order by s.ad_id, (s.captured_at at time zone 'utc')::date, s.captured_at desc
  ),
  series as (
    select * from baseline
    union all
    select * from closing
  ),
  deltas as (
    select
      s.day,
      greatest(s.spend - coalesce(max(s.spend) over w, 0), 0) as spend,
      greatest(s.impressions - coalesce(max(s.impressions) over w, 0), 0) as impressions,
      greatest(s.clicks - coalesce(max(s.clicks) over w, 0), 0) as clicks,
      greatest(s.conversions - coalesce(max(s.conversions) over w, 0), 0) as conversions,
      greatest(s.video_views - coalesce(max(s.video_views) over w, 0), 0) as video_views
    from series s
    window w as (partition by s.ad_id order by s.day nulls first rows between unbounded preceding and 1 preceding)
  )
  select
    d.day,
    round(coalesce(sum(d.spend), 0), 4) as spend,
    coalesce(sum(d.impressions), 0)::bigint as impressions,
    coalesce(sum(d.clicks), 0)::bigint as clicks,
    round(coalesce(sum(d.conversions), 0), 2) as conversions,
    coalesce(sum(d.video_views), 0)::bigint as video_views
  from deltas d
  where d.day is not null
  group by d.day
  order by d.day;
$$;
revoke all on function public.ad_daily_metrics(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.ad_daily_metrics(uuid, timestamptz, uuid) to authenticated, service_role;

create or replace function public.post_daily_metrics(ws uuid, since timestamptz)
returns table (
  day date,
  views bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint
)
language sql
stable
set search_path = ''
as $$
  with snaps as (
    select m.post_target_id, m.captured_at, m.views, m.impressions, m.likes, m.comments, m.shares, m.saves, m.clicks
    from public.post_metrics m
    where m.workspace_id = ws
  ),
  baseline as (
    select distinct on (s.post_target_id)
      s.post_target_id, null::date as day, s.views, s.impressions, s.likes, s.comments, s.shares, s.saves, s.clicks
    from snaps s
    where s.captured_at < since
    order by s.post_target_id, s.captured_at desc
  ),
  closing as (
    select distinct on (s.post_target_id, (s.captured_at at time zone 'utc')::date)
      s.post_target_id, (s.captured_at at time zone 'utc')::date as day,
      s.views, s.impressions, s.likes, s.comments, s.shares, s.saves, s.clicks
    from snaps s
    where s.captured_at >= since
    order by s.post_target_id, (s.captured_at at time zone 'utc')::date, s.captured_at desc
  ),
  series as (
    select * from baseline
    union all
    select * from closing
  ),
  deltas as (
    select
      s.day,
      greatest(s.views - coalesce(max(s.views) over w, 0), 0) as views,
      greatest(s.impressions - coalesce(max(s.impressions) over w, 0), 0) as impressions,
      greatest(s.likes - coalesce(max(s.likes) over w, 0), 0) as likes,
      greatest(s.comments - coalesce(max(s.comments) over w, 0), 0) as comments,
      greatest(s.shares - coalesce(max(s.shares) over w, 0), 0) as shares,
      greatest(s.saves - coalesce(max(s.saves) over w, 0), 0) as saves,
      greatest(s.clicks - coalesce(max(s.clicks) over w, 0), 0) as clicks
    from series s
    window w as (partition by s.post_target_id order by s.day nulls first rows between unbounded preceding and 1 preceding)
  )
  select
    d.day,
    coalesce(sum(d.views), 0)::bigint as views,
    coalesce(sum(d.impressions), 0)::bigint as impressions,
    coalesce(sum(d.likes), 0)::bigint as likes,
    coalesce(sum(d.comments), 0)::bigint as comments,
    coalesce(sum(d.shares), 0)::bigint as shares,
    coalesce(sum(d.saves), 0)::bigint as saves,
    coalesce(sum(d.clicks), 0)::bigint as clicks
  from deltas d
  where d.day is not null
  group by d.day
  order by d.day;
$$;
revoke all on function public.post_daily_metrics(uuid, timestamptz) from public, anon;
grant execute on function public.post_daily_metrics(uuid, timestamptz) to authenticated, service_role;
