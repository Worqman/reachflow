import { Router } from "express";
import { getActiveEntitlement, attachPendingEntitlement } from "../services/entitlements.js";
import { stripe } from "../services/stripeClient.js";

const router = Router();

// GET /api/entitlements/me — this account's current entitlement (e.g.
// lifetime access), read entirely from our own DB (never calls Stripe).
// First links any pending entitlement bought under this user's verified
// email before their Eya account existed — a no-op once already linked or
// when there's nothing pending. The frontend should call this once after
// login/signup-confirmation so that attach actually happens; deliberately
// not done on every API request, which would add a DB round-trip app-wide.
router.get("/me", async (req, res) => {
  await attachPendingEntitlement(req.user);
  const entitlement = await getActiveEntitlement(req.user.id);
  res.json({ entitlement });
});

// POST /api/entitlements/checkout — starts a Stripe Checkout Session for
// the logged-in user to buy lifetime access. This is the primary purchase
// path (see pages/LifetimeAccess.jsx): unlike the standalone Payment Link,
// client_reference_id ties the session to this Eya account directly, so
// the webhook can assign the entitlement without matching by email.
router.post("/checkout", async (req, res) => {
  if (!stripe) return res.status(500).json({ message: "Stripe not configured" });
  const priceId = process.env.STRIPE_PRICE_LIFETIME;
  if (!priceId) return res.status(500).json({ message: "Lifetime price not configured" });

  const existing = await getActiveEntitlement(req.user.id);
  if (existing) {
    return res.status(400).json({ message: "You already have an active entitlement", entitlement: existing });
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.id,
      metadata: { eya_user_id: req.user.id },
      customer_email: req.user.email,
      success_url: `${frontendUrl}/lifetime-access?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/lifetime-access?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("[entitlements] checkout session creation failed:", err.message);
    res.status(500).json({ message: "Failed to start checkout" });
  }
});

export default router;
