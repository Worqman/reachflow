# Migrations

There's no Supabase CLI project wired up here — these are plain `.sql` files meant to be run one at a time in the Supabase Dashboard → SQL Editor. Every file is idempotent (`create table if not exists`, `add column if not exists`, `drop policy if exists`), so re-running the whole list against a database that already has some of these tables is safe.

To rebuild the schema from scratch, run them in this order:

1. `campaigns.sql` — creates `set_updated_at()`, used by several later files
2. `campaign_leads_chat_profile.sql`
3. `campaign_leads_last_error.sql`
4. `campaign_leads_lead_status.sql`
5. `campaign_leads_pending_step.sql`
6. `campaign_leads_reply_branch.sql`
7. `campaign_leads_sequence_step.sql`
8. `campaign_leads_tags.sql`
9. `campaign_leads_timestamps.sql`
10. `campaign_leads_personalized_opening.sql`
11. `campaign_lead_activity.sql`
12. `agents.sql`
13. `agents_signal_fields.sql`
14. `signal_events.sql`
15. `signal_events_provider_id.sql`
16. `signal_scores.sql`
17. `signal_scores_feed_fields.sql`
18. `scoring_config.sql`
19. `leads.sql`
20. `lead_lists.sql`
21. `leads_list_id.sql`
22. `linkedin_accounts.sql`
22a. `linkedin_account_safety.sql` — run right after the above
23. `unipile_send_log.sql`
23a. `unipile_send_log_action_types.sql` — run right after the above
24. `company_profiles.sql`
25. `workspace_members.sql`
26. `workspaces.sql`
27. `workspace_invites.sql`
28. `profiles.sql`
29. `conversations.sql`
30. `meetings.sql`
31. `email_accounts.sql` — scaffold only, not wired to any route yet
32. `email_messages.sql` — scaffold only, not wired to any route yet
33. `automation_logs.sql` — scaffold only, not wired to any route yet
34. `fix_rls_policies.sql` — run last; tightens RLS on tables created above

## One-off data cleanups (not part of the rebuild list above)

These aren't schema migrations — they fix bad data left over from a bug, not
missing tables/columns. Run once, whenever needed; each is idempotent (safe
to re-run, it'll just find nothing left to fix).

- `fix_org_linkedin_urls.sql` — nulls out `linkedin_url` values that are
  actually a LinkedIn company/school/showcase page instead of the person's
  own `/in/…` profile (leftover from a `normaliseProfile` bug in
  LeadFinder.jsx / LeadFinderModal.jsx, fixed going forward).

## Not yet built

`pipeline_stages` / `pipeline_records` are referenced in planning docs but nothing in the codebase reads or writes them yet — no migration exists for them. Add one once that feature has a concrete shape (columns needed depend on how the pipeline UI ends up modeling stages).

## Why most tables have no RLS policies

The backend's Supabase client always authenticates as `service_role`, and Supabase's `service_role` Postgres role has `BYPASSRLS` set — it ignores RLS entirely, policies or not. So for any table only ever touched through a backend route, enabling RLS with **zero** policies is correct: it default-denies the `anon`/`authenticated` key (used if the frontend ever queried it directly) while leaving the backend fully functional.

Only `workspaces` and `profiles` have real policies, because the frontend queries them directly with the signed-in user's own session (see `Onboarding.jsx` and `Register.jsx`).
