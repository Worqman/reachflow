-- ─────────────────────────────────────────────────────────────
-- ReachFlow: signal_scores feed fields — powers the Signal Feed page
-- (frontend/src/pages/SignalFeed.jsx). status tracks what the user did
-- with a scored lead so dismissed/not-relevant leads stop resurfacing in
-- the feed; recomputeScore() (signalScoring.js) resets status back to
-- 'new' only if a signal newer than status_updated_at lands, so a
-- dismissal doesn't keep hiding a lead that's since shown fresh intent.
-- linkedin_url/profile_picture_url let the feed render a full row and
-- support "Save lead" without a second lookup.
-- Run this AFTER signal_scores.sql.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table signal_scores add column if not exists status              text not null default 'new';  -- new | saved | added_to_campaign | dismissed | not_relevant
alter table signal_scores add column if not exists status_updated_at   timestamptz;
alter table signal_scores add column if not exists linkedin_url        text;
alter table signal_scores add column if not exists profile_picture_url text;

create index if not exists signal_scores_status_idx on signal_scores(status);
