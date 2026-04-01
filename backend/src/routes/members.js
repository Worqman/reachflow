import express from "express";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);

// ── GET /api/members?workspace_id=xxx ──────────────────────────────
// Returns confirmed members + pending invites
router.get("/", async (req, res) => {
  const workspace_id = req.workspaceId || req.query.workspace_id;
  if (!workspace_id)
    return res.status(400).json({ error: "workspace_id required" });

  const [
    { data: memberRows, error: membersErr },
    { data: invites, error: invitesErr },
  ] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("id, user_id, role, joined_at")
      .eq("workspace_id", workspace_id)
      .order("joined_at"),
    supabase
      .from("workspace_invites")
      .select("id, email, role, status, expires_at, created_at")
      .eq("workspace_id", workspace_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  if (membersErr) return res.status(500).json({ error: membersErr.message });
  if (invitesErr) return res.status(500).json({ error: invitesErr.message });

  // Avoid relying on PostgREST relationship cache for auth.users joins.
  const uniqueUserIds = [...new Set((memberRows || []).map((m) => m.user_id).filter(Boolean))];
  const userById = {};
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(uid);
        const u = data?.user;
        if (u) {
          userById[uid] = {
            id: u.id,
            email: u.email || null,
            raw_user_meta_data: u.user_metadata || null,
          };
        }
      } catch {
        // Best-effort enrichment only.
      }
    }),
  );

  const members = (memberRows || []).map((m) => ({
    id: m.id,
    role: m.role,
    joined_at: m.joined_at,
    user_id: m.user_id,
    user: userById[m.user_id] || { id: m.user_id, email: null, raw_user_meta_data: null },
  }));

  res.json({ members, invites });
});

// ── POST /api/members/invite ───────────────────────────────────────
router.post("/invite", async (req, res) => {
  try {
    const { workspace_id, email, role = "member" } = req.body;
    if (!workspace_id || !email)
      return res.status(400).json({ error: "workspace_id and email required" });

    // Verify caller is owner or admin
    const { data: callerMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', req.user.id)
      .maybeSingle()
    const { data: ownerWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspace_id)
      .eq('owner_id', req.user.id)
      .maybeSingle()
    if (!ownerWs && callerMembership?.role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners or admins can invite members' })
    }

    let invitedBy = req.user?.id || null;
    if (!invitedBy) {
      const { data: workspaceRow } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .single();
      invitedBy = workspaceRow?.owner_id || null;
    }

    // Upsert invite (handles resend too — resets token + expiry)
    const { data: invite, error: inviteErr } = await supabase
      .from("workspace_invites")
      .upsert(
        {
          workspace_id,
          email,
          role,
          invited_by: invitedBy,
          status: "pending",
          token: randomBytes(32).toString("hex"),
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        { onConflict: "workspace_id,email" },
      )
      .select()
      .single();

    if (inviteErr) return res.status(500).json({ error: inviteErr.message });

    // Send invite email via Supabase Auth
    const inviteUrl = `${process.env.FRONTEND_URL}/members?token=${invite.token}`;

    const { error: emailErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: inviteUrl,
        data: { workspace_id, role, invite_token: invite.token },
      },
    );

    if (emailErr) return res.status(500).json({ error: emailErr.message });

    res.status(201).json({ invite });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to invite user" });
  }
});

// ── PATCH /api/members/:memberId/role ─────────────────────────────
router.patch("/:memberId/role", async (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: "role required" });

  // Prevent changing owner role
  const { data: target } = await supabase
    .from("workspace_members")
    .select("role, workspace_id")
    .eq("id", req.params.memberId)
    .single();

  if (target?.workspace_id !== req.workspaceId) {
    return res.status(403).json({ error: 'Access denied' })
  }

  if (target?.role === "owner")
    return res.status(403).json({ error: "Cannot change owner role" });

  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("id", req.params.memberId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ member: data });
});

// ── DELETE /api/members/:memberId ─────────────────────────────────
router.delete("/:memberId", async (req, res) => {
  // Prevent removing owner
  const { data: target } = await supabase
    .from("workspace_members")
    .select("role, workspace_id")
    .eq("id", req.params.memberId)
    .single();

  if (target?.workspace_id !== req.workspaceId) {
    return res.status(403).json({ error: 'Access denied' })
  }

  if (target?.role === "owner")
    return res.status(403).json({ error: "Cannot remove the workspace owner" });

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", req.params.memberId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── DELETE /api/members/invites/:inviteId ─────────────────────────
router.delete("/invites/:inviteId", async (req, res) => {
  const { error } = await supabase
    .from("workspace_invites")
    .delete()
    .eq("id", req.params.inviteId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── POST /api/members/invites/:inviteId/resend ────────────────────
router.post("/invites/:inviteId/resend", async (req, res) => {
  const { data: invite, error: fetchErr } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("id", req.params.inviteId)
    .single();

  if (fetchErr || !invite)
    return res.status(404).json({ error: "Invite not found" });

  // Reset token + expiry
  const newToken = randomBytes(32).toString("hex");
  await supabase
    .from("workspace_invites")
    .update({
      token: newToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
    })
    .eq("id", invite.id);

  const inviteUrl = `${process.env.FRONTEND_URL}/members?token=${newToken}`;
  await supabase.auth.admin.inviteUserByEmail(invite.email, {
    redirectTo: inviteUrl,
  });

  res.json({ success: true });
});

// ── POST /api/members/accept ──────────────────────────────────────
// Called on frontend after user lands on /invite?token=xxx and is authed
router.post("/accept", async (req, res) => {
  const { token, user_id } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });

  const { data: invite, error: inviteErr } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (inviteErr || !invite)
    return res.status(404).json({ error: "Invalid or expired invite" });
  if (new Date(invite.expires_at) < new Date()) {
    await supabase
      .from("workspace_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return res.status(410).json({ error: "Invite has expired" });
  }

  // Prefer authenticated user id when available; fallback to body user_id.
  const userId = req.user?.id || user_id || null;

  if (!userId) {
    return res.status(400).json({
      error: "Could not resolve invited user. Please complete auth via invite link first.",
    });
  }

  // Add to workspace_members
  const { error: memberErr } = await supabase.from("workspace_members").insert({
    workspace_id: invite.workspace_id,
    user_id: userId,
    role: invite.role,
  });

  if (memberErr && memberErr.code !== "23505") {
    // ignore duplicate
    return res.status(500).json({ error: memberErr.message });
  }

  // Mark invite accepted
  await supabase
    .from("workspace_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);

  res.json({ success: true, workspace_id: invite.workspace_id });
});

export default router;
