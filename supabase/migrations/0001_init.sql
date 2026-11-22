create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  title text not null default 'Untitled',
  room_id text not null unique,
  room_key text not null,
  is_public boolean not null default false,
  thumbnail_path text,
  scene_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);

create table public.doc_members (
  doc_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (doc_id, user_id)
);
create index doc_members_user_idx on public.doc_members (user_id);
create index doc_members_email_idx on public.doc_members (lower(email));

create table public.doc_invites (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.documents (id) on delete cascade,
  doc_title text not null default 'Untitled',
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (doc_id, email)
);
create index doc_invites_email_idx on public.doc_invites (lower(email));

-- encrypted scene payload, base64(compressData envelope). written only via RPC.
create table public.doc_scenes (
  doc_id uuid primary key references public.documents (id) on delete cascade,
  scene_version bigint not null,
  blob text not null,
  updated_at timestamptz not null default now()
);

-- secret-free projection for Realtime; keeps messages tiny and anon-safe.
create table public.doc_scene_meta (
  doc_id uuid primary key references public.documents (id) on delete cascade,
  scene_version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.doc_scene_meta replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.doc_scene_meta';
  end if;
end $$;

-- legacy anonymous rooms (parity with Firestore scenes/{roomId})
create table public.scenes (
  room_id text primary key,
  scene_version bigint not null,
  iv text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

create function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function public.is_doc_member(p_doc uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and d.owner_id = auth.uid()
  ) or exists (
    select 1 from public.doc_members m
    where m.doc_id = p_doc and m.user_id = auth.uid()
  )
$$;

create function public.doc_role(p_doc uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (
      select 1 from public.documents d
      where d.id = p_doc and d.owner_id = auth.uid()
    ) then 'owner'
    else (
      select m.role from public.doc_members m
      where m.doc_id = p_doc and m.user_id = auth.uid()
    )
  end
$$;

create function public.is_doc_public(p_doc uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select d.is_public from public.documents d where d.id = p_doc),
    false
  )
$$;

grant execute on function public.current_email() to anon, authenticated;
grant execute on function public.is_doc_member(uuid) to anon, authenticated;
grant execute on function public.doc_role(uuid) to anon, authenticated;
grant execute on function public.is_doc_public(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.doc_members enable row level security;
alter table public.doc_invites enable row level security;
alter table public.doc_scenes enable row level security;
alter table public.doc_scene_meta enable row level security;
alter table public.scenes enable row level security;

create policy profiles_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy documents_select on public.documents
  for select using (owner_id = auth.uid() or public.is_doc_member(id));
create policy documents_insert on public.documents
  for insert with check (owner_id = auth.uid());
create policy documents_update on public.documents
  for update using (public.doc_role(id) = 'owner')
  with check (owner_id = auth.uid());
create policy documents_delete on public.documents
  for delete using (owner_id = auth.uid());

create policy members_select on public.doc_members
  for select using (public.is_doc_member(doc_id));
create policy members_insert on public.doc_members
  for insert with check (
    public.doc_role(doc_id) = 'owner'
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.doc_invites i
        where i.doc_id = doc_members.doc_id
          and lower(i.email) = public.current_email()
      )
    )
  );
create policy members_update on public.doc_members
  for update using (public.doc_role(doc_id) = 'owner');
create policy members_delete on public.doc_members
  for delete using (
    public.doc_role(doc_id) = 'owner' or user_id = auth.uid()
  );

create policy invites_select on public.doc_invites
  for select using (
    public.doc_role(doc_id) = 'owner'
    or lower(email) = public.current_email()
  );
create policy invites_insert on public.doc_invites
  for insert with check (
    public.doc_role(doc_id) = 'owner' and invited_by = auth.uid()
  );
create policy invites_update on public.doc_invites
  for update using (public.doc_role(doc_id) = 'owner')
  with check (public.doc_role(doc_id) = 'owner');
create policy invites_delete on public.doc_invites
  for delete using (
    public.doc_role(doc_id) = 'owner'
    or lower(email) = public.current_email()
  );

create policy doc_scenes_select on public.doc_scenes
  for select using (public.is_doc_member(doc_id) or public.is_doc_public(doc_id));
create policy doc_scene_meta_select on public.doc_scene_meta
  for select using (public.is_doc_member(doc_id) or public.is_doc_public(doc_id));

create policy legacy_scenes_select on public.scenes
  for select using (true);

create function public.save_doc_scene(
  p_doc uuid,
  p_base_version bigint,
  p_scene_version bigint,
  p_blob text
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current bigint;
begin
  if coalesce(public.doc_role(p_doc), '') not in ('owner', 'editor') then
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

create function public.save_anonymous_scene(
  p_room_id text,
  p_base_version bigint,
  p_scene_version bigint,
  p_iv text,
  p_ciphertext text
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current bigint;
begin
  select scene_version into v_current
  from public.scenes
  where room_id = p_room_id
  for update;

  if found and v_current <> p_base_version then
    raise exception 'scene_version_conflict' using errcode = '40001';
  end if;

  insert into public.scenes (room_id, scene_version, iv, ciphertext, updated_at)
  values (p_room_id, p_scene_version, p_iv, p_ciphertext, now())
  on conflict (room_id) do update
    set scene_version = excluded.scene_version,
        iv = excluded.iv,
        ciphertext = excluded.ciphertext,
        updated_at = now();

  return p_scene_version;
end $$;

create function public.set_doc_thumbnail(p_doc uuid, p_path text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.doc_role(p_doc), '') not in ('owner', 'editor') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.documents
    set thumbnail_path = p_path, updated_at = now()
  where id = p_doc;
end $$;

create function public.get_public_doc(p_doc uuid)
returns table (id uuid, title text, scene_version bigint, updated_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id, d.title, d.scene_version, d.updated_at
  from public.documents d
  where d.id = p_doc and d.is_public
$$;

grant execute on function public.save_doc_scene(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.set_doc_thumbnail(uuid, text) to authenticated;
grant execute on function public.get_public_doc(uuid) to anon, authenticated;
grant execute on function public.save_anonymous_scene(text, bigint, bigint, text, text) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
