import express from "express";
import { supabase } from "../services/supabase.js";

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

export default router;
