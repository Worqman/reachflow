-- ─────────────────────────────────────────────────────────────
-- ReachFlow: workspace plan
-- Backs plan selection on the Billing page. Previously "current plan" was
-- only ever kept in Billing.jsx React state (lost on reload) — this makes
-- it a real, enforced property of the workspace. See services/plans.js
-- for what each plan_id includes; enforced in routes/unipile.js (LinkedIn
-- account cap) and routes/members.js (invite cap).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table workspaces add column if not exists plan_id text not null default 'trial';
