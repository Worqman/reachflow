-- ─────────────────────────────────────────────────────────────
-- ReachFlow: signal_events.provider_id / metadata — signal_events had no
-- stable link to a lead (only free-text lead_name/company). provider_id
-- is the same LinkedIn identifier already used to join campaign_leads and
-- leads, so it becomes the join key for aggregating events into a score
-- (see signal_scores.sql). metadata holds detector-specific context, e.g.
-- { engagementType: 'like'|'comment', postUrl } for post-engagement
-- signals — the scoring engine (signalScoring.js) reads this to weight
-- events by quality.
-- Run this AFTER signal_events.sql.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table signal_events add column if not exists provider_id text;
alter table signal_events add column if not exists metadata    jsonb not null default '{}';

create index if not exists signal_events_provider_id_idx    on signal_events(provider_id);
create index if not exists signal_events_agent_provider_idx on signal_events(agent_id, provider_id);

-- Note: `type` remains free text (no CHECK constraint, matching how this
-- column has always worked). It now also accepts 'post_activity' in
-- addition to the existing job_change | keyword_post | competitor_follow |
-- company_growth | funding_round.
