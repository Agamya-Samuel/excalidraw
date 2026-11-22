-- Public (anonymous) editing for cloud documents.
--
-- `is_public` keeps meaning "readable by anyone with the link".
-- `public_edit` additionally grants write access to the same link.
alter table public.documents
  add column if not exists public_edit boolean not null default false;

alter table public.documents
  add constraint documents_public_edit_requires_public
  check (not public_edit or is_public);

create function public.is_doc_public_edit(p_doc uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select d.is_public and d.public_edit from public.documents d where d.id = p_doc),
    false
  )
$$;

grant execute on function public.is_doc_public_edit(uuid) to anon, authenticated;

create or replace function public.save_doc_scene(
  p_doc uuid,
  p_base_version bigint,
  p_scene_version bigint,
  p_blob text
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current bigint;
begin
  if coalesce(public.doc_role(p_doc), '') not in ('owner', 'editor')
     and not public.is_doc_public_edit(p_doc) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select scene_version into v_current
  from public.doc_scenes
  where doc_id = p_doc
  for update;

  if found and v_current <> p_base_version then
    raise exception 'scene_version_conflict' using errcode = '40001';
  end if;

  insert into public.doc_scenes (doc_id, scene_version, blob, updated_at)
  values (p_doc, p_scene_version, p_blob, now())
  on conflict (doc_id) do update
    set scene_version = excluded.scene_version,
        blob = excluded.blob,
        updated_at = now();

  insert into public.doc_scene_meta (doc_id, scene_version, updated_at)
  values (p_doc, p_scene_version, now())
  on conflict (doc_id) do update
    set scene_version = excluded.scene_version,
        updated_at = now();

  update public.documents
    set scene_version = p_scene_version, updated_at = now()
  where id = p_doc;

  return p_scene_version;
end $$;

grant execute on function public.save_doc_scene(uuid, bigint, bigint, text)
  to anon, authenticated;

create or replace function public.set_doc_thumbnail(p_doc uuid, p_path text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.doc_role(p_doc), '') not in ('owner', 'editor')
     and not public.is_doc_public_edit(p_doc) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_path is null or p_path not like 'docs/' || p_doc::text || '/%' then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  update public.documents
    set thumbnail_path = p_path, updated_at = now()
  where id = p_doc;
end $$;

grant execute on function public.set_doc_thumbnail(uuid, text)
  to anon, authenticated;

-- Return type changes, so drop and recreate (this also drops grants).
drop function if exists public.get_public_doc(uuid);

create function public.get_public_doc(p_doc uuid)
returns table (
  id uuid,
  title text,
  scene_version bigint,
  updated_at timestamptz,
  room_id text,
  public_edit boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id, d.title, d.scene_version, d.updated_at, d.room_id, d.public_edit
  from public.documents d
  where d.id = p_doc and d.is_public
$$;

grant execute on function public.get_public_doc(uuid) to anon, authenticated;
