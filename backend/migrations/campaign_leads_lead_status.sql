-- ─────────────────────────────────────────────────────────────
-- ReachFlow: manual "Lead Status" field — separate from the automated
-- pipeline `status` column (pending/invited/connected/replied/...), this is
-- set by hand to track sales qualification (Lead, Interested, Meeting
-- booked, etc.), same idea as most outreach CRMs.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists lead_status text not null default 'lead';

create index if not exists campaign_leads_lead_status_idx on campaign_leads(lead_status);
