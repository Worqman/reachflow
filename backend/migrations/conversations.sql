-- ─────────────────────────────────────────────────────────────
-- ReachFlow: conversations table (persistent AI inbox tracking)
-- Canonical copy of the migration formerly at the repo root
-- (supabase_conversations_migration.sql) — moved here so every table's
-- migration lives in one place. The RLS policy has also been tightened
-- (the original used `using (true)` with no `to` clause, which grants
-- full access to the anon key too, not just the backend).
--
-- Uses ADD COLUMN IF NOT EXISTS for everything but the primary key —
-- other "guessed" tables in this app turned out to already exist by hand
-- with a different column set (see meetings.sql), so this is safe
-- whether conversations is brand new or already exists elsewhere.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists conversations (
  id text primary key
);

alter table conversations add column if not exists workspace_id        text;
alter table conversations add column if not exists linkedin_chat_id    text;
alter table conversations add column if not exists linkedin_account_id text;
alter table conversations add column if not exists prospect_id         text;
alter table conversations add column if not exists agent_id            text;
alter table conversations add column if not exists campaign_id         text;
alter table conversations add column if not exists source              text default 'inbox';
alter table conversations add column if not exists status              text default 'review';
alter table conversations add column if not exists ai_paused           boolean default true;
alter table conversations add column if not exists messages            jsonb default '[]'::jsonb;
alter table conversations add column if not exists created_at          timestamptz default now();
alter table conversations add column if not exists updated_at          timestamptz default now();

create index if not exists conversations_linkedin_chat_id_idx
  on conversations (linkedin_chat_id);

create index if not exists conversations_workspace_id_idx
  on conversations (workspace_id);

alter table conversations enable row level security;

-- No policies — only ever queried through backend routes/webhooks
-- (service_role bypasses RLS). No frontend code queries this table
-- directly (the Inbox page goes through /api/conversations).
