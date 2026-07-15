-- ─────────────────────────────────────────────────────────────
-- ReachFlow: automation_logs — general-purpose append-only log for
-- cross-cutting automation events (scheduler runs, signal-agent detections,
-- future email sequencer activity) that don't belong to a single campaign
-- lead the way campaign_lead_activity does. NOT wired to any route yet.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists automation_logs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text,
  source        text not null,   -- scheduler | signal_agent | email_sequencer | campaign
  action        text not null,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists automation_logs_workspace_id_idx on automation_logs(workspace_id);
create index if not exists automation_logs_created_at_idx on automation_logs(created_at desc);

alter table automation_logs enable row level security;
-- No policies yet — backend-only (service_role) once this feature ships.
