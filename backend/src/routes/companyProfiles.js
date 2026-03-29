import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// GET /api/company-profiles?workspace_id=xxx
router.get("/", async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id)
    return res.status(400).json({ error: "workspace_id is required" });

  const { data, error } = await supabase
    .from("company_profiles")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profiles: data });
});

// GET /api/company-profiles/:id
router.get("/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("company_profiles")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Profile not found" });
  res.json({ profile: data });
});

// POST /api/company-profiles — create
router.post("/", async (req, res) => {
  const {
    workspace_id,
    company_name,
    website_url,
    company_description,
    value_proposition,
    services_offered,
    tone_preference,
    calendar_link,
    social_proof,
  } = req.body;

  if (!workspace_id || !company_name) {
    return res
      .status(400)
      .json({ error: "workspace_id and company_name are required" });
  }

  const { data, error } = await supabase
    .from("company_profiles")
    .insert({
      workspace_id,
      company_name,
      website_url,
      company_description,
      value_proposition,
      services_offered: services_offered || [],
      tone_preference,
      calendar_link,
      social_proof: social_proof || [],
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ profile: data });
});

// PUT /api/company-profiles/:id — full edit
router.put("/:id", async (req, res) => {
  const {
    company_name,
    website_url,
    company_description,
    value_proposition,
    services_offered,
    tone_preference,
    calendar_link,
    social_proof,
  } = req.body;

  const { data, error } = await supabase
    .from("company_profiles")
    .update({
      company_name,
      website_url,
      company_description,
      value_proposition,
      services_offered,
      tone_preference,
      calendar_link,
      social_proof,
    })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

// DELETE /api/company-profiles/:id
router.delete("/:id", async (req, res) => {
  const { error } = await supabase
    .from("company_profiles")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
