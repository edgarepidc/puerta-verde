-- Public bucket for promotion carousel images (idempotent)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promo-media',
  'promo-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "Public read promo media"
    on storage.objects for select
    to public
    using (bucket_id = 'promo-media');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Service role manage promo media"
    on storage.objects for all
    to service_role
    using (bucket_id = 'promo-media')
    with check (bucket_id = 'promo-media');
exception when duplicate_object then null;
end $$;
