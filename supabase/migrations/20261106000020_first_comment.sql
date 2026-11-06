-- A comment posted on the creator's own post right after it goes live (hashtags, links, credits).
alter table public.posts
  add column first_comment text check (first_comment is null or char_length(first_comment) <= 2200);

alter table public.post_targets
  add column first_comment_status text check (first_comment_status in ('posted', 'failed', 'unsupported')),
  add column first_comment_id text,
  add column first_comment_error text check (first_comment_error is null or char_length(first_comment_error) <= 1000);

comment on column public.posts.first_comment is 'Posted as a comment on each published target, where the network allows it.';
