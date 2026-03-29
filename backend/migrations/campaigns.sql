-- ─────────────────────────────────────────────────────────────
-- ReachFlow: campaigns + campaign_leads tables
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

-- Campaigns
create table if not exists campaigns (
  id            text primary key,
  workspace_id  text not null default 'ws_default',
  name          text not null,
  status        text not null default 'draft',   -- draft | active | paused
  sequence      jsonb not null default '{"nodes":[]}',
  settings      jsonb not null default '{}',
  analytics     jsonb not null default '{"sent":0,"accepted":0,"replied":0}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- Campaign leads
create table if not exists campaign_leads (
  id            text primary key,
  campaign_id   text not null references campaigns(id) on delete cascade,
  workspace_id  text not null default 'ws_default',
  name          text,
  title         text,
  company       text,
  location      text,
  linkedin_url  text,
  provider_id   text,
  status        text not null default 'pending',  -- pending | sent | accepted | replied | rejected
  source        text,                              -- finder | engagers | csv | url | ...
  added_at      timestamptz not null default now()
);

-- Indexes
create index if not exists campaigns_workspace_id_idx on campaigns(workspace_id);
create index if not exists campaign_leads_campaign_id_idx on campaign_leads(campaign_id);

-- Row Level Security (optional but recommended)
alter table campaigns enable row level security;
alter table campaign_leads enable row level security;

-- Allow service role full access (used by backend)
create policy "service role full access" on campaigns
  for all using (true) with check (true);

create policy "service role full access" on campaign_leads
  for all using (true) with check (true);
