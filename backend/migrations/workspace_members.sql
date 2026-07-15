-- ─────────────────────────────────────────────────────────────
-- ReachFlow: workspace_members table
-- Retroactive migration — queried by server.js (verifyWorkspaceMembership),
-- routes/members.js and routes/workspace.js but never had a migration file
-- committed. Run this BEFORE workspaces.sql (that file's RLS policy
-- references this table).
--
-- Uses ADD COLUMN IF NOT EXISTS for everything but the primary key — this
-- table already exists live (queried in production), so this is additive-
-- safe against whatever its actual current column types are (see
-- workspaces.sql's RLS policies, which cast to text for the same reason).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid()
);

alter table workspace_members add column if not exists workspace_id text;
alter table workspace_members add column if not exists user_id      uuid references auth.users(id) on delete cascade;
alter table workspace_members add column if not exists role         text default 'member';  -- owner | admin | member
alter table workspace_members add column if not exists joined_at    timestamptz default now();

create index if not exists workspace_members_workspace_id_idx on workspace_members(workspace_id);
create index if not exists workspace_members_user_id_idx on workspace_members(user_id);

-- routes/members.js's accept-invite endpoint inserts a membership row and
-- relies on catching Postgres error 23505 (unique violation) to detect
-- "already a member" — that requires this constraint to exist. Wrapped so
-- dirty/duplicate existing data doesn't abort the rest of this migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_members_workspace_id_user_id_key'
  ) then
    alter table workspace_members
      add constraint workspace_members_workspace_id_user_id_key unique (workspace_id, user_id);
  end if;
exception when others then
  raise notice 'Skipped adding unique(workspace_id, user_id) on workspace_members — likely duplicate rows exist: %', sqlerrm;
end $$;

alter table workspace_members enable row level security;

-- No policies: only ever queried through /api/members and /api/workspaces
-- (backend, service_role — bypasses RLS). No frontend code queries this
-- table directly today, so RLS enabled with zero policies correctly
-- default-denies the anon/authenticated key.
