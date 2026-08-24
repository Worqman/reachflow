# ReachFlow — Known Bugs / Fix Backlog

Audit date: 2026-08-24. Findings below are from code inspection plus live checks
against the production Supabase project. Nothing here has been fixed unless the
section says so explicitly.

Severity key: **P0** = exploitable or actively losing data · **P1** = breaks at
current/near scale · **P2** = cleanup, no user-visible impact yet.

---

## Already fixed this session (uncommitted, NOT deployed)

These are done but still only exist in the working tree. Production at
`91.99.29.141:3001` is still running the old code.

| # | Bug | File |
|---|-----|------|
| F1 | Inbox showed LinkedIn *headline* where the company name belongs | `backend/src/routes/unipile.js`, `frontend/src/pages/Inbox.jsx` |
| F2 | `.catch()` called on a Supabase query builder (not a real Promise) — threw `TypeError`, wrongly marking leads `failed` right after a real invite went out | `backend/src/routes/campaigns.js` (2 sites) |
| F3 | CSV import auto-mapped any `company*` header (incl. `company_description`) onto the company field; `"name"` also matched `company_name` | `frontend/src/pages/CampaignDetail.jsx` |
| F4 | BullMQ retained a finished `send-batch` job under the same `jobId`, so every later `add()` was silently swallowed — the cause of the 4-day campaign stall | `backend/src/services/campaignQueue.js` |

---

## P0 — Security / cross-tenant

### S1. Company profiles readable & writable across workspaces
`backend/src/routes/companyProfiles.js:7-20` (GET `/`), `:37-54` (POST `/`)

`GET /api/company-profiles` filters on `req.query.workspace_id` — the **query
string** — while `verifyWorkspaceMembership` only ever validates
`req.workspaceId` (the `x-workspace-id` header). The two are never compared, so
an authenticated user can pass their own workspace in the header and someone
else's in the query and read that workspace's profile (company name, website,
value prop, calendar link, social proof).

It gets worse: `attachUser` defaults `req.workspaceId` to `"ws_default"` when the
header is absent, and `verifyWorkspaceMembership` **returns early without any
check** for `ws_default`. So simply omitting the header skips authorization
entirely.

`POST /` has the mirror problem — it takes `workspace_id` from the request body,
so a user can create a company profile inside another workspace.

*Fix direction:* derive the workspace from `req.workspaceId` only; delete the
query/body fallbacks. Separately, reconsider the blanket `ws_default` bypass in
`server.js:58-62`.

### S2. Webhook endpoint is unauthenticated in production
`backend/src/webhooks/unipile.js:12-21`

The secret check is skipped whenever `UNIPILE_WEBHOOK_SECRET` is unset — and it
is **not set in `.env` or `.env.example`** (verified). `/api/webhooks/*` is
mounted before no auth middleware at `server.js:171`.

Anyone who can reach the host can POST forged Unipile events and drive real
outbound behaviour: advance sequence steps, trigger LinkedIn message sends, mark
leads as replied/connected.

*Fix direction:* set the secret and make a missing secret fail closed in
production (only allow the skip when `NODE_ENV !== 'production'`).

### S3. IDOR on agent sub-resources
`backend/src/routes/agents.js` — these are scoped by `agent_id` only, with no
`workspace_id` predicate:

- `GET /:id/signal-events` (:259)
- `GET /:id/scores/:providerId` (:400 → `getScore`, `services/signalScoring.js:445`)
- `PATCH /:id/scores/:providerId/status` (:408) — **write**
- `PATCH /:id/signal-events/:eventId/action` (:450) — **write**

Sibling routes in the same file (`:101`, `:129`, `:480`, `:540`) *do* filter on
workspace, so this is an inconsistency rather than a deliberate design. Agent IDs
are `agent_` + 8 hex chars.

### S4. Inbox enrichment crosses tenants
`backend/src/routes/unipile.js:162` (`enrichChats`)

