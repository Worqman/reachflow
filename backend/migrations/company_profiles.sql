-- ─────────────────────────────────────────────────────────────
-- ReachFlow: company_profiles table
-- Retroactive migration — queried extensively by routes/companyProfiles.js,
-- routes/agents.js, routes/campaigns.js and routes/conversations.js but
-- never had a migration file committed.
-- Run in Supabase SQL Editor after campaigns.sql (reuses its
-- set_updated_at() trigger function).
--
-- Uses ADD COLUMN IF NOT EXISTS for everything but the primary key — this
-- table likely already exists by hand (see meetings.sql, workspaces.sql
-- for other tables that turned out to have drifted from this file's
-- original guess), so this is safe either way.
--
-- Note: the frontend (Onboarding.jsx) has error-handling for a
-- "tone_preference ... check constraint" failure, implying the live DB may
-- have a check constraint on tone_preference values that was added by hand.
-- Deliberately NOT reproduced here — we don't know its exact allowed
-- values, and no constraint is a safe (permissive) superset. If one is
-- wanted, add it explicitly once the allowed tone values are finalized.
-- ─────────────────────────────────────────────────────────────

create table if not exists company_profiles (
  id uuid primary key default gen_random_uuid()
);

alter table company_profiles add column if not exists workspace_id         text;
alter table company_profiles add column if not exists company_name        text;
alter table company_profiles add column if not exists website_url         text;
alter table company_profiles add column if not exists company_description text;
alter table company_profiles add column if not exists value_proposition   text;
alter table company_profiles add column if not exists services_offered    jsonb default '[]';
alter table company_profiles add column if not exists tone_preference     text;
alter table company_profiles add column if not exists calendar_link       text;
alter table company_profiles add column if not exists social_proof        jsonb default '[]';
alter table company_profiles add column if not exists created_at          timestamptz default now();
alter table company_profiles add column if not exists updated_at          timestamptz default now();

create index if not exists company_profiles_workspace_id_idx on company_profiles(workspace_id);

drop trigger if exists company_profiles_updated_at on company_profiles;
create trigger company_profiles_updated_at
  before update on company_profiles
  for each row execute function set_updated_at();

alter table company_profiles enable row level security;

-- No policies — only ever queried through backend routes (service_role
-- bypasses RLS). No frontend code queries this table directly.
