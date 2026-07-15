-- ─────────────────────────────────────────────────────────────
-- ReachFlow: leads.list_id — already read/written by routes/leads.js and
-- routes/leadLists.js (list_id filter, bulk import list_id, unassign-on-
-- delete) but never had a migration file committed.
-- Run this AFTER lead_lists.sql.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

alter table leads add column if not exists list_id text references lead_lists(id) on delete set null;

create index if not exists leads_list_id_idx on leads(list_id);
