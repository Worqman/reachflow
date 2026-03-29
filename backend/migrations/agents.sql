-- ─────────────────────────────────────────────────────────────
-- ReachFlow: agents table
-- Run in Supabase SQL Editor after campaigns.sql
-- ─────────────────────────────────────────────────────────────

create table if not exists agents (
  id            text primary key,
  workspace_id  text not null default 'ws_default',
  name          text not null,
  type          text not null default 'assistant',  -- assistant | signal
  status        text not null default 'active',     -- active | paused
  persona       jsonb not null default '{}',
  icp           jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Reuse the set_updated_at() function created in campaigns.sql
drop trigger if exists agents_updated_at on agents;
create trigger agents_updated_at
  before update on agents
  for each row execute function set_updated_at();

create index if not exists agents_workspace_id_idx on agents(workspace_id);

alter table agents enable row level security;

create policy "service role full access" on agents
  for all using (true) with check (true);
