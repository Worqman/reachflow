import { supabase } from "./supabase.js";

// Finds an Eya account by email. There's no direct "get user by email" in
// the supabase-js admin API (only listUsers, paginated) — this only runs
// from the Stripe webhook (one purchase at a time, not a hot path), so an
// exact case-insensitive scan over listUsers is fine. Capped at 50 pages
// (50k users) as a sanity bound; if that's ever exceeded, the purchase is
// still stored as a pending entitlement and picked up on the buyer's next
// login via attachPendingEntitlement below.
async function findUserIdByEmail(email) {
  if (!supabase || !email) return null;
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("[entitlements] listUsers failed:", error.message);
      return null;
    }
    const users = data?.users || [];
    const match = users.find((u) => (u.email || "").toLowerCase() === target);
    if (match) return match.id;
    if (users.length < perPage) break; // last page
  }
  return null;
}

// The entitlement that should currently govern access for this user, if
// any — used for access checks (see routes/entitlements.js). Reads only
// our own DB; never calls Stripe.
export async function getActiveEntitlement(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[entitlements] getActiveEntitlement failed:", error.message);
    return null;
  }
  return data || null;
}

// Links any unattached entitlement bought under this email to this account,
// once we know the email is verified — called on the buyer's first
// authenticated request after they confirm their address (see attachUser in
// server.js). Requires email_confirmed_at so a signup with someone else's
// (unverified) email can't claim their paid entitlement before proving they
// own that address.
export async function attachPendingEntitlement(user) {
  if (!supabase || !user?.id || !user?.email) return null;
  if (!user.email_confirmed_at) return null;

  const email = user.email.toLowerCase();
  const { data: pending, error: findErr } = await supabase
    .from("entitlements")
    .select("id")
    .eq("email", email)
    .is("user_id", null)
    .limit(1)
    .maybeSingle();
  if (findErr || !pending) return null;

  const { error: updateErr } = await supabase
    .from("entitlements")
    .update({ user_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .is("user_id", null); // guards a race with a second concurrent request

  if (updateErr) {
    console.warn("[entitlements] attach failed:", updateErr.message);
    return null;
  }
  console.log(`[entitlements] Attached pending entitlement ${pending.id} to user ${user.id} (${email})`);
  return pending.id;
}

// Stores a purchase as an entitlement — attaching it to an existing account
// by email when one exists, otherwise leaving user_id null (pending) for
// attachPendingEntitlement to pick up once that person registers/confirms.
export async function recordEntitlement({
  email,
  plan,
  stripeCustomerId,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  stripePriceId,
  purchasedAt,
}) {
  if (!supabase) return null;
  const normalizedEmail = email.toLowerCase();

  // Idempotency backstop alongside the stripe_events dedup table — a second
  // insert attempt for the same checkout session hits the unique constraint.
  const { data: existing } = await supabase
    .from("entitlements")
    .select("id")
    .eq("stripe_checkout_session_id", stripeCheckoutSessionId)
    .maybeSingle();
  if (existing) return existing.id;

  const userId = await findUserIdByEmail(normalizedEmail);

  const { data, error } = await supabase
    .from("entitlements")
    .insert({
      email: normalizedEmail,
      user_id: userId,
      plan,
      status: "active",
      access_expires_at: null,
      stripe_customer_id: stripeCustomerId || null,
      stripe_checkout_session_id: stripeCheckoutSessionId,
      stripe_payment_intent_id: stripePaymentIntentId || null,
      stripe_price_id: stripePriceId,
      purchased_at: purchasedAt,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null; // duplicate session id — already recorded
    console.error("[entitlements] recordEntitlement failed:", error.message);
    return null;
  }

  console.log(
    userId
      ? `[entitlements] ${plan} entitlement activated for existing user ${userId} (${normalizedEmail})`
      : `[entitlements] ${plan} entitlement stored as pending for ${normalizedEmail} — no Eya account yet`,
  );
  return data.id;
}
