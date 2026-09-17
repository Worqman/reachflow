import Stripe from "stripe";

// Shared Stripe SDK instance — used by webhooks/stripe.js (signature
// verification + line item lookup) and routes/entitlements.js (creating
// Checkout Sessions for the logged-in-user purchase flow).
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
