-- Enable private pet profile image uploads for an existing Supabase project.
-- Run this once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can read own pet image files" on storage.objects;
drop policy if exists "Users can upload own pet image files" on storage.objects;
drop policy if exists "Users can update own pet image files" on storage.objects;
drop policy if exists "Users can delete own pet image files" on storage.objects;

create policy "Users can read own pet image files"
on storage.objects for select
using (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload own pet image files"
on storage.objects for insert
with check (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own pet image files"
on storage.objects for update
using (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own pet image files"
on storage.objects for delete
using (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
