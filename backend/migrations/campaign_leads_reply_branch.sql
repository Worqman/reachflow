-- ─────────────────────────────────────────────────────────────
-- ReachFlow: track a lead paused mid-sequence awaiting a reply to a
-- message/message_open/inmail step, so the Replied/Not Replied branch
-- can be resumed by the message_received webhook or a timeout poll.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table campaign_leads add column if not exists reply_wait_step integer;
alter table campaign_leads add column if not exists reply_wait_deadline timestamptz;
