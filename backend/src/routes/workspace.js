import express from "express";
import { supabase } from "../services/supabase.js";
import { PLANS, getPlan } from "../services/plans.js";
import { grantCredits } from "../services/credits.js";

const router = express.Router();

// GET /api/workspaces — fetch workspace for the authenticated user
router.get("/", async (req, res) => {
  const userId = req.user?.id; // comes from your auth middleware
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    return res.status(500).json({ error: error.message });
  }

  res.json({ workspace: data || null });
});

// POST /api/workspaces — create workspace on register
router.post("/", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { name } = req.body;
  if (!name)
    return res.status(400).json({ error: "Workspace name is required" });

  // Prevent duplicates — check if one already exists
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .single();

  if (existing) {
    return res
      .status(409)
      .json({ error: "Workspace already exists", workspace: existing });
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: userId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ workspace: data });
});

// GET /api/workspaces/plan — current plan for the active workspace
router.get("/plan", async (req, res) => {
  const ws = req.workspaceId;
  if (!ws || ws === "ws_default") {
    return res.json({ plan_id: "trial", plan: getPlan("trial") });
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("plan_id")
    .eq("id", ws)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  const planId = data?.plan_id || "trial";
  res.json({ plan_id: planId, plan: getPlan(planId) });
});

// POST /api/workspaces/plan — switch the active workspace onto a plan.
// Only the owner or an admin can change billing. Grants that plan's
// included credits (if any) once, in full, on every switch onto it.
router.post("/plan", async (req, res) => {
  const ws = req.workspaceId;
  if (!ws || ws === "ws_default") {
    return res.status(400).json({ error: "No active workspace" });
  }

  const { plan_id } = req.body;
  const plan = PLANS[plan_id];
  if (!plan) return res.status(400).json({ error: "Unknown plan" });

  const { data: callerMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", ws)
    .eq("user_id", req.user.id)
    .maybeSingle();
  const { data: ownerWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", ws)
    .eq("owner_id", req.user.id)
    .maybeSingle();
  if (!ownerWs && callerMembership?.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Only workspace owners or admins can change the plan" });
  }

  const { error: updateErr } = await supabase
    .from("workspaces")
    .update({ plan_id: plan.id })
    .eq("id", ws);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  let balance = null;
  if (plan.credits) {
    balance = await grantCredits(ws, plan.credits, `plan_upgrade:${plan.id}`);
  }

  res.json({ plan_id: plan.id, plan, balance });
});

export default router;
