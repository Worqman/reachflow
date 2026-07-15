-- ─────────────────────────────────────────────────────────────
-- ReachFlow: scoring_config table
-- Tunable weights/thresholds for the signal scoring engine
-- (backend/src/services/signalScoring.js), one row per workspace. The
-- engine deep-merges `config` on top of its hardcoded DEFAULT_CONFIG, so
-- an empty '{}' (the seeded default below) means "pure defaults" — this
-- table is optional, not required for scoring to work. Tune weights by
-- editing a row's `config` jsonb directly in the Supabase dashboard; no
-- code deploy needed. See DEFAULT_CONFIG in signalScoring.js for the
-- shape of keys this accepts (signal type weights, decay half-life,
-- stacking window, classification thresholds, campaignGateThreshold).
-- Run this AFTER campaigns.sql (reuses its set_updated_at() trigger
-- function).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists scoring_config (
  id text primary key
);

alter table scoring_config add column if not exists workspace_id text not null;
alter table scoring_config add column if not exists config       jsonb not null default '{}';
alter table scoring_config add column if not exists created_at   timestamptz not null default now();
alter table scoring_config add column if not exists updated_at   timestamptz not null default now();

create unique index if not exists scoring_config_workspace_uidx on scoring_config(workspace_id);

drop trigger if exists scoring_config_updated_at on scoring_config;
create trigger scoring_config_updated_at
  before update on scoring_config
  for each row execute function set_updated_at();

alter table scoring_config enable row level security;

-- No policies — service_role-only, same reasoning as signal_scores.

insert into scoring_config (id, workspace_id, config)
values ('cfg_default', 'ws_default', '{}')
on conflict (workspace_id) do nothing;
