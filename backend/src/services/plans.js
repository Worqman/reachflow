// ── Plan limits ──────────────────────────────────────────────────
// Single source of truth for what each plan includes. Referenced by
// routes/workspace.js (upgrade endpoint), routes/unipile.js (LinkedIn
// account cap) and routes/members.js (invite cap).
//
// `accounts`/`members` are hard caps enforced at connect/invite time.
// `credits` (when set) is granted once, in full, whenever a workspace
// switches onto that plan (see routes/workspace.js POST /plan) — it is
// not a starting balance, it's what that plan's price includes.
// `null` means unlimited / not enforced.
export const PLANS = {
  trial: {
    id: "trial",
    name: "Free Trial",
    price: 0,
    currency: "usd",
    accounts: 1,
    members: null,
    credits: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 49,
    currency: "usd",
    accounts: 1,
    members: null,
    credits: null,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 129,
    currency: "usd",
    accounts: 3,
    members: null,
    credits: null,
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 299,
    currency: "usd",
    accounts: 10,
    members: null,
    credits: null,
  },
  team: {
    id: "team",
    name: "Lifetime Access",
    price: 149,
    currency: "gbp",
    accounts: 3,
    members: 5,
    credits: 3000,
  },
};

export function getPlan(planId) {
  return PLANS[planId] || PLANS.trial;
}
