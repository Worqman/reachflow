-- ─────────────────────────────────────────────────────────────
-- ReachFlow: profiles table
-- Retroactive migration — created directly by the frontend on signup
-- (Register.jsx inserts { id, full_name, company_name } with the user's
-- own session) and read by routes/profiles.js, but never had a migration
-- file committed.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  company_name  text,
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

-- Register.jsx inserts this row directly with the signed-up user's own
-- session (anon/authenticated key) — not through the backend. These
-- policies scope that direct access to the user's own row; service_role
-- (backend) bypasses RLS regardless.
--
-- Cast both sides to text: if this table already existed by hand (as
-- workspaces did) its id column may not actually be uuid — see the same
-- note in workspaces.sql.
drop policy if exists "users can view own profile" on profiles;
create policy "users can view own profile" on profiles
  for select to authenticated
  using (id::text = auth.uid()::text);

drop policy if exists "users can create own profile" on profiles;
create policy "users can create own profile" on profiles
  for insert to authenticated
  with check (id::text = auth.uid()::text);

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles
  for update to authenticated
  using (id::text = auth.uid()::text)
  with check (id::text = auth.uid()::text);
