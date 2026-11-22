-- Anonymous public editors may upload/replace files under docs/<docId>/.
-- These permissive policies are OR'ed with the existing member-only ones.
create policy "excalidraw doc public edit write" on storage.objects
  for insert with check (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.is_doc_public_edit(public.storage_doc_id(name))
  );

create policy "excalidraw doc public edit update" on storage.objects
  for update using (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.is_doc_public_edit(public.storage_doc_id(name))
  );

create policy "excalidraw doc public edit delete" on storage.objects
  for delete using (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.is_doc_public_edit(public.storage_doc_id(name))
  );
