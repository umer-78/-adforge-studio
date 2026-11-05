-- Private media bucket. Object paths start with the workspace id:
--   {workspace_id}/{asset_id}/original.{ext}
--   {workspace_id}/{asset_id}/derived/...
-- Browsers upload originals directly (resumable TUS) under these policies;
-- the worker writes derived files with the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  null,
  array[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/mp2t', 'video/iso.segment',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm',
    'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac',
    'application/vnd.apple.mpegurl', 'application/x-mpegurl',
    'application/json', 'text/vtt', 'text/plain',
    'model/gltf-binary', 'model/gltf+json'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "media: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1])));

create policy "media: editors insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));

create policy "media: editors update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'media' and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));

create policy "media: editors delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.can_edit_workspace(public.try_uuid((storage.foldername(name))[1])));
