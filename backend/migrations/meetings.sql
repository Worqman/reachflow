-- ─────────────────────────────────────────────────────────────
-- ReachFlow: meetings table
-- Retroactive migration — written by routes/conversations.js
-- (mark-booked, and the calendar-link auto-booking detector) and read by
-- routes/meetings.js, but never had a migration file committed.
--
-- This table already existed by hand in the live DB with a column set
-- that didn't match this file's original guess (missing workspace_id).
-- Using ADD COLUMN IF NOT EXISTS for everything but the primary key makes
-- this safe to run whether the table is brand new or already exists with
-- a different/partial structure — it only ever adds what's missing.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists meetings (
  id uuid primary key default gen_random_uuid()
);

alter table meetings add column if not exists workspace_id        text;
alter table meetings add column if not exists linkedin_chat_id    text;
alter table meetings add column if not exists prospect_id         text;
alter table meetings add column if not exists prospect_name       text;
alter table meetings add column if not exists account_id          text;
alter table meetings add column if not exists agent_id            text;
alter table meetings add column if not exists campaign_id         text;
alter table meetings add column if not exists notes               text;

alter table meetings add column if not exists booked_at timestamptz;
update meetings set booked_at = coalesce(booked_at, now()) where booked_at is null;
alter table meetings alter column booked_at set default now();
alter table meetings alter column booked_at set not null;

alter table meetings add column if not exists created_at timestamptz;
update meetings set created_at = coalesce(created_at, booked_at, now()) where created_at is null;
alter table meetings alter column created_at set default now();
alter table meetings alter column created_at set not null;

create index if not exists meetings_workspace_id_idx on meetings(workspace_id);
create index if not exists meetings_campaign_id_idx on meetings(campaign_id);

alter table meetings enable row level security;

-- No policies — only ever queried through backend routes (service_role
-- bypasses RLS). No frontend code queries this table directly.
--
-- NOTE: routes/meetings.js's GET / never filters by workspace_id (it
-- selects all rows, unscoped) — likely because this column didn't exist
-- when that route was written. Now that it does, that route should
-- probably filter by req.workspaceId too; flagging here since it's a
-- cross-tenant data leak, not something this migration file can fix.
