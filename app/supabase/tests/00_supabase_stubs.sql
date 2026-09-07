-- ═══════════════════════════════════════════════════════════════════════════
-- Stubs for what hosted Supabase provides and a bare Postgres does not, so
-- setup.sql can be exercised locally exactly as the SQL editor will run it.
-- Not part of the deployment — see supabase/tests/README.md.
-- ═══════════════════════════════════════════════════════════════════════════

do $r$ begin
  create role anon nologin;
exception when duplicate_object then null; end $r$;
do $r$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $r$;
do $r$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $r$;

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;

create publication supabase_realtime;

-- Supabase grants these by default on new tables in public
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
