-- ─────────────────────────────────────────────────────────────
-- ReachFlow: lead_lists table
-- Retroactive migration — queried by routes/leadLists.js but never had a
-- migration file committed. Run this BEFORE leads_list_id.sql (that file
-- adds a foreign key to this table).
--
-- Uses ADD COLUMN IF NOT EXISTS for everything but the primary key — safe
-- whether this table is brand new or already exists with a different
-- column set (see meetings.sql for why).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists lead_lists (
  id text primary key
);

alter table lead_lists add column if not exists workspace_id text;
alter table lead_lists add column if not exists name         text;
alter table lead_lists add column if not exists created_at   timestamptz default now();

create index if not exists lead_lists_workspace_id_idx on lead_lists(workspace_id);

alter table lead_lists enable row level security;

-- No policies — only ever queried through /api/lead-lists (service_role
-- bypasses RLS). No frontend code queries this table directly.
