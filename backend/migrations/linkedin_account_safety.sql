-- ─────────────────────────────────────────────────────────────
-- Account-level LinkedIn sending safety settings
-- Adds a pause switch + a settings blob (daily limits, active
-- sending hours, delay range, warm-up mode) to each connected
-- LinkedIn account. Mirrors the campaigns.settings jsonb pattern.
-- ─────────────────────────────────────────────────────────────

alter table workspace_linkedin_accounts
  add column if not exists paused boolean not null default false;

alter table workspace_linkedin_accounts
  add column if not exists safety_settings jsonb not null default '{
    "dailyConnectionLimit": 20,
    "dailyMessageLimit": 40,
    "activeDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "activeHours": { "start": "08:00", "end": "18:00" },
    "timezone": "UTC",
    "sendingDelay": { "min": 15, "max": 20 },
    "warmupMode": false
  }'::jsonb;
