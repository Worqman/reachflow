-- ─────────────────────────────────────────────────────────────
-- ReachFlow: email_messages — scaffold for the upcoming email sequencing
-- feature. NOT wired to any route yet. Mirrors the shape of
-- campaign_lead_activity / conversations.messages for the LinkedIn side.
-- Run this AFTER email_accounts.sql and campaigns.sql.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists email_messages (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      text not null,
  email_account_id  uuid references email_accounts(id) on delete cascade,
  campaign_id       text references campaigns(id) on delete set null,
  lead_id           text,
  direction         text not null,                    -- outbound | inbound
  subject           text,
  body              text,
  status            text not null default 'queued',    -- queued | sent | delivered | opened | replied | bounced | failed
  sent_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists email_messages_workspace_id_idx on email_messages(workspace_id);
create index if not exists email_messages_campaign_id_idx on email_messages(campaign_id);
create index if not exists email_messages_email_account_id_idx on email_messages(email_account_id);

alter table email_messages enable row level security;
-- No policies yet — backend-only (service_role) once this feature ships.
