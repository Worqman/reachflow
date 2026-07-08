-- ─────────────────────────────────────────────────────────────
-- ReachFlow: log every Unipile send (connection request / message)
-- so the LinkedIn Accounts page can show real "Daily Requests/Messages
-- Usage" numbers per account — counting sends from campaigns AND from
-- the standalone manual endpoints (POST /api/unipile/invite, /message),
-- not just campaign-scoped activity.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists unipile_send_log (
  id          uuid primary key default gen_random_uuid(),
  account_id  text not null,
  action_type text not null check (action_type in ('connection_request', 'message')),
  created_at  timestamptz not null default now()
);

create index if not exists unipile_send_log_account_day_idx
  on unipile_send_log (account_id, action_type, created_at);
