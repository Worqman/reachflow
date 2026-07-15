-- ─────────────────────────────────────────────────────────────
-- ReachFlow: email_accounts — connected-mailbox scaffold for the upcoming
-- email sequencing feature. NOT wired to any route yet — this exists so
-- the schema is in place before OAuth token storage begins.
--
-- SECURITY: never store OAuth access/refresh tokens as plain text in
-- token_ciphertext. Encrypt them first — either via Supabase Vault
-- (vault.create_secret / the decrypted_secrets view) or an
-- application-level envelope (e.g. libsodium sealed box) keyed by a
-- secret that lives only in the backend's env, never in this database.
-- This table should only ever hold ciphertext plus enough metadata to
-- know which key/method decrypts it — see encryption_method.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

create table if not exists email_accounts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       text not null,
  provider           text not null,                        -- gmail | outlook | smtp
  email_address      text not null,
  token_ciphertext   text,                                  -- encrypted OAuth token bundle — see header
  encryption_method  text,                                  -- e.g. 'vault' | 'app-envelope-v1'
  status             text not null default 'connected',     -- connected | disconnected | error
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists email_accounts_workspace_id_idx on email_accounts(workspace_id);

drop trigger if exists email_accounts_updated_at on email_accounts;
create trigger email_accounts_updated_at
  before update on email_accounts
  for each row execute function set_updated_at();

alter table email_accounts enable row level security;
-- No policies yet — backend-only (service_role) once this feature ships.
