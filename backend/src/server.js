import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./services/supabase.js";

// ── Process-level crash safety net ───────────────────────────────
// Without these, Node's default behavior is to kill the entire process on
// any unhandled promise rejection or uncaught exception — which, with no
// process supervisor auto-restarting it, means a single unrelated bug
// anywhere (a fire-and-forget call missing a .catch, a thrown error in an
// async route handler) takes down every active campaign's sending
// indefinitely, silently, until someone happens to notice and restart the
// process by hand. Logging and continuing trades a small risk (carrying on
// after an exception whose blast radius is unknown) for a much larger,
// already-observed one (total, silent, unbounded outage). Register these
// before anything else initializes so nothing during startup is unguarded.
process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] Uncaught exception:", err);
});

import workspaceRouter from "./routes/workspace.js";
import settingsRouter from "./routes/settings.js";
import agentsRouter from "./routes/agents.js";
import campaignsRouter from "./routes/campaigns.js";
import leadsRouter from "./routes/leads.js";
import leadListsRouter from "./routes/leadLists.js";
import conversationsRouter from "./routes/conversations.js";
import meetingsRouter from "./routes/meetings.js";
import profilesRouter from "./routes/profiles.js";
import companyProfilesRouter from "./routes/companyProfiles.js";
import membersRouter from "./routes/members.js";
import unipileRouter from "./routes/unipile.js";
import dashboardRouter from "./routes/dashboard.js";
import creditsRouter from "./routes/credits.js";
import notificationsRouter from "./routes/notifications.js";
import unipileWebhook from "./webhooks/unipile.js";
import stripeWebhook from "./webhooks/stripe.js";
import entitlementsRouter from "./routes/entitlements.js";
import { startScheduler } from "./services/scheduler.js";
import { initConversationStore } from "./services/store.js";
import { startCampaignQueueWorker, closeCampaignQueue } from "./services/campaignQueue.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Stripe webhook signature verification needs the exact raw request body,
// so this must be registered — with express.raw(), not express.json() —
// before the blanket express.json() below runs and consumes it. It's also
// unauthenticated by design (Stripe, not one of our users, calls this) and
// verifies its own signature instead of going through attachUser/requireAuth.
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "10mb" }));

// ── Auth middleware ───────────────────────────────────────────
// Verifies Supabase JWT and attaches user + workspaceId to req
async function attachUser(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token && supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) req.user = data.user;
    } catch {}
  }
  req.workspaceId = req.headers["x-workspace-id"] || "ws_default";
  next();
}

// Blocks the request if no valid user is attached
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized — please sign in" });
  }
  next();
}

// Verifies the authenticated user is the owner or a member of req.workspaceId
async function verifyWorkspaceMembership(req, res, next) {
  const ws = req.workspaceId;
  // Skip for legacy default workspace (single-tenant dev mode)
  if (!ws || ws === "ws_default") return next();
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  try {
    // Check if owner
    const { data: ownedWs } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", ws)
      .eq("owner_id", req.user.id)
      .maybeSingle();
    if (ownedWs) return next();

    // Check if member
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", ws)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (membership) return next();

    return res.status(403).json({ message: "Access denied to this workspace" });
  } catch (err) {
    console.error("[workspace-auth]", err.message);
    return res
      .status(500)
      .json({ message: "Workspace authorization check failed" });
  }
}

app.use("/api", attachUser);

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    env: process.env.NODE_ENV || "development",
    integrations: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      unipile: !!(process.env.UNIPILE_API_KEY && process.env.UNIPILE_DSN),
      apollo: !!process.env.APOLLO_API_KEY,
      trigify: !!process.env.TRIGIFY_API_KEY,
    },
  });
});

// ── API Routes ────────────────────────────────────────────────

app.use(
  "/api/workspaces",
  requireAuth,
  verifyWorkspaceMembership,
  workspaceRouter,
);
app.use(
  "/api/company-profiles",
  requireAuth,
  verifyWorkspaceMembership,
  companyProfilesRouter,
);
app.use(
  "/api/settings",
  requireAuth,
  verifyWorkspaceMembership,
  settingsRouter,
);
app.use("/api/agents", requireAuth, verifyWorkspaceMembership, agentsRouter);
app.use(
  "/api/campaigns",
  requireAuth,
  verifyWorkspaceMembership,
  campaignsRouter,
);
app.use("/api/leads", requireAuth, verifyWorkspaceMembership, leadsRouter);
app.use(
  "/api/lead-lists",
  requireAuth,
  verifyWorkspaceMembership,
  leadListsRouter,
);
app.use(
  "/api/conversations",
  requireAuth,
  verifyWorkspaceMembership,
  conversationsRouter,
);
app.use(
  "/api/meetings",
  requireAuth,
  verifyWorkspaceMembership,
  meetingsRouter,
);
app.use(
  "/api/profiles",
  requireAuth,
  verifyWorkspaceMembership,
  profilesRouter,
);
app.use("/api/members", requireAuth, verifyWorkspaceMembership, membersRouter);
app.use("/api/unipile", requireAuth, verifyWorkspaceMembership, unipileRouter);
app.use(
  "/api/dashboard",
  requireAuth,
  verifyWorkspaceMembership,
  dashboardRouter,
);
app.use(
  "/api/credits",
  requireAuth,
  verifyWorkspaceMembership,
  creditsRouter,
);
// Notifications are per-user, not workspace-scoped — no membership check needed.
app.use("/api/notifications", requireAuth, notificationsRouter);
// Entitlements (Stripe purchases) are per-user too, not workspace-scoped.
app.use("/api/entitlements", requireAuth, entitlementsRouter);

// ── Webhooks (no auth — called by Unipile/Stripe externally) ──
// /api/webhooks/stripe is mounted earlier (needs express.raw() ahead of
// the global express.json() above) — this only covers the rest.
app.use("/api/webhooks", unipileWebhook);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error]", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
startScheduler();
initConversationStore();
// Campaign sending (connection requests, messages, wait/reply resumption)
// runs through this worker — see services/campaignQueue.js. Requires Redis;
// skipped with a warning if REDIS_URL isn't set, same as other optional
// integrations, but campaign sending itself will fail until it's configured.
if (process.env.REDIS_URL) {
  startCampaignQueueWorker();
} else {
  console.warn("⚠️  REDIS_URL not set — campaign sending is disabled until it's configured (see backend/.env.example).");
}

const server = app.listen(PORT, () => {
  console.log(`\n🚀 eya API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);

  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.UNIPILE_API_KEY) missing.push("UNIPILE_API_KEY");
  if (!process.env.UNIPILE_DSN) missing.push("UNIPILE_DSN");
  if (!process.env.APOLLO_API_KEY) missing.push("APOLLO_API_KEY");
  if (!process.env.TRIGIFY_API_KEY) missing.push("TRIGIFY_API_KEY");
  if (!process.env.REDIS_URL) missing.push("REDIS_URL");
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.STRIPE_PRICE_LIFETIME) missing.push("STRIPE_PRICE_LIFETIME");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_KEY
  )
    missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");

  if (missing.length) {
    console.warn("⚠️  Missing env vars (add to backend/.env):");
    missing.forEach((k) => console.warn(`   - ${k}`));
    console.log();
  } else {
    console.log("✅ All API keys configured\n");
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
// Closes the BullMQ worker/queue cleanly so an in-flight job finishes (or
// is released back for another worker to pick up) instead of being cut off
// mid-processing while still holding an account lock.
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close();
  await closeCampaignQueue().catch((err) => console.error("[shutdown] queue close error:", err.message));
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
