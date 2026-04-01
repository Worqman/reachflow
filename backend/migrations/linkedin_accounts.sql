-- workspace_linkedin_accounts
-- Associates a Unipile account ID with a specific workspace.
-- One Unipile account can only belong to one workspace at a time.

CREATE TABLE IF NOT EXISTS workspace_linkedin_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    TEXT        NOT NULL,
  unipile_account_id TEXT     NOT NULL,
  name            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unipile_account_id)
);

CREATE INDEX IF NOT EXISTS idx_wla_workspace ON workspace_linkedin_accounts(workspace_id);
