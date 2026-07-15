-- ─────────────────────────────────────────────────────────────
-- ReachFlow: harden RLS across existing tables
--
-- The existing "service role full access" policies on agents, campaigns,
-- campaign_leads, leads, signal_events, campaign_lead_activity and
-- conversations all use `for all using (true) with check (true)` with no
-- `to service_role` restriction. A Postgres policy with no explicit `to`
-- clause applies to PUBLIC — i.e. every role, including anon and
-- authenticated. So these policies don't just allow the backend through;
-- they grant full read/write access to anyone holding the anon/public
-- Supabase key.
--
-- The backend's Supabase client always uses the service_role key, and
-- Supabase's service_role Postgres role has BYPASSRLS set — it ignores
-- RLS entirely, with or without policies. So these policies were never
-- actually required for the backend to work. Dropping them restores
-- default-deny for anon/authenticated on tables the frontend never
-- queries directly, while the backend keeps working exactly as before.
--
-- workspace_linkedin_accounts and unipile_send_log never had RLS enabled
-- at all — enabling it here (with no policies, i.e. default-deny for
-- anon/authenticated) closes that gap too.
--
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New
-- query) AFTER all other migrations in this folder.
-- ─────────────────────────────────────────────────────────────

drop policy if exists "service role full access" on agents;
drop policy if exists "service role full access" on campaigns;
drop policy if exists "service role full access" on campaign_leads;
drop policy if exists "service role full access" on leads;
drop policy if exists "service role full access" on signal_events;
drop policy if exists "service role full access" on campaign_lead_activity;
drop policy if exists "service role full access" on conversations;

alter table workspace_linkedin_accounts enable row level security;
alter table unipile_send_log enable row level security;
