-- ─────────────────────────────────────────────────────────────
-- ReachFlow: workspace credit balance + transaction ledger
-- Backs the Settings → Credits tab. Every outbound LinkedIn send already
-- logged to unipile_send_log (see usageLog.js) now also debits a credit
-- from the owning workspace, gating campaign sends once the balance hits 0.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists workspace_credits (
  workspace_id  text primary key,
  balance       integer not null default 100,
  updated_at    timestamptz not null default now()
);

create table if not exists credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   text not null,
  amount         integer not null,          -- negative = debit, positive = grant/top-up
  balance_after  integer not null,
  reason         text not null,             -- action_type (e.g. 'message') or 'manual_grant' / 'trial_grant'
  campaign_id    text,
  lead_id        text,
  created_at     timestamptz not null default now()
);

create index if not exists credit_transactions_workspace_idx
  on credit_transactions (workspace_id, created_at desc);

-- Both functions upsert the workspace's row on first touch (starting
-- balance 100) and apply the delta atomically, so concurrent sends across
-- different campaigns/accounts in the same workspace can't race each other
-- into an inconsistent balance the way a read-then-write from the app layer
-- would.
create or replace function deduct_workspace_credits(
  p_workspace_id text,
  p_amount integer,
  p_reason text default 'debit',
  p_campaign_id text default null,
  p_lead_id text default null
)
returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  insert into workspace_credits (workspace_id, balance)
  values (p_workspace_id, 100)
  on conflict (workspace_id) do nothing;

  update workspace_credits
  set balance = balance - p_amount, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into credit_transactions (workspace_id, amount, balance_after, reason, campaign_id, lead_id)
  values (p_workspace_id, -p_amount, v_balance, coalesce(nullif(p_reason, ''), 'debit'), p_campaign_id, p_lead_id);

  return v_balance;
end;
$$;

create or replace function grant_workspace_credits(p_workspace_id text, p_amount integer, p_reason text default 'manual_grant')
returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  insert into workspace_credits (workspace_id, balance)
  values (p_workspace_id, 100)
  on conflict (workspace_id) do nothing;

  update workspace_credits
  set balance = balance + p_amount, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into credit_transactions (workspace_id, amount, balance_after, reason)
  values (p_workspace_id, p_amount, v_balance, p_reason);

  return v_balance;
end;
$$;

alter table workspace_credits enable row level security;
alter table credit_transactions enable row level security;
