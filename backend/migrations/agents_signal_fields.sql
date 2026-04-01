-- ─────────────────────────────────────────────────────────────
-- ReachFlow: add intent signal fields to agents table
-- Run in Supabase SQL Editor after agents.sql
-- ─────────────────────────────────────────────────────────────

alter table agents
  add column if not exists keywords          jsonb not null default '[]',
  add column if not exists signal_types      jsonb not null default '[]',
  add column if not exists icp_filters       jsonb not null default '{}',
  add column if not exists leads_found       int   not null default 0,
  add column if not exists signals_detected  int   not null default 0;

-- Remove the type column distinction — all agents are now unified
-- (keep the column for backward compat, just default to 'agent')
