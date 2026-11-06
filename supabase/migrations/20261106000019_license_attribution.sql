-- The credit line a license requires (CC BY and similar). Null when no credit is needed.
alter table public.licenses
  add column attribution text check (attribution is null or char_length(attribution) <= 2000);

comment on column public.licenses.attribution is 'Credit line the license requires when the media is used, or null when none is needed.';
