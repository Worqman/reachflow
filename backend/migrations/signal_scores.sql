-- ─────────────────────────────────────────────────────────────
-- ReachFlow: signal_scores table
-- One row per (agent_id, provider_id) — the computed buying-intent score
-- for a lead in the context of a specific agent's ICP. A person can score
-- differently for different agents, since ICP fit depends on agents.icp.
-- Recomputed by signalScoring.js's recomputeScore() whenever a new
-- signal_events row lands for that agent+provider_id pair.
--
-- This is a brand-new table (nothing hand-built it before), so unlike
-- several other migrations this session it's safe to define the full
-- column list in one place — still using ADD COLUMN IF NOT EXISTS per
-- this repo's established convention, for consistency and safe re-runs.
-- Run this AFTER campaigns.sql (reuses its set_updated_at() trigger
-- function), agents.sql and signal_events_provider_id.sql.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists signal_scores (
  id text primary key
);

alter table signal_scores add column if not exists workspace_id       text not null default 'ws_default';
alter table signal_scores add column if not exists agent_id           text not null references agents(id) on delete cascade;
alter table signal_scores add column if not exists provider_id        text not null;
alter table signal_scores add column if not exists lead_name          text;
alter table signal_scores add column if not exists company            text;
alter table signal_scores add column if not exists title              text;
alter table signal_scores add column if not exists location           text;
alter table signal_scores add column if not exists score              int  not null default 0;
alter table signal_scores add column if not exists classification     text not null default 'low_intent';  -- low_intent | warm | high_intent
alter table signal_scores add column if not exists confidence         int  not null default 0;
alter table signal_scores add column if not exists reason             text;
alter table signal_scores add column if not exists breakdown          jsonb not null default '{}';
alter table signal_scores add column if not exists signal_count       int  not null default 0;
alter table signal_scores add column if not exists last_evaluated_at  timestamptz not null default now();
alter table signal_scores add column if not exists created_at         timestamptz not null default now();
alter table signal_scores add column if not exists updated_at         timestamptz not null default now();

create unique index if not exists signal_scores_agent_provider_uidx on signal_scores(agent_id, provider_id);
create index if not exists signal_scores_workspace_idx on signal_scores(workspace_id);
create index if not exists signal_scores_provider_idx  on signal_scores(provider_id);

drop trigger if exists signal_scores_updated_at on signal_scores;
create trigger signal_scores_updated_at
  before update on signal_scores
  for each row execute function set_updated_at();

alter table signal_scores enable row level security;

-- No policies — only ever written/read by the backend via the service_role
-- client (recomputeScore / GET /:id/scores). Frontend never queries this
-- table directly.
