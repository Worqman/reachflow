-- ─────────────────────────────────────────────────────────────
-- ReachFlow: signal_events table
-- Run in Supabase SQL Editor after agents_signal_fields.sql
-- ─────────────────────────────────────────────────────────────

create table if not exists signal_events (
  id            text primary key,
  workspace_id  text not null default 'ws_default',
  agent_id      text not null references agents(id) on delete cascade,
  type          text not null,       -- job_change | keyword_post | competitor_follow | company_growth | funding_round
  lead_name     text not null,
  company       text,
  signal        text,               -- human-readable description
  intent_score  int  not null default 0,
  actioned      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists signal_events_agent_id_idx     on signal_events(agent_id);
create index if not exists signal_events_workspace_id_idx on signal_events(workspace_id);

alter table signal_events enable row level security;

create policy "service role full access" on signal_events
  for all using (true) with check (true);
