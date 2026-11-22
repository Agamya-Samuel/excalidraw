-- pgTAP RLS/authorization suite for the cloud workspace schema.
-- Run with: supabase test db --remote <db-url>
-- The whole suite runs in a transaction and rolls back.

begin;

create extension if not exists pgtap;

-- clean any stale rows from a previous aborted run
delete from auth.users where email like '%@rls.test';

insert into auth.users
  (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'owner@rls.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'editor@rls.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'viewer@rls.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'stranger@rls.test', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'invitee@rls.test', '{}', '{}', now(), now());

insert into public.documents
  (id, owner_id, owner_email, title, room_id, room_key)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'owner@rls.test', 'RLS test', 'room-rls-test', 'key-rls-test');

insert into public.doc_members (doc_id, user_id, email, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'editor@rls.test', 'editor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'viewer@rls.test', 'viewer');

insert into public.doc_scenes (doc_id, scene_version, blob)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'encrypted');

insert into public.doc_scene_meta (doc_id, scene_version)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1);

insert into public.doc_invites (doc_id, doc_title, email, role, invited_by)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'RLS test', 'invitee@rls.test', 'viewer',
  '11111111-1111-1111-1111-111111111111'
);

-- Sets the transaction-local role + JWT claims. Call as postgres only.
create function pg_temp.login(
  p_id uuid,
  p_email text,
  p_role text default 'authenticated'
) returns void
language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_id,
      'email', p_email,
      'role', p_role,
      'aud', 'authenticated'
    )::text,
    true
  );
end $$;

select plan(22);

-- owner ----------------------------------------------------------------------
-- Regression for the INSERT ... RETURNING path the client uses via
-- `.insert(...).select()`. The SELECT policy is evaluated against the new row,
-- so this must pass without a separate no-op migration.
select pg_temp.login('11111111-1111-1111-1111-111111111111', 'owner@rls.test');
select lives_ok(
  format(
    'insert into public.documents (id, owner_id, owner_email, title, room_id, room_key) values (%L, %L, %L, %L, %L, %L) returning *',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'owner@rls.test',
    'Insert returning',
    'room-insert-returning-test',
    'key-insert-returning-test'
  ),
  'owner can insert a document with RETURNING'
);

-- editor ---------------------------------------------------------------------
select pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor@rls.test');
select is(
  (select count(*)::int from public.documents),
  1,
  'editor can list the document'
);
select is(
  (select count(*)::int from public.doc_scenes),
  1,
  'editor can read the scene'
);
select lives_ok(
  format(
    'select public.save_doc_scene(%L, 1, 2, %L)',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'updated'
  ),
  'editor can save the scene'
);
select is(
  (
    select scene_version::int
    from public.doc_scenes
    where doc_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  2,
  'editor save bumps the scene version'
);

-- viewer ---------------------------------------------------------------------
reset role;
select pg_temp.login('33333333-3333-3333-3333-333333333333', 'viewer@rls.test');
select is(
  (select count(*)::int from public.documents),
  1,
  'viewer can list the document'
);
select throws_ok(
  format(
    'select public.save_doc_scene(%L, 2, 3, %L)',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'nope'
  ),
  '42501',
  'not_authorized',
  'viewer cannot save the scene'
);

-- stranger -------------------------------------------------------------------
reset role;
select pg_temp.login('44444444-4444-4444-4444-444444444444', 'stranger@rls.test');
select is(
  (select count(*)::int from public.documents),
  0,
  'stranger cannot list the document'
);
select is(
  (select count(*)::int from public.doc_scenes),
  0,
  'stranger cannot read the scene'
);
select throws_ok(
  format(
    'select public.save_doc_scene(%L, 2, 3, %L)',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'nope'
  ),
  '42501',
  'not_authorized',
  'stranger cannot save the scene'
);

-- anon, private --------------------------------------------------------------
reset role;
select pg_temp.login(null, null, 'anon');
select is(
  (select count(*)::int from public.doc_scenes),
  0,
  'anon cannot read a private scene'
);
select is(
  (select count(*)::int from public.get_public_doc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  0,
  'anon cannot resolve a private public-doc'
);

-- anon, public ---------------------------------------------------------------
reset role;
update public.documents
  set is_public = true
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select pg_temp.login(null, null, 'anon');
select is(
  (select count(*)::int from public.doc_scenes),
  1,
  'anon can read a public scene'
);
select is(
  (select count(*)::int from public.get_public_doc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1,
  'anon can resolve a public doc'
);
select is(
  (
    select public_edit
    from public.get_public_doc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  ),
  false,
  'public doc defaults to view-only'
);
select is(
  (
    select room_id
    from public.get_public_doc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  ),
  'room-rls-test',
  'public doc exposes the room id'
);
select throws_ok(
  format(
    'select public.save_doc_scene(%L, 2, 3, %L)',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'nope'
  ),
  '42501',
  'not_authorized',
  'anon cannot save a view-only public scene'
);

-- anon, public edit ----------------------------------------------------------
reset role;
update public.documents
  set is_public = true, public_edit = true
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select pg_temp.login(null, null, 'anon');
select is(
  (
    select public_edit
    from public.get_public_doc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  ),
  true,
  'public-edit doc reports editable'
);
select is(
  (select count(*)::int from public.doc_scenes),
  1,
  'anon can read a public-edit scene'
);
select lives_ok(
  format(
    'select public.save_doc_scene(%L, 2, 3, %L)',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'anon-edit'
  ),
  'anon can save a public-edit scene'
);
select is(
  (
    select scene_version::int
    from public.doc_scenes
    where doc_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  3,
  'anon public-edit save bumps the scene version'
);

-- invitee --------------------------------------------------------------------
reset role;
select pg_temp.login('55555555-5555-5555-5555-555555555555', 'invitee@rls.test');
insert into public.doc_members (doc_id, user_id, email, role)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  'invitee@rls.test',
  'viewer'
);
select is(
  (
    select count(*)::int
    from public.doc_members
    where user_id = '55555555-5555-5555-5555-555555555555'
  ),
  1,
  'invitee can accept their own invite'
);

select * from finish();
rollback;
