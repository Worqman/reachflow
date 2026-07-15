-- ─────────────────────────────────────────────────────────────
-- ReachFlow: campaign_leads.tags — written by the sequence builder's
-- add_tag node (routes/campaigns.js runNode) but never had a migration
-- file committed.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists tags jsonb not null default '[]';
