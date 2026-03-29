import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

// GET /api/profiles — list profiles from database
router.get("/", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      message:
        "Supabase is not configured on the backend. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company_name, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ message: error.message });
  res.json({ profiles: data || [] });
});

export default router;
