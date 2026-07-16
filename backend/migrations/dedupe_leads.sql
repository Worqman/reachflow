-- ─────────────────────────────────────────────────────────────
-- ReachFlow: dedupe safety net for leads + campaign_leads
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Duplicate rows can already exist (created before the app had dedupe
-- checks), so this first cleans those up — keeping the earliest row per
-- duplicate group and deleting the rest — before adding the unique
-- indexes that stop new duplicates from being created.
--
-- Partial (WHERE ... is not null) since provider_id / linkedin_url are
-- sometimes missing (e.g. manually-entered leads) — nulls must stay
-- unconstrained rather than colliding with each other.
-- ─────────────────────────────────────────────────────────────

-- ── leads: drop duplicates by (workspace_id, provider_id) ───────
with ranked as (
  select id, row_number() over (
    partition by workspace_id, provider_id
    order by created_at asc, id asc
  ) as rn
  from leads
  where provider_id is not null
)
delete from leads where id in (select id from ranked where rn > 1);

-- ── leads: drop duplicates by (workspace_id, linkedin_url) ──────
with ranked as (
  select id, row_number() over (
    partition by workspace_id, linkedin_url
    order by created_at asc, id asc
  ) as rn
  from leads
  where linkedin_url is not null
)
delete from leads where id in (select id from ranked where rn > 1);

-- ── campaign_leads: reassign activity history (campaign_lead_activity.lead_id
--    has `on delete cascade`) from duplicates to the surviving row, by
--    (campaign_id, provider_id), before dropping the duplicates ──────
with ranked as (
  select id,
    first_value(id) over (
      partition by campaign_id, provider_id
      order by added_at asc, id asc
    ) as survivor_id,
    row_number() over (
      partition by campaign_id, provider_id
      order by added_at asc, id asc
    ) as rn
  from campaign_leads
  where provider_id is not null
)
update campaign_lead_activity a
set lead_id = r.survivor_id
from ranked r
where r.rn > 1 and a.lead_id = r.id;

with ranked as (
  select id, row_number() over (
    partition by campaign_id, provider_id
    order by added_at asc, id asc
  ) as rn
  from campaign_leads
  where provider_id is not null
)
delete from campaign_leads where id in (select id from ranked where rn > 1);

-- ── campaign_leads: same reassign-then-drop, by (campaign_id, linkedin_url) ──
with ranked as (
  select id,
    first_value(id) over (
      partition by campaign_id, linkedin_url
      order by added_at asc, id asc
    ) as survivor_id,
    row_number() over (
      partition by campaign_id, linkedin_url
      order by added_at asc, id asc
    ) as rn
  from campaign_leads
  where linkedin_url is not null
)
update campaign_lead_activity a
set lead_id = r.survivor_id
from ranked r
where r.rn > 1 and a.lead_id = r.id;

with ranked as (
  select id, row_number() over (
    partition by campaign_id, linkedin_url
    order by added_at asc, id asc
  ) as rn
  from campaign_leads
  where linkedin_url is not null
)
delete from campaign_leads where id in (select id from ranked where rn > 1);

-- ── now safe to add the unique indexes ──────────────────────────
create unique index if not exists leads_workspace_provider_id_idx
  on leads(workspace_id, provider_id) where provider_id is not null;

create unique index if not exists leads_workspace_linkedin_url_idx
  on leads(workspace_id, linkedin_url) where linkedin_url is not null;

create unique index if not exists campaign_leads_campaign_provider_id_idx
  on campaign_leads(campaign_id, provider_id) where provider_id is not null;

create unique index if not exists campaign_leads_campaign_linkedin_url_idx
  on campaign_leads(campaign_id, linkedin_url) where linkedin_url is not null;
