import { Router } from "express";
import { getActiveEntitlement, attachPendingEntitlement } from "../services/entitlements.js";

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

export default router;
