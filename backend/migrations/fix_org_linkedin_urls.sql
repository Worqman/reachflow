-- ─────────────────────────────────────────────────────────────
-- One-off cleanup: some leads (imported before the normaliseProfile fix in
-- LeadFinder.jsx / LeadFinderModal.jsx) have an organization page URL
-- (linkedin.com/company/…, /school/…, /showcase/…) stored in linkedin_url
-- instead of the person's own /in/… profile. That badge should never point
-- at a company page, so this nulls those values out rather than guess a
-- replacement — the "View LinkedIn profile" badge just won't render until
-- someone re-adds the correct personal URL.
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────

-- Step 1 — PREVIEW (read-only): see exactly what would be affected before
-- running the updates below. Run this first.
select id, name, company, linkedin_url, 'campaign_leads' as source_table
from campaign_leads
where linkedin_url ~* 'linkedin\.com/(company|school|showcase)/'
union all
select id, name, company, linkedin_url, 'leads' as source_table
from leads
where linkedin_url ~* 'linkedin\.com/(company|school|showcase)/';

-- Step 2 — once you've confirmed the preview looks right, run these two
-- updates to null out the bad values.

update campaign_leads
set linkedin_url = null
where linkedin_url ~* 'linkedin\.com/(company|school|showcase)/';

update leads
set linkedin_url = null
where linkedin_url ~* 'linkedin\.com/(company|school|showcase)/';
