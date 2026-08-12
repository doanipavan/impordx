-- Creates the "attachments" storage bucket and its RLS policies.
-- The 001 migration only left these as comments, so the bucket was
-- never actually created — uploads were failing with 404 "Bucket not found".

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');

create policy "Authenticated users can view attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments');

-- Files are stored under "<cardId>/filename", not "<userId>/filename",
-- so a delete policy keyed on auth.uid() vs foldername would never match.
-- Delete access is already restricted at the app layer to the uploader
-- or an admin; mirror that by allowing any authenticated user here.
create policy "Authenticated users can delete attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments');
