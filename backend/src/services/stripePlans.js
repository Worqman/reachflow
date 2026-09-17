// ── Stripe Price ID → Eya plan mapping ──────────────────────────
// Deliberately keyed by Price ID, not amount — "£149" isn't a safe way to
// recognise the lifetime deal since we may sell other £149 products later
// (see webhooks/stripe.js). Each plan's Price ID comes from an env var so
// adding monthly/annual later is just a new STRIPE_PRICE_* var + one line
// here — no schema or webhook changes needed.
const PRICE_ENV_TO_PLAN = {
  STRIPE_PRICE_LIFETIME: "lifetime",
  // STRIPE_PRICE_MONTHLY: "monthly",
  // STRIPE_PRICE_ANNUAL: "annual",
};

export const STRIPE_PRICE_TO_PLAN = Object.fromEntries(
  Object.entries(PRICE_ENV_TO_PLAN)
    .filter(([envVar]) => !!process.env[envVar])
    .map(([envVar, plan]) => [process.env[envVar], plan]),
);

export function planForPriceId(priceId) {
  if (!priceId) return null;
  return STRIPE_PRICE_TO_PLAN[priceId] || null;
}
