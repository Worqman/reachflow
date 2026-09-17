-- ─────────────────────────────────────────────────────────────
-- ReachFlow: Stripe entitlements (lifetime / future subscription access)
-- Backs webhooks/stripe.js (checkout.session.completed → entitlement) and
-- routes/entitlements.js (access checks + attaching a pending entitlement
-- to a newly-registered account). Entitlements are per-person (keyed by
-- email/user_id), not per-workspace — separate from workspaces.plan_id.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

-- Dedup guard: insert the Stripe event id here before processing it. A
-- unique-violation means this event was already handled (Stripe retries
-- on timeout/non-2xx, and can redeliver) — treat as a no-op.
create table if not exists stripe_events (
  id           text primary key,
  type         text,
  received_at  timestamptz not null default now()
);

-- What a person is entitled to. `plan` values map 1:1 to Stripe Price IDs
-- via services/stripePlans.js (currently only 'lifetime' is live; that file
-- documents how 'monthly'/'annual' get added later without touching this
-- table). `user_id` is null until an Eya account exists for `email` — see
-- routes/entitlements.js for the attach-on-login flow.
create table if not exists entitlements (
  id                          uuid primary key default gen_random_uuid(),
  email                       text not null,
  user_id                     uuid references auth.users(id) on delete set null,
  plan                        text not null,
  status                      text not null default 'active',   -- active | canceled | expired
  access_expires_at           timestamptz,                       -- null = never expires (lifetime)
  stripe_customer_id          text,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_price_id             text not null,
  purchased_at                timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists entitlements_email_idx on entitlements (email);
create index if not exists entitlements_user_id_idx on entitlements (user_id);

alter table stripe_events enable row level security;
alter table entitlements enable row level security;

-- No policies on either table — service_role only (backend webhook +
-- routes/entitlements.js). No frontend code queries these directly.
