-- ─────────────────────────────────────────────────────────────
-- ReachFlow: signal_automations table
-- Per-agent rules that auto-enroll a lead into a campaign once its
-- signal_scores classification crosses a threshold — see
-- backend/src/services/signalScoring.js (recomputeScore) for the trigger
-- and backend/src/routes/campaigns.js (runSignalAutoEnroll) for execution.
-- Run in Supabase SQL Editor after signal_scores.sql and campaigns.sql.
-- ─────────────────────────────────────────────────────────────

create table if not exists signal_automations (
  id                 text primary key,
  workspace_id       text not null default 'ws_default',
  agent_id           text not null references agents(id) on delete cascade,
  campaign_id        text not null references campaigns(id) on delete cascade,
  min_classification text not null default 'high_intent', -- 'warm' | 'high_intent'
  enabled            boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists signal_automations_agent_id_idx     on signal_automations(agent_id);
create index if not exists signal_automations_workspace_id_idx on signal_automations(workspace_id);

alter table signal_automations enable row level security;

drop policy if exists "service role full access" on signal_automations;
create policy "service role full access" on signal_automations
  for all using (true) with check (true);
