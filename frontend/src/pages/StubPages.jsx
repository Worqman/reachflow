import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Modal from "../components/Modal";
import {
  getActiveWorkspaceId,
  onActiveWorkspaceChange,
  setActiveWorkspaceId,
} from "../lib/workspaceState";
import { members as membersApi } from "../lib/api";
import { useToast } from "../components/Toast";
import "./Members.css";
import "./Workspaces.css";

export function Workspaces() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState(getActiveWorkspaceId());
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingWs, setEditingWs] = useState(null);
  const [editName, setEditName] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured.");

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const currentUser = userRes?.user || null;
      setUser(currentUser);

      if (!currentUser) {
        setWorkspaces([]);
        return;
      }

      const { data, error: wsErr } = await supabase
        .from("workspaces")
        .select("*")
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (wsErr) throw wsErr;
      const owned = data || [];

      const { data: memberRows, error: memberErr } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", currentUser.id);

      // Silently ignore: table may not exist yet (500) or RLS recursion
      const safeMemberRows = memberErr ? [] : memberRows || [];
      const memberIds = [
        ...new Set(safeMemberRows.map((r) => r.workspace_id).filter(Boolean)),
      ];
      let memberWorkspaces = [];
      if (memberIds.length) {
        const { data: joinedWs, error: joinedErr } = await supabase
          .from("workspaces")
          .select("*")
          .in("id", memberIds);
        if (joinedErr) throw joinedErr;
        memberWorkspaces = joinedWs || [];
      }

      const seen = new Set();
      const list = [...owned, ...memberWorkspaces].filter((ws) => {
        const id = String(ws?.id || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setWorkspaces(list);

      const stored = getActiveWorkspaceId();
      const nextActive =
        stored && list.some((w) => String(w.id) === String(stored))
          ? stored
          : list[0]?.id || null;
      setActiveId(nextActive);
      if (!stored && nextActive) setActiveWorkspaceId(nextActive);
    } catch (e) {
      setError(e?.message || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const unsub = onActiveWorkspaceChange((id) => setActiveId(id));
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateModal() {
    setError("");
    setName("");
    setModalOpen(true);
  }

  function openEditModal(ws) {
    setError("");
    setEditingWs(ws);
    setEditName(ws?.name || "");
    setEditOpen(true);
  }

  async function createWorkspace() {
    setCreating(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!user?.id)
        throw new Error("You must be signed in to create a workspace.");
      if (!name.trim()) throw new Error("Workspace name is required.");

      const { error: insertErr } = await supabase
        .from("workspaces")
        .insert({ name: name.trim(), owner_id: user.id });

      if (insertErr) throw insertErr;
      await load();
      setModalOpen(false);
      setName("");
    } catch (e) {
      setError(e?.message || "Failed to create workspace");
    } finally {
      setCreating(false);
    }
  }

  async function saveWorkspaceEdits() {
    setEditing(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!user?.id)
        throw new Error("You must be to signed in to edit a workspace.");
      if (!editingWs?.id) throw new Error("Workspace not found.");
      if (!editName.trim()) throw new Error("Workspace name is required.");

      const { error: updateErr } = await supabase
        .from("workspaces")
        .update({ name: editName.trim() })
        .eq("id", editingWs.id)
        .eq("owner_id", user.id);

      if (updateErr) throw updateErr;
      await load();
      setEditOpen(false);
      setEditingWs(null);
    } catch (e) {
      setError(e?.message || "Failed to update workspace");
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className="workspaces-page animate-fade-in">

      <div className="workspaces-header">
        <div>
          <div className="workspaces-title">Workspaces</div>
          <div className="workspaces-subtitle">
            {loading ? "Loading…" : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        {user && !loading && (
          <button className="workspaces-btn-new" onClick={openCreateModal}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Workspace
          </button>
        )}
      </div>

      {error && <div className="workspaces-error">{error}</div>}

      {loading ? (
        <div className="workspaces-loading">Loading workspaces…</div>
      ) : !user ? (
        <div className="workspaces-empty">
          <div className="workspaces-empty-title">Not signed in</div>
          <div className="workspaces-empty-desc">Sign in to view your workspaces.</div>
          <Link className="btn btn-secondary" to="/login">Go to login</Link>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="workspaces-empty">
          <div className="workspaces-empty-title">Create your first workspace</div>
          <div className="workspaces-empty-desc">You don’t have any workspaces yet. Create one to continue.</div>
          <button className="btn btn-primary" onClick={openCreateModal}>Create workspace</button>
        </div>
      ) : (
        <div className="workspaces-grid">
          {workspaces.map((ws) => {
            const isActive = String(ws.id) === String(activeId);
            return (
              <button
                key={ws.id}
                type="button"
                className={`workspace-card${isActive ? " active" : ""}`}
                onClick={() => { setActiveWorkspaceId(ws.id); setActiveId(ws.id); }}
              >
                <div className="workspace-card-icon">
                  {(ws.name || "W")[0].toUpperCase()}
                </div>
                <div className="workspace-card-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="workspace-card-name">{ws.name || "Untitled workspace"}</div>
                    <div className="workspace-card-id">ID: {String(ws.id).slice(0, 8)}…</div>
                  </div>
                  <div className="workspace-card-actions">
                    <button
                      type="button"
                      className="workspace-edit-btn"
                      onClick={(e) => { e.stopPropagation(); openEditModal(ws); }}
                    >
                      Edit
                    </button>
                    {isActive && (
                      <span className="workspace-active-badge">
                        <span className="workspace-active-dot" />
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => !creating && setModalOpen(false)} title="Create workspace">
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Workspace name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Creative Deer" autoFocus />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={creating}>Cancel</button>
          <button className="btn btn-primary" onClick={createWorkspace} disabled={creating}>
            {creating ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => !editing && setEditOpen(false)} title="Edit workspace">
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Workspace name</label>
          <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Workspace name" autoFocus />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={editing}>Cancel</button>
          <button className="btn btn-primary" onClick={saveWorkspaceEdits} disabled={editing}>
            {editing ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function Members() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [accepting, setAccepting] = useState(false);
  const [data, setData] = useState({ members: [], invites: [] });

  async function load(wsId = workspaceId) {
    if (!wsId) {
      setData({ members: [], invites: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await membersApi.list(wsId);
      setData({
        members: Array.isArray(res?.members) ? res.members : [],
        invites: Array.isArray(res?.invites) ? res.invites : [],
      });
    } catch (e) {
      setError(e?.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(workspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    const unsub = onActiveWorkspaceChange((id) => setWorkspaceId(id));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    const token = searchParams.get("token");
    if (!token || accepting) return;

    async function acceptInviteFromUrl() {
      setAccepting(true);
      setBusy("accept");
      setError("");
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const currentUser = userRes?.user || null;
        const acceptRes = await membersApi.accept({
          token,
          user_id: currentUser?.id || null,
        });
        if (!mounted) return;
        const acceptedWorkspaceId = acceptRes?.workspace_id || null;
        if (acceptedWorkspaceId) {
          setActiveWorkspaceId(acceptedWorkspaceId);
          setWorkspaceId(acceptedWorkspaceId);
        }
        toast("Invite accepted. You are now a member.", "success");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("token");
            return next;
          },
          { replace: true },
        );
        await load(acceptedWorkspaceId || workspaceId);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Could not accept invite");
      } finally {
        if (!mounted) return;
        setBusy("");
        setAccepting(false);
      }
    }

    acceptInviteFromUrl();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaceId]);

  async function sendInvite(e) {
    e.preventDefault();
    if (!workspaceId) return;
    setBusy("invite");
    setError("");
    try {
      await membersApi.invite({
        workspace_id: workspaceId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteRole("member");
      toast("Invite sent", "success");
      await load(workspaceId);
    } catch (err) {
      setError(err?.message || "Failed to send invite");
    } finally {
      setBusy("");
    }
  }

  async function changeRole(memberId, role) {
    setBusy(`role:${memberId}`);
    setError("");
    try {
      await membersApi.updateRole(memberId, role);
      toast("Role updated", "success");
      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to update role");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(memberId) {
    setBusy(`remove:${memberId}`);
    setError("");
    try {
      await membersApi.remove(memberId);
      toast("Member removed", "success");
      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to remove member");
    } finally {
      setBusy("");
    }
  }

  async function cancelInvite(inviteId) {
    setBusy(`cancel:${inviteId}`);
    setError("");
    try {
      await membersApi.cancelInvite(inviteId);
      toast("Invite cancelled", "success");
      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to cancel invite");
    } finally {
      setBusy("");
    }
  }

  async function resendInvite(inviteId) {
    setBusy(`resend:${inviteId}`);
    setError("");
    try {
      await membersApi.resendInvite(inviteId);
      toast("Invite resent", "success");
      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to resend invite");
    } finally {
      setBusy("");
    }
  }

  function avatarInitial(email) {
    return (email || "?")[0].toUpperCase();
  }

  const totalCount = data.members.length + data.invites.length;

  return (
    <div className="members-page animate-fade-in">

      {/* Header */}
      <div className="members-header">
        <div>
          <div className="members-title">Members</div>
          <div className="members-subtitle">
            {loading ? "Loading…" : `${totalCount} member${totalCount !== 1 ? "s" : ""} in this workspace`}
          </div>
        </div>
      </div>

      {accepting && (
        <div className="members-accepting">
          Accepting invite…
        </div>
      )}

      {error && (
        <div className="members-error">{error}</div>
      )}

      {!workspaceId ? (
        <div className="members-no-workspace">
          <div className="members-no-workspace-title">No active workspace</div>
          <div className="members-no-workspace-desc">
            Select a workspace before inviting or managing members.
          </div>
          <Link className="btn btn-secondary" to="/workspaces">
            Go to workspaces
          </Link>
        </div>
      ) : (
        <>
          {/* Invite card */}
          <div className="members-card">
            <div className="members-card-header">
              <div className="members-card-title">Invite a team member</div>
            </div>
            <form className="members-invite-form" onSubmit={sendInvite}>
              <input
                className="members-invite-input"
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <select
                className="members-invite-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                className="members-invite-btn"
                type="submit"
                disabled={busy === "invite"}
              >
                {busy === "invite" ? "Sending…" : "Send invite"}
              </button>
            </form>
          </div>

          {/* Team members card */}
          <div className="members-card">
            <div className="members-card-header">
              <div className="members-card-title">Team members</div>
              {!loading && data.members.length > 0 && (
                <span className="members-count-badge">{data.members.length}</span>
              )}
            </div>
            <div className="members-list">
              {loading ? (
                <div className="members-empty">Loading…</div>
              ) : data.members.length === 0 ? (
                <div className="members-empty">No confirmed members yet.</div>
              ) : (
                data.members.map((m) => {
                  const userEmail = m?.user?.email || "Unknown";
                  const roleLocked = m.role === "owner";
                  return (
                    <div key={m.id} className="members-row">
                      <div className="members-avatar">{avatarInitial(userEmail)}</div>
                      <div className="members-row-info">
                        <div className="members-row-email">{userEmail}</div>
                        {roleLocked && <div className="members-row-meta">Workspace owner</div>}
                      </div>
                      <select
                        className="members-role-select"
                        value={m.role}
                        disabled={roleLocked || busy === `role:${m.id}`}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <div className="members-row-actions">
                        <button
                          className="members-action-btn danger"
                          disabled={roleLocked || busy === `remove:${m.id}`}
                          onClick={() => removeMember(m.id)}
                        >
                          {busy === `remove:${m.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pending invites card */}
          {(loading || data.invites.length > 0) && (
            <div className="members-card">
              <div className="members-card-header">
                <div className="members-card-title">Pending invites</div>
                {!loading && data.invites.length > 0 && (
                  <span className="members-count-badge">{data.invites.length}</span>
                )}
              </div>
              <div className="members-list">
                {loading ? (
                  <div className="members-empty">Loading…</div>
                ) : (
                  data.invites.map((inv) => (
                    <div key={inv.id} className="members-row">
                      <div className="members-avatar">{avatarInitial(inv.email)}</div>
                      <div className="members-row-info">
                        <div className="members-row-email">{inv.email}</div>
                        <div className="members-row-meta">Invite pending</div>
                      </div>
                      <span className={`members-role-badge ${inv.role}`}>{inv.role}</span>
                      <div className="members-row-actions">
                        <button
                          className="members-action-btn"
                          disabled={busy === `resend:${inv.id}`}
                          onClick={() => resendInvite(inv.id)}
                        >
                          {busy === `resend:${inv.id}` ? "Resending…" : "Resend"}
                        </button>
                        <button
                          className="members-action-btn danger"
                          disabled={busy === `cancel:${inv.id}`}
                          onClick={() => cancelInvite(inv.id)}
                        >
                          {busy === `cancel:${inv.id}` ? "Cancelling…" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TRIAL_START_B = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const TRIAL_DAYS_B = 7;
const trialEndB = new Date(
  TRIAL_START_B.getTime() + TRIAL_DAYS_B * 24 * 60 * 60 * 1000,
);
const daysLeftB = Math.max(
  0,
  Math.ceil((trialEndB - Date.now()) / (1000 * 60 * 60 * 24)),
);

export function Billing() {
  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Billing</h1>
      </div>

      <div
        className="card"
        style={{
          maxWidth: 480,
          padding: 24,
          border: "2px solid var(--signal)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -11,
            left: 20,
            background: "var(--signal)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 10px",
            borderRadius: 20,
            textTransform: "uppercase",
          }}
        >
          Active Plan
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 2 }}>
              Free Trial
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Full access for 7 days — no credit card required.
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "var(--signal)",
                lineHeight: 1,
              }}
            >
              {daysLeftB}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
            >
              days left
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            <span>Trial started</span>
            <span>
              Ends{" "}
              {trialEndB.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(((TRIAL_DAYS_B - daysLeftB) / TRIAL_DAYS_B) * 100)}%`,
                background:
                  daysLeftB <= 2 ? "var(--danger, #e55)" : "var(--signal)",
                borderRadius: 6,
              }}
            />
          </div>
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 0 20px",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {[
            "1 LinkedIn account",
            "Unlimited connection requests during trial",
            "1 active campaign",
            "AI agents & message generation",
            "Full analytics access",
          ].map((f) => (
            <li
              key={f}
              style={{
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: "var(--signal)",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary btn-sm">Upgrade Plan</button>
          <button className="btn btn-ghost btn-sm">View all plans</button>
        </div>
      </div>
    </div>
  );
}
