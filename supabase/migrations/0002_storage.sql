insert into storage.buckets (id, name, public)
values ('excalidraw', 'excalidraw', false)
on conflict (id) do nothing;

create function public.storage_doc_id(object_name text) returns uuid
language sql immutable as $$
  select case
    when (storage.foldername(object_name))[1] = 'docs'
      and (storage.foldername(object_name))[2] ~* '^[0-9a-f-]{36}$'
    then ((storage.foldername(object_name))[2])::uuid
  end
$$;

create policy "excalidraw legacy read" on storage.objects
  for select using (
    bucket_id = 'excalidraw'
    and (storage.foldername(name))[1] in ('rooms', 'shareLinks')
  );

create policy "excalidraw doc read" on storage.objects
  for select using (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and (
      public.is_doc_member(public.storage_doc_id(name))
      or public.is_doc_public(public.storage_doc_id(name))
    )
  );

create policy "excalidraw legacy write" on storage.objects
  for insert with check (
    bucket_id = 'excalidraw'
    and (storage.foldername(name))[1] in ('rooms', 'shareLinks')
  );

create policy "excalidraw doc write" on storage.objects
  for insert with check (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.doc_role(public.storage_doc_id(name)) in ('owner', 'editor')
  );

create policy "excalidraw doc update" on storage.objects
  for update using (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.doc_role(public.storage_doc_id(name)) in ('owner', 'editor')
  );

create policy "excalidraw doc delete" on storage.objects
  for delete using (
    bucket_id = 'excalidraw'
    and public.storage_doc_id(name) is not null
    and public.doc_role(public.storage_doc_id(name)) in ('owner', 'editor')
  );
