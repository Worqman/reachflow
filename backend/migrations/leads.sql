-- ─────────────────────────────────────────────────────────────
-- ReachFlow: leads table (saved leads from Lead Finder)
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists leads (
  id                  text primary key,
  workspace_id        text not null default 'ws_default',
  name                text,
  title               text,
  company             text,
  location            text,
  linkedin_url        text,
  provider_id         text,
  profile_picture_url text,
  status              text not null default 'Not contacted',
  created_at          timestamptz not null default now()
);

create index if not exists leads_workspace_id_idx on leads(workspace_id);

alter table leads enable row level security;

create policy "service role full access" on leads
  for all using (true) with check (true);
