-- ─────────────────────────────────────────────────────────────
-- ReachFlow: track where a lead is paused mid-sequence (wait, awaiting a
-- reply, or awaiting connection acceptance) as a node-id path into the
-- (now arbitrarily-nested) sequence tree, rather than a flat integer index.
-- Replaces sequence_step/sequence_resume_at/reply_wait_step/reply_wait_deadline
-- for all new pauses — those columns are left in place (not dropped) so any
-- lead paused before this migration can still be read and backfilled.
-- Shape: { kind: 'wait'|'reply'|'connect', path: [...], deadline, claimId }
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists pending_step jsonb;
