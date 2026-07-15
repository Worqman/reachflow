-- ─────────────────────────────────────────────────────────────
-- ReachFlow: workspace_invites table
-- Retroactive migration — queried by routes/members.js (invite/resend/
-- accept flow) but never had a migration file committed.
--
-- Uses ADD COLUMN IF NOT EXISTS for everything but the primary key — this
-- table already exists live (queried in production), so this is
-- additive-safe against whatever its actual current structure is.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid()
);

alter table workspace_invites add column if not exists workspace_id text;
alter table workspace_invites add column if not exists email        text;
alter table workspace_invites add column if not exists role         text default 'member';
alter table workspace_invites add column if not exists invited_by   uuid references auth.users(id) on delete set null;
alter table workspace_invites add column if not exists status       text default 'pending';  -- pending | accepted | expired
alter table workspace_invites add column if not exists token        text;
alter table workspace_invites add column if not exists expires_at   timestamptz;
alter table workspace_invites add column if not exists created_at   timestamptz default now();

create index if not exists workspace_invites_workspace_id_idx on workspace_invites(workspace_id);
create index if not exists workspace_invites_token_idx on workspace_invites(token);

-- routes/members.js upserts with onConflict: 'workspace_id,email', which
-- requires a matching unique constraint to exist — add it if missing.
-- Wrapped so dirty/duplicate existing data doesn't abort the rest of this
-- migration; if it fails, invite upserts will error until duplicates are
-- resolved by hand.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_invites_workspace_id_email_key'
  ) then
    alter table workspace_invites
      add constraint workspace_invites_workspace_id_email_key unique (workspace_id, email);
  end if;
exception when others then
  raise notice 'Skipped adding unique(workspace_id, email) on workspace_invites — likely duplicate rows exist: %', sqlerrm;
end $$;

alter table workspace_invites enable row level security;

-- No policies — service_role only (backend /api/members routes). No
-- frontend code queries this table directly.
