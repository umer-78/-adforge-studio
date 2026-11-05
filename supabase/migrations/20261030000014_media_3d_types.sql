-- 3D uploads (GLB/GLTF) for the 3D & Motion studio.
update storage.buckets
set allowed_mime_types = (
  select array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['model/gltf-binary', 'model/gltf+json']))
)
where id = 'media';
