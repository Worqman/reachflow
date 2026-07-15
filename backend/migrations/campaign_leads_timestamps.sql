-- ─────────────────────────────────────────────────────────────
-- ReachFlow: campaign_leads.created_at / updated_at — routes/dashboard.js
-- already selects both columns (invitesSentThisWeek, meetingsThisMonth,
-- needsReview all key off them), but the base campaigns.sql migration
-- only ever defined `added_at`. Backfills created_at from the existing
-- added_at so historical "this week" stats stay accurate, then adds an
-- updated_at trigger going forward (reusing set_updated_at() from
-- campaigns.sql — run this AFTER campaigns.sql).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists created_at timestamptz;
alter table campaign_leads add column if not exists updated_at timestamptz;

update campaign_leads set created_at = coalesce(created_at, added_at, now()) where created_at is null;
update campaign_leads set updated_at = coalesce(updated_at, added_at, now()) where updated_at is null;

alter table campaign_leads alter column created_at set default now();
alter table campaign_leads alter column created_at set not null;
alter table campaign_leads alter column updated_at set default now();
alter table campaign_leads alter column updated_at set not null;

drop trigger if exists campaign_leads_updated_at on campaign_leads;
create trigger campaign_leads_updated_at
  before update on campaign_leads
  for each row execute function set_updated_at();