Looks up `campaign_leads` and `leads` by `provider_id` with no `workspace_id`
filter, though both tables have the column. If two workspaces have the same
LinkedIn person as a lead — routine in a sales tool — one workspace's Inbox can
render the other's stored name/title/company. Pre-existing; not introduced by the
F1 fix, but that fix touches this function.

### S5. Connection webhook picks a lead across tenants
`backend/src/webhooks/unipile.js:32-38` (`handleNewConnection`)

`.eq('provider_id', …).limit(1).maybeSingle()` with no workspace filter. With the
same prospect in two workspaces, an accepted invite can advance the **wrong**
workspace's campaign — sending that workspace's messages to the prospect.

---

## P1 — Correctness at scale

### M1. Unbounded selects silently truncate at 1000 rows
Verified live: an unbounded `select` on `campaign_leads` returned **1000 rows
against a true count of 2537**. PostgREST caps and does not error.

Affected (no `.limit()` / `.range()` / pagination):

- `backend/src/services/scheduler.js:124` — `resumePendingSteps`. **Most serious**:
  past 1000 leads with a `pending_step`, the overflow never resumes. Sequences
  silently stall forever.
- `backend/src/services/scheduler.js:73` and `:91` — `backfillLegacyPendingSteps`.
  Self-draining, so it recovers across ticks, but slowly.
- `backend/src/routes/dashboard.js:31` — under-reports stats once a workspace
  passes 1000 leads.

*Fix direction:* paginate with `.range()` in a loop, or push the deadline filter
into the query (`pending_step->>deadline <= now`) so the result set stays small.

### M2. Pending step is claimed before the work is done
`backend/src/routes/campaigns.js:1206-1214`

`resumeFromPendingStep` sets `pending_step: null` to atomically claim the lead,
then performs the sequence step. The atomic claim correctly prevents
double-sends — but if the process dies between the claim and completion, the lead
has no `pending_step` and no scheduler backstop will ever pick it up again. It is
stranded silently.

Given the process demonstrably went down for ~4 days recently, this is a live
risk, not a theoretical one.

*Fix direction:* claim into an in-progress marker with its own deadline rather
than nulling, and clear it only on success.

### M3. Scheduler bypasses the queue it's documented to dedup against
`backend/src/services/scheduler.js:136` vs `backend/src/services/campaignQueue.js:101-103`

The queue comment states the `resume_${claimId}` jobId "dedupes against the
scheduler's `resumePendingSteps` backstop picking up the same deadline
independently" — but the scheduler calls `resumeFromPendingStep()` **directly**,
never `enqueueResumePendingStep()`. That dedup path is therefore never exercised.

No data corruption results (M2's `claimId` check is the real guard), but these
resumes run outside BullMQ, losing retries, backoff and restart durability — and
the code comment describes a design that isn't in effect.

---

## P2 — Cleanup

### C1. `_profileCache` never evicts
`backend/src/routes/unipile.js:95`

TTL is checked on read but expired entries are never deleted, and there's no size
cap. Grows unbounded for the life of the process, keyed by every LinkedIn
provider_id the Inbox has ever seen.

### C2. `preConnectSnapshot` never cleaned
`backend/src/routes/unipile.js:16` — same pattern, keyed by workspace. Small, but
never released.

---

## Known bad data (deliberately left alone)

`camp_a331694c` ("London Accountants") — **250 of 273 leads** have a LinkedIn
company *description* stored in `campaign_leads.company`, averaging 686
characters, from the F3 import bug.

- Contained to this one campaign; no other campaign is affected.
- **Not** reaching prospects: this campaign's sequence uses only `{firstName}`,
  never `{company}`.
- Recovery from the `title` field (`"Director at N S Accounting"`) works for only
  3 of 250, so a re-import of the original CSV is the only real path back.
- One lead (`lead_c590eebb…`) is marked `failed` by the F2 bug despite its
  connection request actually having been sent on LinkedIn.

Display will still look wrong for these leads even after F1 deploys — F1 makes
the Inbox read the correct *column*; that column's contents are the problem.
