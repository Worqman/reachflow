import { Router } from "express";
import Stripe from "stripe";
import { supabase } from "../services/supabase.js";
import { planForPriceId } from "../services/stripePlans.js";
import { recordEntitlement } from "../services/entitlements.js";

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// POST /api/webhooks/stripe (this router is mounted at that full path in
// server.js — its own route below is "/", not "/stripe").
// Mounted with express.raw() BEFORE the global express.json() middleware —
// Stripe signature verification needs the exact raw request bytes, not a
// re-serialized parsed body.
router.post("/", async (req, res) => {
  if (!stripe || !webhookSecret) {
    console.error("[stripe webhook] STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency: claim this event id before doing any work. Stripe retries
  // on timeout/non-2xx and can redeliver — a unique-violation here means
  // we've already processed it, so skip without touching the DB again.
  if (supabase) {
    const { error: claimErr } = await supabase
      .from("stripe_events")
      .insert({ id: event.id, type: event.type });
    if (claimErr) {
      if (claimErr.code === "23505") {
        return res.status(200).json({ received: true, duplicate: true });
      }
      console.error("[stripe webhook] Failed to claim event (DB unavailable?):", claimErr.message);
      // Ask Stripe to retry later rather than silently dropping the event —
      // without the claim row we can't guarantee idempotency.
      return res.status(500).send("Internal error");
    }
  }

  res.status(200).json({ received: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      default:
        console.log("[stripe webhook] Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("[stripe webhook] Error processing event:", event.id, err);
  }
});

async function handleCheckoutCompleted(session) {
  if (session.mode !== "payment") return; // subscriptions arrive via other events later

  const email = (session.customer_details?.email || session.customer_email || "").trim();
  if (!email) {
    console.warn("[stripe webhook] checkout.session.completed with no email — session", session.id);
    return;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  let plan = null;
  let priceId = null;
  for (const item of lineItems.data) {
    const matched = planForPriceId(item.price?.id);
    if (matched) {
      plan = matched;
      priceId = item.price.id;
      break;
    }
  }

  if (!plan) {
    console.log(`[stripe webhook] session ${session.id} has no recognised plan price — ignoring`);
    return;
  }

  await recordEntitlement({
    email,
    plan,
    stripeCustomerId: session.customer || null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    stripePriceId: priceId,
    purchasedAt: new Date((session.created || Date.now() / 1000) * 1000).toISOString(),
  });
}

export default router;
