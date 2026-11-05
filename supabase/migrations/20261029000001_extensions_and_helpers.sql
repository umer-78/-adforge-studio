-- Extensions and generic helpers shared by every other migration.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Casts text to uuid, returning null instead of raising on bad input.
-- Used by storage policies, where the first path segment is a workspace id.
create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;
