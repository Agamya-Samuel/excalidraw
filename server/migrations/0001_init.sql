create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text,
  display_name text,
  avatar_url text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create table identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  provider text not null check (provider in ('google', 'github')),
  provider_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);
create index identities_user_idx on identities (user_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  user_agent text,
  ip text
);
create index sessions_user_idx on sessions (user_id);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  email citext not null,
  purpose text not null check (purpose in ('invite', 'login', 'reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_email_idx on auth_tokens (lower(email));
create index auth_tokens_purpose_idx on auth_tokens (purpose);

create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  owner_email text not null,
  title text not null default 'Untitled',
  room_id text not null unique,
  room_key text not null,
  is_public boolean not null default false,
  public_edit boolean not null default false,
  thumbnail_path text,
  scene_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_public_edit_requires_public
    check (not public_edit or is_public)
);
create index documents_owner_updated_idx on documents (owner_id, updated_at desc);

create table doc_members (
  doc_id uuid not null references documents (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (doc_id, user_id)
);
create index doc_members_user_idx on doc_members (user_id);
create index doc_members_email_idx on doc_members (lower(email));

create table doc_invites (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references documents (id) on delete cascade,
  doc_title text not null default 'Untitled',
  email citext not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (doc_id, email)
);
create index doc_invites_email_idx on doc_invites (lower(email));

create table doc_scenes (
  doc_id uuid primary key references documents (id) on delete cascade,
  scene_version bigint not null,
  blob text not null,
  updated_at timestamptz not null default now()
);

create table legacy_scenes (
  room_id text primary key,
  scene_version bigint not null,
  iv text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
