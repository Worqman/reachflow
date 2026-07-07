-- ─────────────────────────────────────────────────────────────
-- ReachFlow: retroactive migration for columns that were already referenced
-- in code (backend/src/routes/campaigns.js, guarded by .catch(() => {})
-- "ignore if not migrated") but never had a migration file committed. Adding
-- this now so the schema is reproducible from a clean database.
-- These columns are superseded by pending_step (see
-- campaign_leads_pending_step.sql) for all new pauses going forward, but are
-- left in place — and still written to nowhere new — until a one-time
-- backfill script has migrated any already-paused leads and confirmed the
-- columns are empty.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists sequence_step integer;
alter table campaign_leads add column if not exists sequence_resume_at timestamptz;
