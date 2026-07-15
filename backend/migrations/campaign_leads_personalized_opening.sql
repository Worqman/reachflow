-- ─────────────────────────────────────────────────────────────
-- ReachFlow: campaign_leads.personalized_opening — cached AI-generated
-- opening line used by the {personalizedOpening} sequence variable
-- (see backend/src/routes/campaigns.js POST /:id/leads/:leadId/
-- generate-opening). Same shape/home as the existing profile_summary
-- cache on this table. Generation is user-triggered only (never automatic,
-- never on send) and only allowed when the lead has real signal_scores
-- history — see the generate-opening route for the guard.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists personalized_opening text;
alter table campaign_leads add column if not exists personalized_opening_generated_at timestamptz;
