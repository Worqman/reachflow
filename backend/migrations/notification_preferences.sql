-- ─────────────────────────────────────────────────────────────
-- ReachFlow: per-user notification toggle preferences
-- Backs the Settings → Notifications tab. Just preference storage for now —
-- nothing reads these to actually send an email/push yet. One row per user;
-- `preferences` holds { [eventKey]: boolean }, missing keys default to on
-- (see NOTIFICATION_EVENTS default-true handling in routes/notifications.js).
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists notification_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  preferences  jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

-- set_updated_at() is created by campaigns.sql — run that first if building
-- the schema from scratch (see migrations/README.md).
drop trigger if exists notification_preferences_updated_at on notification_preferences;
create trigger notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();

alter table notification_preferences enable row level security;

-- Backend-only table (routes/notifications.js, service_role) — no direct
-- frontend access, so RLS is enabled with zero policies purely to
-- default-deny the anon/authenticated key, same as most tables here (see
-- the "Why most tables have no RLS policies" note in this folder's README).
