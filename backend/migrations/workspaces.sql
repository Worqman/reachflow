-- ─────────────────────────────────────────────────────────────
-- ReachFlow: workspaces table
-- Retroactive migration — this table has existed in the live DB (created
-- by hand) since routes/workspace.js, members.js and the frontend
-- Onboarding workspace picker all query it, but no migration file was ever
-- committed. Adding this now so the schema is reproducible from a clean
-- database.
-- Run this in your Supabase SQL Editor AFTER workspace_members.sql — the
-- membership policy below references that table.
-- ─────────────────────────────────────────────────────────────

create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on workspaces(owner_id);

alter table workspaces enable row level security;

-- Unlike every other table in this app, workspaces IS queried directly by
-- the frontend with the user's own session (anon/authenticated key) — see
-- Onboarding.jsx's workspace picker. The backend (service_role) bypasses
-- RLS entirely regardless of these policies; they only govern that direct
-- client access.
--
-- Comparisons below cast both sides to text: this table pre-dates this
-- migration (created by hand), and its owner_id column turned out to be
-- text rather than uuid — matching this app's general convention of
-- storing ids as loose text rather than typed uuid/FK columns. Casting
-- makes these policies work whether owner_id/id are uuid or text.
drop policy if exists "users can view own workspaces" on workspaces;
create policy "users can view own workspaces" on workspaces
  for select to authenticated
  using (owner_id::text = auth.uid()::text);

drop policy if exists "users can view workspaces they are a member of" on workspaces;
create policy "users can view workspaces they are a member of" on workspaces
  for select to authenticated
  using (
    exists (
      select 1 from workspace_members m
      where m.workspace_id::text = workspaces.id::text and m.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "users can create own workspaces" on workspaces;
create policy "users can create own workspaces" on workspaces
  for insert to authenticated
  with check (owner_id::text = auth.uid()::text);
