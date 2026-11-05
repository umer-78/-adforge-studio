-- Move the SECURITY DEFINER membership helpers out of the API-exposed
-- public schema. Policies reference functions by OID, so they keep working.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_workspace_member(uuid) set schema private;
alter function public.can_edit_workspace(uuid) set schema private;
alter function public.is_workspace_admin(uuid) set schema private;
