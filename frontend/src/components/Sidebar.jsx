import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Modal from "./Modal";
import {
  getActiveWorkspaceId,
  onActiveWorkspaceChange,
  setActiveWorkspaceId,
} from "../lib/workspaceState";
import { getInboxUnreadCount, onInboxUnreadChange } from "../lib/inboxState";
import { useToast } from "./Toast";

const IconDashboard = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconInbox = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);
const IconLinkedIn = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);
const IconCampaigns = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 11l19-9-9 19-2-8-8-2z" />
  </svg>
);
const IconSearch = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconDatabase = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);
const IconAgent = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 8V4H8" />
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <path d="M2 20a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2" />
    <circle cx="12" cy="14" r="4" />
  </svg>
);
const IconAutomation = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
  </svg>
);
const IconSettings = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
  </svg>
);
const IconLink = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const IconSignOut = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const NAV = [
  { section: "WORKSPACE" },
  { to: "/", label: "Dashboard", exact: true, icon: <IconDashboard /> },
  { to: "/inbox", label: "Inbox", badge: "inbox", icon: <IconInbox /> },
  { section: "CAMPAIGNS" },
  {
    to: "/linkedin-accounts",
    label: "LinkedIn Accounts",
    icon: <IconLinkedIn />,
  },
  { to: "/campaigns", label: "Campaigns", icon: <IconCampaigns /> },
  { to: "/leads", label: "Lead Extractor", icon: <IconSearch /> },
  { to: "/my-leads", label: "Lead Database", icon: <IconDatabase /> },
  { section: "AUTOMATIONS" },
  { to: "/agents", label: "AI Agents", icon: <IconAgent /> },
  { to: "/workspaces", label: "Workspaces", icon: <IconAutomation /> },
  { section: "GENERAL" },
  { to: "/settings", label: "Settings", icon: <IconSettings /> },
  { to: "/members", label: "Members", icon: <IconLink /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workspaceState, setWorkspaceState] = useState({
    loading: true,
    signedIn: false,
    workspaces: [],
    activeId: getActiveWorkspaceId(),
  });
  const [user, setUser] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(getInboxUnreadCount());

  useEffect(() => {
    return onInboxUnreadChange(setInboxUnread);
  }, []);

  const initials = useMemo(() => {
    const active = workspaceState.workspaces.find(
      (w) => String(w.id) === String(workspaceState.activeId),
    );
    const name = active?.name?.trim();
    if (!name) return "—";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  }, [workspaceState.activeId, workspaceState.workspaces]);

  const activeWorkspace = useMemo(
    () =>
      workspaceState.workspaces.find(
        (w) => String(w.id) === String(workspaceState.activeId),
      ) || null,
    [workspaceState.activeId, workspaceState.workspaces],
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        if (!supabase) {
          if (!alive) return;
          setWorkspaceState({
            loading: false,
            signedIn: false,
            workspaces: [],
            activeId: getActiveWorkspaceId(),
          });
          return;
        }

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const u = userRes?.user || null;
        if (!u) {
          if (!alive) return;
          setWorkspaceState({
            loading: false,
            signedIn: false,
            workspaces: [],
            activeId: getActiveWorkspaceId(),
          });
          return;
        }
        if (alive) setUser(u);

        const { data, error: wsErr } = await supabase
          .from("workspaces")
          .select("*")
          .eq("owner_id", u.id)
          .order("created_at", { ascending: false });

        if (wsErr) throw wsErr;
        const owned = data || [];

        const { data: memberRows, error: memberErr } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", u.id);

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
        const stored = getActiveWorkspaceId();
        const activeId =
          stored && list.some((w) => String(w.id) === String(stored))
            ? stored
            : list[0]?.id || null;
        if (!stored && activeId) setActiveWorkspaceId(activeId);

        if (!alive) return;
        setWorkspaceState({
          loading: false,
          signedIn: true,
          workspaces: list,
          activeId,
        });
      } catch {
        if (!alive) return;
        setWorkspaceState({
          loading: false,
          signedIn: false,
          workspaces: [],
          activeId: getActiveWorkspaceId(),
        });
      }
    }

    load();
    const unsubscribe = onActiveWorkspaceChange((id) => {
      if (!alive) return;
      setWorkspaceState((s) => ({ ...s, activeId: id }));
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: "20px 16px 0" }}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="#ffffff" />
            </svg>
          </div>
          <span className="logo-text">ReachFlow</span>
        </div>
      </div>

      {/* Workspace */}
      <button
        type="button"
        className="sidebar-workspace"
        style={{
          textDecoration: "none",
          background: "transparent",
          border: "none",
          width: "100%",
        }}
        onClick={() => {
          if (!workspaceState.signedIn) return;
          setPickerOpen(true);
        }}
      >
        <div className="workspace-avatar">
          {workspaceState.loading ? "…" : initials}
        </div>
        <div className="workspace-info">
          <div className="workspace-name">
            {workspaceState.loading
              ? "Loading…"
              : activeWorkspace?.name
                ? activeWorkspace.name
                : workspaceState.signedIn
                  ? "No workspace yet"
                  : "Not signed in"}
          </div>
          <div className="workspace-account">
            {workspaceState.loading
              ? " "
              : activeWorkspace
                ? "Click to switch"
                : workspaceState.signedIn
                  ? "Create one to continue"
                  : "Click to sign in"}
          </div>
        </div>
        <span className="workspace-chevron">⌄</span>
      </button>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.section) {
            return (
              <div key={i} className="nav-section-label">
                {item.section}
              </div>
            );
          }
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              className={`nav-item${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge &&
                (() => {
                  const count =
                    item.badge === "inbox" ? inboxUnread : item.badge;
                  return count > 0 ? (
                    <span className="nav-badge">{count}</span>
                  ) : null;
                })()}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom — user profile + sign out */}
      <div className="sidebar-bottom">
        {workspaceState.signedIn && (
          <div className="sidebar-user">
            <button
              type="button"
              className="sidebar-user-identity"
              onClick={() => navigate("/settings?tab=profile")}
              title="My profile"
            >
              <div className="sidebar-user-avatar">
                {user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">
                  {activeWorkspace?.name || user?.email?.split("@")[0] || "User"}
                </div>
                <div className="sidebar-user-email">{user?.email || ""}</div>
              </div>
            </button>
            <button
              className="sidebar-signout-btn"
              title="Sign out"
              onClick={async () => {
                try {
                  setWorkspaceState((s) => ({
                    ...s,
                    loading: true,
                    signedIn: false,
                    workspaces: [],
                    activeId: null,
                  }));
                  await supabase?.auth?.signOut?.();
                  setActiveWorkspaceId(null);
                  setPickerOpen(false);
                  navigate("/login");
                } catch (e) {
                  console.error(e);
                  toast("Could not sign out. Please try again.", "danger");
                }
              }}
            >
              <IconSignOut />
            </button>
          </div>
        )}
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select workspace"
        width={520}
      >
        {!workspaceState.signedIn ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Sign in to manage workspaces.
            </div>
            <Link
              className="btn btn-secondary"
              to="/login"
              onClick={() => setPickerOpen(false)}
            >
              Go to login
            </Link>
          </div>
        ) : workspaceState.workspaces.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              No workspaces yet.
            </div>
            <Link
              className="btn btn-primary"
              to="/workspaces"
              onClick={() => setPickerOpen(false)}
            >
              Create workspace
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workspaceState.workspaces.map((ws) => {
              const isActive =
                String(ws.id) === String(workspaceState.activeId);
              return (
                <button
                  key={ws.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    justifyContent: "space-between",
                    background: isActive
                      ? "var(--signal-subtle)"
                      : "var(--surface-2)",
                    borderColor: isActive
                      ? "rgba(99,102,241,0.25)"
                      : "var(--border)",
                  }}
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setWorkspaceState((s) => ({ ...s, activeId: ws.id }));
                    setPickerOpen(false);
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: "var(--text-primary)",
                    }}
                  >
                    {ws.name || "Untitled workspace"}
                  </span>
                  <span
                    className={`badge ${isActive ? "badge-signal" : "badge-muted"}`}
                  >
                    {isActive ? "Active" : "Select"}
                  </span>
                </button>
              );
            })}

            <div className="modal-footer" style={{ marginTop: 8 }}>
              <Link
                className="btn btn-ghost"
                to="/workspaces"
                onClick={() => setPickerOpen(false)}
              >
                Manage workspaces
              </Link>
              <Link
                className="btn btn-primary"
                to="/workspaces"
                onClick={() => setPickerOpen(false)}
              >
                + New workspace
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </aside>
  );
}
