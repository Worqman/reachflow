-- ─────────────────────────────────────────────────────────────
-- ReachFlow: retroactive migration for columns that were already referenced
-- in code (backend/src/routes/campaigns.js, backend/src/routes/
-- conversations.js — both guarded by a `.catch(() => {})` "ignore if not
-- migrated") but never had a migration file committed. Adding this now so
-- the schema is reproducible from a clean database.
-- chat_id: links a lead to its Unipile chat thread, so sync-messages and
--   the meeting webhooks can recover prospectId/campaignId from the chat.
-- profile_summary: cached AI-generated LinkedIn profile summary, so it
--   isn't re-fetched/re-summarised on every message.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists chat_id text;
alter table campaign_leads add column if not exists profile_summary text;
