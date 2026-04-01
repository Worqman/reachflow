import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./services/supabase.js";

import workspaceRouter from "./routes/workspace.js";
import settingsRouter from "./routes/settings.js";
import agentsRouter from "./routes/agents.js";
import campaignsRouter from "./routes/campaigns.js";
import leadsRouter from "./routes/leads.js";
import conversationsRouter from "./routes/conversations.js";
import meetingsRouter from "./routes/meetings.js";
import profilesRouter from "./routes/profiles.js";
import companyProfilesRouter from "./routes/companyProfiles.js";
import membersRouter from "./routes/members.js";
import unipileRouter from "./routes/unipile.js";
import dashboardRouter from "./routes/dashboard.js";
import unipileWebhook from "./webhooks/unipile.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "https://dev-reachflow.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
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
  const ws = req.workspaceId
  // Skip for legacy default workspace (single-tenant dev mode)
  if (!ws || ws === 'ws_default') return next()
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' })

  try {
    // Check if owner
    const { data: ownedWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', ws)
      .eq('owner_id', req.user.id)
      .maybeSingle()
    if (ownedWs) return next()

    // Check if member
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', ws)
      .eq('user_id', req.user.id)
      .maybeSingle()
    if (membership) return next()

    return res.status(403).json({ message: 'Access denied to this workspace' })
  } catch (err) {
    console.error('[workspace-auth]', err.message)
    return res.status(500).json({ message: 'Workspace authorization check failed' })
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

app.use("/api/workspaces",       requireAuth, verifyWorkspaceMembership, workspaceRouter);
app.use("/api/company-profiles", requireAuth, verifyWorkspaceMembership, companyProfilesRouter);
app.use("/api/settings",         requireAuth, verifyWorkspaceMembership, settingsRouter);
app.use("/api/agents",           requireAuth, verifyWorkspaceMembership, agentsRouter);
app.use("/api/campaigns",        requireAuth, verifyWorkspaceMembership, campaignsRouter);
app.use("/api/leads",            requireAuth, verifyWorkspaceMembership, leadsRouter);
app.use("/api/conversations",    requireAuth, verifyWorkspaceMembership, conversationsRouter);
app.use("/api/meetings",         requireAuth, verifyWorkspaceMembership, meetingsRouter);
app.use("/api/profiles",         requireAuth, verifyWorkspaceMembership, profilesRouter);
app.use("/api/members",          requireAuth, verifyWorkspaceMembership, membersRouter);
app.use("/api/unipile",          requireAuth, verifyWorkspaceMembership, unipileRouter);
app.use("/api/dashboard",        requireAuth, verifyWorkspaceMembership, dashboardRouter);

// ── Webhooks (no auth — called by Unipile externally) ─────────
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
app.listen(PORT, () => {
  console.log(`\n🚀 ReachFlow API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);

  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.UNIPILE_API_KEY) missing.push("UNIPILE_API_KEY");
  if (!process.env.UNIPILE_DSN) missing.push("UNIPILE_DSN");
  if (!process.env.APOLLO_API_KEY) missing.push("APOLLO_API_KEY");
  if (!process.env.TRIGIFY_API_KEY) missing.push("TRIGIFY_API_KEY");
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
