-- ─────────────────────────────────────────────────────────────
-- Widen unipile_send_log.action_type to cover every frequency-limited
-- sequence action, not just connection_request/message. This lets the
-- campaign sequence executor enforce all seven daily limits (Connection
-- Requests, Messages, InMails, AI Comments, Likes to posts, Profile visits,
-- Follow Lead) against this persisted table instead of the in-memory
-- counters in services/limits.js — which reset on every backend restart and
-- aren't shared across multiple backend processes, silently letting far more
-- than the configured limit go out per day.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────

alter table unipile_send_log drop constraint if exists unipile_send_log_action_type_check;

alter table unipile_send_log add constraint unipile_send_log_action_type_check
  check (action_type in (
    'connection_request',
    'message',
    'inmail',
    'profile_visit',
    'like_post',
    'follow',
    'comment_post'
  ));
