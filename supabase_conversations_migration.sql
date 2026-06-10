-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Creates the conversations table for persistent AI inbox tracking

create table if not exists conversations (
  id                  text primary key,
  workspace_id        text,
  linkedin_chat_id    text,
  linkedin_account_id text,
  prospect_id         text,
  agent_id            text,
  campaign_id         text,
  source              text default 'inbox',
  status              text default 'review',
  ai_paused           boolean default true,
  messages            jsonb default '[]'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Index for fast chat ID lookups (used on every message_received webhook)
create index if not exists conversations_linkedin_chat_id_idx
  on conversations (linkedin_chat_id);

-- Index for workspace-scoped list queries
create index if not exists conversations_workspace_id_idx
  on conversations (workspace_id);

-- Enable Row Level Security (optional but recommended)
alter table conversations enable row level security;

-- Allow the service role full access (backend uses service role key)
create policy "service role full access" on conversations
  for all using (true) with check (true);
