-- Carousel posts: several photos or videos in one post. asset_id keeps the first file.
alter table public.posts
  add column carousel_asset_ids uuid[] not null default '{}'
  check (cardinality(carousel_asset_ids) = 0 or cardinality(carousel_asset_ids) between 2 and 10);

comment on column public.posts.carousel_asset_ids is 'Every file of a carousel post in order (2 to 10); empty for a single-file post.';
