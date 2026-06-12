-- ─────────────────────────────────────────────────────────────
-- ReachFlow: store the reason an invite failed / was deferred
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists last_error text;
