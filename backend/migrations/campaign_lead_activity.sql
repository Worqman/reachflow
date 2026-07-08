-- ─────────────────────────────────────────────────────────────
-- ReachFlow: per-lead activity timeline (profile visits, invites, messages,
-- connection/reply events, manual lead-status changes, ...) — powers the
-- "Activity" column on the campaign leads table.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists campaign_lead_activity (
  id          uuid primary key default gen_random_uuid(),
  campaign_id text not null references campaigns(id) on delete cascade,
  lead_id     text not null references campaign_leads(id) on delete cascade,
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists campaign_lead_activity_lead_idx on campaign_lead_activity (lead_id, created_at desc);

alter table campaign_lead_activity enable row level security;

create policy "service role full access" on campaign_lead_activity
  for all using (true) with check (true);
