import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LeadFinderModal from "../components/LeadFinderModal";
import ProfileUrlModal from "../components/ProfileUrlModal";
import PostEngagersModal from "../components/PostEngagersModal";
import LinkedInProfileModal from "../components/LinkedInProfileModal";
import Modal from "../components/Modal";
import {
  campaigns as campaignsApi,
  agents as agentsApi,
  leads as leadsApi,
  unipile,
} from "../lib/api";
import { useToast } from "../components/Toast";
import "./CampaignDetail.css";

// ── Step type definitions ─────────────────────────────────────
const STEP_TYPES = [
  // Actions
  { type: "visit_profile",    icon: "◎",  label: "Visit profile",                   hasConfig: false },
  { type: "like_post",        icon: "♡",  label: "Like last post",                   hasConfig: false },
  { type: "follow",           icon: "◆",  label: "Follow Lead",                      hasConfig: false },
  { type: "wait",             icon: "⏰", label: "Wait x days",                      hasConfig: true  },
  { type: "connection_request",icon: "◈", label: "Send connection request",          hasConfig: true  },
  { type: "message",          icon: "✉",  label: "Send message",                     hasConfig: true  },
  { type: "voice_note",       icon: "🎙", label: "Send voice note",                  hasConfig: true  },
  { type: "comment_post",     icon: "💬", label: "Comment last post",                hasConfig: true  },
  { type: "inmail",           icon: "📨", label: "LinkedIn InMail",                  hasConfig: true  },
  { type: "add_tag",          icon: "🏷", label: "Add tag",                          hasConfig: true  },
  { type: "reply_comment",    icon: "↩",  label: "Reply Comment",                    hasConfig: true  },
  { type: "message_open",     icon: "📬", label: "Send message to open profile",     hasConfig: true  },
  // Conditions
  { type: "cond_has_linkedin",    icon: "🔗", label: "Has LinkedIn URL",           hasConfig: false, isCondition: true },
  { type: "cond_1st_level",       icon: "①",  label: "Lead is 1st level",          hasConfig: false, isCondition: true },
  { type: "cond_opened_message",  icon: "✓",  label: "Opened LinkedIn Message",    hasConfig: false, isCondition: true },
  { type: "cond_check_column",    icon: "☰",  label: "Check data in column",       hasConfig: true,  isCondition: true },
  { type: "cond_open_profile",    icon: "◉",  label: "Lead is Open Profile",       hasConfig: false, isCondition: true },
];

const ACTION_STEPS = [
  { type: "connection_request", icon: "➕", label: "Send connection request" },
  { type: "message", icon: "✉", label: "Send message" },
  { type: "voice_note", icon: "🎙", label: "Send voice note" },
  { type: "comment_post", icon: "💬", label: "Comment last post" },
  { type: "like_post", icon: "♡", label: "Like last post" },
  { type: "visit_profile", icon: "◎", label: "Visit profile" },
  { type: "inmail", icon: "📨", label: "LinkedIn InMail" },
  { type: "add_tag", icon: "🏷", label: "Add tag" },
  { type: "reply_comment", icon: "↩", label: "Reply Comment" },
  { type: "message_open", icon: "📬", label: "Send message to open profile" },
  { type: "follow", icon: "＋", label: "Follow Lead" },
  { type: "wait", icon: "⏰", label: "Wait x days" },
];

const CONDITION_STEPS = [
  { type: "cond_has_linkedin", icon: "🔗", label: "Has LinkedIn URL" },
  { type: "cond_1st_level", icon: "①", label: "Lead is 1st level" },
  { type: "cond_opened_message", icon: "✓", label: "Opened LinkedIn Message" },
  { type: "cond_check_column", icon: "☰", label: "Check data in column" },
  { type: "cond_open_profile", icon: "◉", label: "Lead is Open Profile" },
];

function stepMeta(type) {
  return (
    STEP_TYPES.find((s) => s.type === type) || {
      icon: "◎",
      label: type,
      hasConfig: false,
    }
  );
}

function nodeLabel(node) {
  if (node.type === "wait")
    return `Wait ${node.config?.days || 1} day${(node.config?.days || 1) !== 1 ? "s" : ""}`;
  return stepMeta(node.type).label;
}

function nodeConfigured(node) {
  const meta = stepMeta(node.type);
  if (!meta.hasConfig) return true;
  if (node.type === "wait") return (node.config?.days || 0) > 0;
  if (node.type === "connection_request") return true;
  if (["message", "message_open", "voice_note", "comment_post", "reply_comment"].includes(node.type))
    return !!node.config?.text?.trim();
  if (node.type === "inmail")
    return !!node.config?.subject?.trim() && !!node.config?.body?.trim();
  if (node.type === "add_tag") return !!node.config?.tag?.trim();
  if (node.type === "cond_check_column") return !!node.config?.field?.trim();
  return true;
}

const IMPORT_SOURCES = [
  {
    id: "finder",
    icon: "◈",
    label: "Lead Finder",
    desc: "Search Apollo's 300M+ contact database",
  },
  {
    id: "csv",
    icon: "⬆",
    label: "Import from CSV",
    desc: "Upload a CSV of LinkedIn profile URLs",
  },
  {
    id: "url",
    icon: "🔗",
    label: "LinkedIn Search URL",
    desc: "Paste a LinkedIn search results URL",
  },
  {
    id: "profile",
    icon: "👤",
    label: "LinkedIn Profile URL",
    desc: "Paste a single LinkedIn profile URL to import one person",
  },
  {
    id: "event",
    icon: "◆",
    label: "LinkedIn Event",
    desc: "Import attendees from a LinkedIn event",
  },
  {
    id: "post",
    icon: "◇",
    label: "LinkedIn Post",
    desc: "Import people who liked or commented",
  },
  {
    id: "group",
    icon: "◉",
    label: "LinkedIn Group",
    desc: "Import members from a LinkedIn group",
  },
  {
    id: "list",
    icon: "☰",
    label: "Add from my list",
    desc: "Choose from your saved lead lists",
  },
];

const STATUS_COLORS = {
  pending: "badge-muted",
  invited: "badge-warning",
  connected: "badge-signal",
  replied: "badge-info",
  booked: "badge-signal",
  rejected: "badge-danger",
};

const PERSONA_FIELDS = [
  {
    key: "roleAndObjective",
    label: "Role & Objective",
    rows: 3,
    placeholder:
      "Describe what this AI assistant's role is and what it's trying to achieve…",
  },
  {
    key: "toneAndStyle",
    label: "Tone & Style",
    rows: 3,
    placeholder: "How should it communicate — tone, word limits, style rules…",
  },
  {
    key: "movingToCall",
    label: "Moving to Call",
    rows: 3,
    placeholder: "When and how to transition to suggesting a meeting…",
  },
  {
    key: "objectionHandling",
    label: "Objection Handling",
    rows: 4,
    placeholder:
      "How to handle: not right person, too small, are you automated, need partner approval…",
  },
  {
    key: "finalRules",
    label: "Final Rules",
    rows: 3,
    placeholder:
      "Word limits, dos and donts, must-follow rules for every message…",
  },
];

// ── Main component ───────────────────────────────────────────
export default function CampaignDetail() {
  const { id } = useParams();
  const { toast } = useToast();

  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [agents, setAgents] = useState([]);
  const [linkedinAccounts, setLinkedinAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("leads");
  const [showImport, setShowImport] = useState(false);
  const [lfOpen, setLfOpen] = useState(false);
  const [profileUrlOpen, setProfileUrlOpen] = useState(false);
  const [linkedInProfileOpen, setLinkedInProfileOpen] = useState(false);
  const [postEngagersOpen, setPostEngagersOpen] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingMessageFor, setSendingMessageFor] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function handleSendInvites() {
    setSendingInvites(true);
    try {
      const result = await campaignsApi.sendInvites(id);
      if (result.message === "No pending leads") {
        toast?.("No pending leads to send invites to", "danger");
      } else if (result.sent === 0 && result.total > 0) {
        const firstError =
          result.results?.find((r) => !r.ok)?.error || "Unknown error";
        toast?.(`All invites failed: ${firstError}`, "danger");
        console.error("[send-invites] failures:", result.results);
      } else {
        toast?.(
          `Sent ${result.sent} of ${result.total} connection request${result.total !== 1 ? "s" : ""}`,
          "success",
        );
        refreshLeads();
      }
    } catch (err) {
      toast?.(err.message || "Failed to send invites", "danger");
    } finally {
      setSendingInvites(false);
    }
  }

  async function syncStatuses(silent = false) {
    if (!silent) setSyncing(true);
    try {
      const result = await campaignsApi.syncStatuses(id);
      if (result.connected > 0) {
        toast?.(
          `${result.connected} new connection${result.connected !== 1 ? "s" : ""} detected — messages sent`,
          "success",
        );
        refreshLeads();
      } else if (!silent) {
        toast?.("No new connections found", "success");
      }
    } catch (err) {
      if (!silent) toast?.(err.message || "Sync failed", "danger");
    } finally {
      if (!silent) setSyncing(false);
    }
  }

  // Auto-poll every 30s when on leads tab — sync connections + messages
  useEffect(() => {
    if (tab !== "leads") return;
    const hasInvited = leads.some((l) => l.status === "invited");
    const hasActive = leads.some((l) =>
      ["connected", "replied"].includes(l.status),
    );
    if (!hasInvited && !hasActive) return;

    const interval = setInterval(async () => {
      if (hasInvited) syncStatuses(true);
      if (hasActive) {
        try {
          const result = await campaignsApi.syncMessages(id);
          if (result.processed > 0) refreshLeads();
        } catch {
          /* silent */
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, leads, id]);

  async function handleDeleteLead(leadId) {
    try {
      await campaignsApi.deleteLead(id, leadId);
      refreshLeads();
    } catch (err) {
      toast?.(err.message || "Failed to delete lead", "danger");
    }
  }

  async function handleSendLeadMessage(leadId) {
    setSendingMessageFor(leadId);
    try {
      await campaignsApi.sendLeadMessage(id, leadId);
      toast?.("AI opening message sent", "success");
      refreshLeads();
    } catch (err) {
      toast?.(err.message || "Failed to send message", "danger");
    } finally {
      setSendingMessageFor(null);
    }
  }

  async function refreshLeads() {
    try {
      const data = await campaignsApi.getLeads(id);
      setLeads(Array.isArray(data) ? data : []);
    } catch {}
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [camp, campLeads, agentList, accs] = await Promise.allSettled([
          campaignsApi.get(id),
          campaignsApi.getLeads(id),
          agentsApi.list(),
          unipile.getAccounts(),
        ]);
        if (camp.status === "fulfilled") setCampaign(camp.value);
        const loadedLeads =
          campLeads.status === "fulfilled"
            ? Array.isArray(campLeads.value)
              ? campLeads.value
              : []
            : [];
        setLeads(loadedLeads);
        if (agentList.status === "fulfilled")
          setAgents(Array.isArray(agentList.value) ? agentList.value : []);
        if (accs.status === "fulfilled")
          setLinkedinAccounts(accs.value?.items || []);

        // Auto-sync on load if any leads are in 'invited' state
        const hasInvited = loadedLeads.some((l) => l.status === "invited");
        if (hasInvited) syncStatuses(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleToggleStatus() {
    if (!campaign) return;
    const next = campaign.status === "active" ? "paused" : "active";
    try {
      const updated = await campaignsApi.update(id, { status: next });
      setCampaign(updated);
      toast?.(
        `Campaign ${next === "active" ? "resumed" : "paused"}`,
        "success",
      );
    } catch (err) {
      toast?.(err.message || "Could not update status", "danger");
    }
  }

  if (loading) {
    return (
      <div className="campaign-detail animate-fade-in">
        <div style={{ padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
          Loading campaign…
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="campaign-detail animate-fade-in">
        <div style={{ padding: 32 }}>
          <Link
            to="/campaigns"
            style={{ color: "var(--text-muted)", fontSize: 13 }}
          >
            ← Campaigns
          </Link>
          <div style={{ marginTop: 24, color: "var(--text-muted)" }}>
            Campaign not found.
          </div>
        </div>
      </div>
    );
  }

  const selectedAgent =
    agents.find((a) => a.id === campaign.settings?.agentId) || null;

  return (
    <div className="campaign-detail animate-fade-in">
      {/* Top bar */}
      <div className="detail-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            to="/campaigns"
            style={{ color: "var(--text-muted)", fontSize: 13 }}
          >
            ← Campaigns
          </Link>
          <span style={{ color: "var(--border-2)" }}>/</span>
          <h1 style={{ fontSize: 16, fontWeight: 700 }}>{campaign.name}</h1>
          <span
            className={`badge ${campaign.status === "active" ? "badge-signal" : "badge-muted"}`}
          >
            {campaign.status === "active" ? "active" : "paused"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedAgent && (
            <span className="chip">◆ {selectedAgent.name}</span>
          )}
          {campaign.settings?.linkedinAccountName && (
            <span className="chip">
              ◎ {campaign.settings.linkedinAccountName}
            </span>
          )}
          <button
            className={`btn ${campaign.status === "active" ? "btn-secondary" : "btn-primary"} btn-sm`}
            onClick={handleToggleStatus}
          >
            {campaign.status === "active" ? "⏸ Pause" : "▶ Run"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        {["leads", "builder", "persona", "analytics", "settings"].map((t) => (
          <button
            key={t}
            className={`detail-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <LeadFinderModal
        open={lfOpen}
        onClose={() => setLfOpen(false)}
        onImport={refreshLeads}
        campaignId={id}
      />

      <ProfileUrlModal
        open={profileUrlOpen}
        onClose={() => setProfileUrlOpen(false)}
        onImport={refreshLeads}
        campaignId={id}
      />

      <PostEngagersModal
        open={postEngagersOpen}
        onClose={() => setPostEngagersOpen(false)}
        onImport={refreshLeads}
        campaignId={id}
      />

      <LinkedInProfileModal
        open={linkedInProfileOpen}
        onClose={() => setLinkedInProfileOpen(false)}
        onImport={refreshLeads}
        campaignId={id}
      />

      {/* Tab content */}
      <div className="detail-content">
        {tab === "leads" && (
          <LeadsTab
            campaignId={id}
            leads={leads}
            onImport={() => setShowImport(true)}
            showImport={showImport}
            onCloseImport={() => setShowImport(false)}
            onOpenLeadFinder={(which = "finder") => {
              setShowImport(false);
              if (which === "url") setProfileUrlOpen(true);
              else if (which === "post") setPostEngagersOpen(true);
              else if (which === "profile") setLinkedInProfileOpen(true);
              else setLfOpen(true);
            }}
            onSendInvites={handleSendInvites}
            sendingInvites={sendingInvites}
            onSendMessage={handleSendLeadMessage}
            sendingMessageFor={sendingMessageFor}
            onDeleteLead={handleDeleteLead}
            onSync={() => syncStatuses(false)}
            syncing={syncing}
            onRefreshLeads={refreshLeads}
          />
        )}
        {tab === "builder" && (
          <BuilderTab
            campaignId={id}
            initialNodes={campaign.sequence?.nodes || []}
            linkedinAccounts={linkedinAccounts}
            onSaved={(updated) =>
              setCampaign((prev) => ({ ...prev, sequence: updated }))
            }
            toast={toast}
            campaignStatus={campaign.status}
            onToggleStatus={handleToggleStatus}
          />
        )}
        {tab === "persona" && (
          <PersonaTab
            campaignId={id}
            campaign={campaign}
            agents={agents}
            onSaved={setCampaign}
            toast={toast}
          />
        )}
        {tab === "analytics" && <AnalyticsTab campaignId={id} />}
        {tab === "settings" && (
          <SettingsTab
            campaign={campaign}
            agents={agents}
            linkedinAccounts={linkedinAccounts}
            onSaved={setCampaign}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}

// ── My Leads Picker Modal ────────────────────────────────────
function MyLeadsPickerModal({ open, onClose, campaignId, onImported }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      return;
    }
    setLoading(true);
    leadsApi
      .list()
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [open]);

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleImport() {
    const toAdd = list.filter((l) => selected.includes(l.id));
    if (!toAdd.length) return;
    setImporting(true);
    try {
      await campaignsApi.importLeads(campaignId, {
        leads: toAdd,
        source: "list",
      });
      onImported();
      onClose();
    } catch {}
    setImporting(false);
  }

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box animate-fade-in"
        style={{
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Add from My Leads</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                padding: "24px 0",
              }}
            >
              Loading saved leads…
            </div>
          ) : list.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                padding: "24px 0",
              }}
            >
              No saved leads yet. Use Lead Finder → Save to List first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {list.length} saved leads
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setSelected(
                      selected.length === list.length
                        ? []
                        : list.map((l) => l.id),
                    )
                  }
                >
                  {selected.length === list.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>
              {list.map((lead) => (
                <div
                  key={lead.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: "var(--surface)",
                    cursor: "pointer",
                    border: `1px solid ${selected.includes(lead.id) ? "var(--signal)" : "var(--border)"}`,
                    borderRadius: "var(--radius)",
                  }}
                  onClick={() => toggle(lead.id)}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(lead.id)}
                    onChange={() => toggle(lead.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {lead.name || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {lead.title}
                      {lead.company ? ` · ${lead.company}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={selected.length === 0 || importing}
            onClick={handleImport}
          >
            {importing
              ? "Adding…"
              : `Add ${selected.length > 0 ? selected.length : ""} to Campaign`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ─────────────────────────────────────────
function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return [];

  function splitRow(row) {
    const cells = [];
    let cur = "",
      inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitRow(lines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );

  // Map common CSV column names to lead fields
  function pickCol(candidates) {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h === c || h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const nameIdx = pickCol([
    "name",
    "full_name",
    "fullname",
    "contact_name",
    "first_name",
  ]);
  const firstIdx = pickCol(["first_name", "firstname", "first"]);
  const lastIdx = pickCol(["last_name", "lastname", "last", "surname"]);
  const titleIdx = pickCol([
    "title",
    "job_title",
    "jobtitle",
    "position",
    "role",
    "headline",
  ]);
  const companyIdx = pickCol([
    "company",
    "company_name",
    "organization",
    "employer",
  ]);
  const locationIdx = pickCol(["location", "city", "country", "region", "geo"]);
  const linkedinIdx = pickCol([
    "linkedin",
    "linkedin_url",
    "linkedinurl",
    "profile_url",
    "linkedin_profile",
  ]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.every((c) => !c)) continue;

    const get = (idx) =>
      idx !== -1 && cells[idx] ? cells[idx].replace(/^"|"$/g, "").trim() : "";

    let name = get(nameIdx);
    if (!name && (firstIdx !== -1 || lastIdx !== -1)) {
      name = [get(firstIdx), get(lastIdx)].filter(Boolean).join(" ").trim();
    }
    if (!name) name = `Row ${i}`;

    rows.push({
      id: `csv_${i}`,
      name,
      title: get(titleIdx),
      company: get(companyIdx),
      location: get(locationIdx),
      linkedinUrl: get(linkedinIdx),
      status: "Not contacted",
    });
  }
  return rows;
}

function CsvImportModal({ open, onClose, campaignId, onImported }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = React.useRef();

  function reset() {
    setRows([]);
    setError("");
    setFileName("");
  }
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCsv(e.target.result);
        if (!parsed.length) {
          setError("No valid rows found. Make sure the CSV has a header row.");
          setRows([]);
        } else {
          setRows(parsed);
          setError("");
        }
      } catch {
        setError("Could not parse CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    try {
      await campaignsApi.importLeads(campaignId, {
        leads: rows,
        source: "csv",
      });
      onImported();
      onClose();
    } catch (e) {
      setError(e.message || "Import failed");
    }
    setImporting(false);
  }

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box animate-fade-in"
        style={{
          maxWidth: 620,
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">⬆ Import from CSV</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            Upload a CSV with columns like <strong>name</strong>,{" "}
            <strong>linkedin_url</strong>, <strong>title</strong>,{" "}
            <strong>company</strong>, <strong>location</strong>.
          </p>

          <div
            style={{
              border: "2px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "28px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--surface)",
              marginBottom: 16,
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {fileName ? (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  📄 {fileName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {rows.length} rows detected
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⬆</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  Click to choose a CSV file
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  or drag and drop here
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                fontSize: 13,
                color: "var(--danger, #e55)",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Preview ({Math.min(rows.length, 5)} of {rows.length})
              </div>
              <div
                className="table-wrap"
                style={{ maxHeight: 220, overflowY: "auto" }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Company</th>
                      <th>LinkedIn URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          {r.name || "—"}
                        </td>
                        <td
                          style={{
                            fontSize: 13,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {r.title || "—"}
                        </td>
                        <td style={{ fontSize: 13 }}>{r.company || "—"}</td>
                        <td
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.linkedinUrl || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  + {rows.length - 5} more rows
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={rows.length === 0 || importing}
            onClick={handleImport}
          >
            {importing
              ? "Importing…"
              : `Import ${rows.length > 0 ? rows.length : ""} Contacts →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────
function LeadsTab({
  campaignId,
  leads,
  onImport,
  showImport,
  onCloseImport,
  onOpenLeadFinder,
  onSendInvites,
  sendingInvites,
  onSendMessage,
  sendingMessageFor,
  onDeleteLead,
  onSync,
  syncing,
  onRefreshLeads,
}) {
  const pendingCount = leads.filter((l) => l.status === "pending").length;
  const invitedCount = leads.filter((l) => l.status === "invited").length;
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [myLeadsOpen, setMyLeadsOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {leads.length} leads in campaign
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {invitedCount > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onSync}
              disabled={syncing}
              title="Check Unipile for accepted connections"
            >
              {syncing ? "↻ Syncing…" : `↻ Sync (${invitedCount} invited)`}
            </button>
          )}
          {pendingCount > 0 && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onSendInvites}
              disabled={sendingInvites}
            >
              {sendingInvites ? "Sending…" : `▶ Send Invites (${pendingCount})`}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onImport}>
            + Import Contacts
          </button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 10 }}>◎</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No leads yet</div>
          <div style={{ fontSize: 13 }}>
            Import contacts to start your outreach.
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id || l.name}>
                  <td style={{ fontWeight: 600 }}>
                    {l.name || l.firstName + " " + l.lastName || "—"}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {l.title || l.jobTitle || "—"}
                  </td>
                  <td>{l.company || "—"}</td>
                  <td>
                    <span
                      className={`badge ${STATUS_COLORS[l.status] || "badge-muted"}`}
                    >
                      {l.status || "pending"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {l.addedAt
                      ? new Date(l.addedAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td>
                    {l.status === "invited" && (
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                        title="Auto-detects acceptance every 30s"
                      >
                        ↻ Checking…
                      </span>
                    )}
                    {l.status === "connected" && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={sendingMessageFor === l.id}
                        onClick={() => onSendMessage(l.id)}
                        title="Generate and send AI opening message"
                      >
                        {sendingMessageFor === l.id ? "…" : "◆ Send AI Message"}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)", marginLeft: 4 }}
                      onClick={() => setConfirmDelete(l)}
                      title="Remove lead from campaign"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove Lead"
        width={400}
      >
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginBottom: 20,
          }}
        >
          Remove <strong>{confirmDelete?.name || "this lead"}</strong> from the
          campaign? This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDelete(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: "var(--danger)",
              color: "#fff",
              borderColor: "var(--danger)",
            }}
            onClick={() => {
              onDeleteLead(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            Remove Lead
          </button>
        </div>
      </Modal>

      <MyLeadsPickerModal
        open={myLeadsOpen}
        onClose={() => setMyLeadsOpen(false)}
        campaignId={campaignId}
        onImported={onRefreshLeads}
      />

      <CsvImportModal
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        campaignId={campaignId}
        onImported={onRefreshLeads}
      />

      {showImport && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && onCloseImport()}
        >
          <div className="modal-box animate-fade-in" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2 className="modal-title">Import Contacts</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={onCloseImport}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                Choose a source to import leads into this campaign.
              </p>
              <div className="import-sources-grid">
                {IMPORT_SOURCES.map((s) => (
                  <div
                    key={s.id}
                    className="import-source-card"
                    onClick={() => {
                      if (s.id === "finder") {
                        onOpenLeadFinder("finder");
                      } else if (s.id === "url") {
                        onOpenLeadFinder("url");
                      } else if (s.id === "post") {
                        onOpenLeadFinder("post");
                      } else if (s.id === "profile") {
                        onOpenLeadFinder("profile");
                      } else if (s.id === "list") {
                        onCloseImport();
                        setMyLeadsOpen(true);
                      } else if (s.id === "csv") {
                        onCloseImport();
                        setCsvImportOpen(true);
                      } else {
                        alert(`${s.label} — coming soon`);
                      }
                    }}
                  >
                    <div className="import-source-icon">{s.icon}</div>
                    <div className="import-source-label">{s.label}</div>
                    <div className="import-source-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Builder Tab ───────────────────────────────────────────────
function BuilderTab({
  campaignId,
  initialNodes,
  linkedinAccounts,
  onSaved,
  toast,
  campaignStatus,
  onToggleStatus,
}) {
  const [nodes, setNodes] = useState(() =>
    (initialNodes || []).map((n, i) => ({ ...n, _id: n.id || `n_${i}` })),
  );
  const [selectedId, setSelectedId] = useState(null);
  const [addingAt, setAddingAt] = useState(null); // index to insert after (-1 = beginning)
  const [pickerTab, setPickerTab] = useState("action");
  const [saving, setSaving] = useState(false);

  const selectedNode = nodes.find((n) => n._id === selectedId) || null;

  async function saveSequence(updatedNodes) {
    setSaving(true);
    try {
      const payload = { nodes: updatedNodes.map(({ _id, ...rest }) => rest) };
      const result = await campaignsApi.updateSequence(campaignId, payload);
      onSaved(result);
      toast?.("Sequence saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save sequence", "danger");
    } finally {
      setSaving(false);
    }
  }

  function addNode(type, insertAfterIndex) {
    const newNode = {
      _id: `n_${Date.now()}`,
      type,
      config: type === "wait" ? { days: 1 } : {},
    };
    setNodes((prev) => {
      const next = [...prev];
      next.splice(insertAfterIndex + 1, 0, newNode);
      return next;
    });
    setAddingAt(null);
    setSelectedId(newNode._id);
  }

  function updateNode(id, config) {
    setNodes((prev) =>
      prev.map((n) =>
        n._id === id ? { ...n, config: { ...n.config, ...config } } : n,
      ),
    );
  }

  function deleteNode(id) {
    setNodes((prev) => prev.filter((n) => n._id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveNode(id, dir) {
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n._id === id);
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <div className="builder-wrap">
      {/* Canvas */}
      <div className="builder-canvas" onClick={() => setSelectedId(null)}>
        {/* Start node */}
        <div
          className={`builder-entry-node ${campaignStatus === "active" ? "builder-entry-node--active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggleStatus?.(); }}
          title={campaignStatus === "active" ? "Pause campaign" : "Start campaign"}
          style={{ cursor: "pointer" }}
        >
          {campaignStatus === "active" ? (
            <><span>⏸</span> Running</>
          ) : (
            <><span>▶</span> Start</>
          )}
        </div>

        {/* Add first node */}
        <div className="builder-connector-wrap">
          <div className="builder-connector" />
          <button
            className="add-node-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAddingAt(-1);
            }}
            title="Add first step"
          >
            +
          </button>
          {nodes.length > 0 && <div className="builder-connector" />}
        </div>

        {nodes.map((node, i) => {
          const meta = stepMeta(node.type);
          const ok = nodeConfigured(node);
          const sub = node.type === "wait"
            ? `${node.config?.days || 1} day${(node.config?.days || 1) !== 1 ? "s" : ""}`
            : node.config?.text
              ? node.config.text.slice(0, 42) + (node.config.text.length > 42 ? "…" : "")
              : node.config?.note
                ? node.config.note.slice(0, 42) + (node.config.note.length > 42 ? "…" : "")
                : null;
          return (
            <div key={node._id}>
              <div
                className={`builder-node${meta.isCondition ? " condition" : ""}${!ok ? " missing" : ""}${selectedId === node._id ? " selected" : ""}`}
                onClick={(e) => { e.stopPropagation(); setSelectedId(node._id); }}
              >
                <div className="node-icon">{meta.icon}</div>
                <div className="node-content">
                  <div className="node-label">{meta.label}</div>
                  {!ok
                    ? <div className="node-error">Configure required</div>
                    : sub && <div className="node-sub">{sub}</div>
                  }
                </div>
                <div className="node-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 10, opacity: i === 0 ? 0.3 : 1 }}
                    disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); moveNode(node._id, -1); }}
                    title="Move up"
                  >▲</button>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 10, opacity: i === nodes.length - 1 ? 0.3 : 1 }}
                    disabled={i === nodes.length - 1}
                    onClick={(e) => { e.stopPropagation(); moveNode(node._id, 1); }}
                    title="Move down"
                  >▼</button>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    onClick={(e) => { e.stopPropagation(); deleteNode(node._id); }}
                    title="Remove"
                  >✕</button>
                </div>
              </div>

              {/* Connector + add button between nodes */}
              <div className="builder-connector-wrap">
                <div className="builder-connector" />
                <button
                  className="add-node-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingAt(i);
                  }}
                  title="Add step here"
                >
                  +
                </button>
                {i < nodes.length - 1 && <div className="builder-connector" />}
              </div>
            </div>
          );
        })}

        {/* Save button */}
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 20, fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); saveSequence(nodes); }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Sequence"}
        </button>
      </div>

      {/* Right: step config panel */}
      {selectedNode && (
        <div
          className="node-config-panel animate-slide-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="node-config-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {["message", "message_open", "inmail"].includes(selectedNode.type) ? (
                <div className="msg-step-icon">
                  <span style={{ fontSize: 11 }}>in</span>
                </div>
              ) : (
                <span style={{ fontSize: 16 }}>
                  {stepMeta(selectedNode.type).icon}
                </span>
              )}
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>
                {stepMeta(selectedNode.type).label}
              </h3>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["message", "message_open", "inmail"].includes(selectedNode.type) && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 12, color: "var(--signal)", border: "1px solid var(--signal)", padding: "3px 10px" }}
                  onClick={() => {
                    deleteNode(selectedNode._id);
                    setAddingAt(nodes.indexOf(selectedNode) - 1);
                  }}
                >
                  Change
                </button>
              )}
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setSelectedId(null)}
              >
                ✕
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              flex: 1,
            }}
          >
            {selectedNode.type === "wait" && (
              <div className="input-group">
                <label className="input-label">Wait Duration</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={30}
                    value={selectedNode.config?.days || 1}
                    onChange={(e) =>
                      updateNode(selectedNode._id, {
                        days: Math.max(1, Number(e.target.value)),
                      })
                    }
                    style={{ width: 80 }}
                  />
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    days
                  </span>
                </div>
              </div>
            )}

            {selectedNode.type === "connection_request" && (
              <>
                {linkedinAccounts.length > 0 && (
                  <div className="input-group">
                    <label className="input-label">Send From</label>
                    <select
                      className="input"
                      value={selectedNode.config?.accountId || ""}
                      onChange={(e) => {
                        const acc = linkedinAccounts.find(
                          (a) => a.id === e.target.value,
                        );
                        updateNode(selectedNode._id, {
                          accountId: e.target.value,
                          accountName: acc?.name || "",
                        });
                      }}
                    >
                      <option value="">Select account…</option>
                      {linkedinAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="input-group">
                  <label className="input-label">
                    Connection Note{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      (optional)
                    </span>
                  </label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Hi {firstName}, I came across your profile and thought it would be great to connect…"
                    value={selectedNode.config?.note || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { note: e.target.value })
                    }
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Variables: {"{firstName}"} {"{lastName}"} {"{fullName}"} {"{company}"} {"{jobTitle}"} {"{location}"}
                  </div>
                </div>
              </>
            )}

            {selectedNode.type === "message" && (
              <MessageStepEditor
                node={selectedNode}
                linkedinAccounts={linkedinAccounts}
                updateNode={updateNode}
                toast={toast}
              />
            )}

            {/* voice_note / comment_post / reply_comment — simple text */}
            {["voice_note", "comment_post", "reply_comment"].includes(selectedNode.type) && (
              <div className="input-group">
                <label className="input-label">
                  {selectedNode.type === "voice_note" && "Voice Note Script"}
                  {selectedNode.type === "comment_post" && "Comment Text"}
                  {selectedNode.type === "reply_comment" && "Reply Text"}
                </label>
                <textarea
                  className="input"
                  rows={5}
                  placeholder={
                    selectedNode.type === "voice_note"
                      ? "Hi {firstName}, I wanted to reach out because…"
                      : selectedNode.type === "comment_post"
                      ? "Great post! {firstName}, I completely agree with…"
                      : "Thanks for your comment, {firstName}!"
                  }
                  value={selectedNode.config?.text || ""}
                  onChange={(e) => updateNode(selectedNode._id, { text: e.target.value })}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Variables: {"{firstName}"} {"{lastName}"} {"{company}"} {"{jobTitle}"}
                </div>
              </div>
            )}

            {/* message_open — same composer as message */}
            {selectedNode.type === "message_open" && (
              <MessageStepEditor
                node={selectedNode}
                linkedinAccounts={linkedinAccounts}
                updateNode={updateNode}
                toast={toast}
              />
            )}

            {/* inmail — subject + body */}
            {selectedNode.type === "inmail" && (
              <>
                <div className="input-group">
                  <label className="input-label">Subject</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Quick question, {firstName}"
                    value={selectedNode.config?.subject || ""}
                    onChange={(e) => updateNode(selectedNode._id, { subject: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Message Body</label>
                  <textarea
                    className="input"
                    rows={6}
                    placeholder="Hi {firstName}, I noticed you work at {company}…"
                    value={selectedNode.config?.body || ""}
                    onChange={(e) => updateNode(selectedNode._id, { body: e.target.value })}
                  />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Variables: {"{firstName}"} {"{lastName}"} {"{company}"} {"{jobTitle}"} {"{location}"}
                  </div>
                </div>
              </>
            )}

            {/* add_tag */}
            {selectedNode.type === "add_tag" && (
              <div className="input-group">
                <label className="input-label">Tag Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. hot-lead, follow-up, interested"
                  value={selectedNode.config?.tag || ""}
                  onChange={(e) => updateNode(selectedNode._id, { tag: e.target.value })}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  This tag will be saved to the lead's profile in the campaign.
                </div>
              </div>
            )}

            {/* Conditions */}
            {selectedNode.type?.startsWith("cond_") && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(255, 193, 7, 0.08)",
                  border: "1px solid rgba(255, 193, 7, 0.3)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {selectedNode.type === "cond_has_linkedin" &&
                  "Continues only if the lead has a LinkedIn URL. Leads without a LinkedIn URL are skipped."}
                {selectedNode.type === "cond_1st_level" &&
                  "Continues only if the lead is already a 1st-level connection. Others are skipped."}
                {selectedNode.type === "cond_opened_message" &&
                  "Continues only if the lead has opened a previous LinkedIn message. Others are skipped."}
                {selectedNode.type === "cond_open_profile" &&
                  "Continues only if the lead is an Open Profile (can receive InMail). Others are skipped."}
              </div>
            )}

            {selectedNode.type === "cond_check_column" && (
              <>
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(255, 193, 7, 0.08)",
                    border: "1px solid rgba(255, 193, 7, 0.3)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    marginBottom: 4,
                  }}
                >
                  Checks a field on the lead record. Leads that don't match the expected value are skipped.
                </div>
                <div className="input-group">
                  <label className="input-label">Field Name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. company, jobTitle, location"
                    value={selectedNode.config?.field || ""}
                    onChange={(e) => updateNode(selectedNode._id, { field: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Expected Value (contains)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. CEO, New York, SaaS"
                    value={selectedNode.config?.value || ""}
                    onChange={(e) => updateNode(selectedNode._id, { value: e.target.value })}
                  />
                </div>
              </>
            )}

            {!stepMeta(selectedNode.type).hasConfig && !(selectedNode.type?.startsWith("cond_")) && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  padding: "16px 0",
                }}
              >
                This step has no configuration.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)", fontSize: 12 }}
                onClick={() => deleteNode(selectedNode._id)}
              >
                Remove Step
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, fontSize: 12 }}
                onClick={() => saveSequence(nodes)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add step picker modal */}
      {addingAt !== null && (
        <div className="modal-overlay" onClick={() => setAddingAt(null)}>
          <div
            className="step-picker-modal animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="step-picker-header">
              <div className="step-picker-tabs">
                <button
                  className={`step-picker-tab${pickerTab === "action" ? " active" : ""}`}
                  onClick={() => setPickerTab("action")}
                >
                  Add an action
                </button>
                <button
                  className={`step-picker-tab${pickerTab === "condition" ? " active" : ""}`}
                  onClick={() => setPickerTab("condition")}
                >
                  Add a condition
                </button>
              </div>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setAddingAt(null)}
                style={{ marginLeft: "auto" }}
              >
                ✕
              </button>
            </div>

            {/* Grid */}
            <div className="step-picker-body">
              {pickerTab === "action" ? (
                <div className="step-picker-grid">
                  {ACTION_STEPS.map((s) => (
                    <button
                      key={s.type}
                      className="step-picker-card"
                      onClick={() => addNode(s.type, addingAt)}
                    >
                      <div className="step-picker-icon">
                        <span className="spi-action">{s.icon}</span>
                        <span className="spi-linkedin">in</span>
                      </div>
                      <span className="step-picker-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="step-picker-grid">
                  {CONDITION_STEPS.map((s) => (
                    <button
                      key={s.type}
                      className="step-picker-card"
                      onClick={() => addNode(s.type, addingAt)}
                    >
                      <div className="step-picker-icon">
                        <span className="spi-action">{s.icon}</span>
                        <span className="spi-linkedin">in</span>
                      </div>
                      <span className="step-picker-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Persona Tab ───────────────────────────────────────────────
function PersonaTab({ campaignId, campaign, agents, onSaved, toast }) {
  const [agentId, setAgentId] = useState(campaign.settings?.agentId || "");
  const [persona, setPersona] = useState(campaign.settings?.persona || {});
  const [saving, setSaving] = useState(false);

  // When agentId changes, pre-fill persona from that agent's persona
  function loadFromAgent(id) {
    setAgentId(id);
    if (!id) {
      setPersona({});
      return;
    }
    const agent = agents.find((a) => a.id === id);
    if (agent?.persona) {
      setPersona({ ...agent.persona });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await campaignsApi.update(campaignId, {
        settings: {
          ...campaign.settings,
          agentId,
          agentName: agents.find((a) => a.id === agentId)?.name || "",
          persona: Object.keys(persona).length > 0 ? persona : undefined,
        },
      });
      onSaved(updated);
      toast?.("Persona saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save persona", "danger");
    } finally {
      setSaving(false);
    }
  }

  const selectedAgent = agents.find((a) => a.id === agentId) || null;

  return (
    <div
      style={{
        maxWidth: 680,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>AI Persona</h3>
        <p
          style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Configure how the AI Assistant behaves for this specific campaign. You
          can start from an existing Agent or write a custom persona.
        </p>

        <div className="input-group">
          <label className="input-label">Start from Agent</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="input"
              value={agentId}
              onChange={(e) => loadFromAgent(e.target.value)}
            >
              <option value="">— Custom / none —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {selectedAgent?.persona && (
              <button
                className="btn btn-secondary"
                onClick={() => loadFromAgent(agentId)}
                type="button"
              >
                ↺ Reload
              </button>
            )}
          </div>
          {agents.length === 0 && (
            <div
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              No agents yet —{" "}
              <a href="/agents" style={{ color: "var(--signal)" }}>
                create one in AI Agents
              </a>{" "}
              first, or write a custom persona below.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Persona Fields</h3>
        {PERSONA_FIELDS.map((f) => (
          <div className="input-group" key={f.key}>
            <label className="input-label">{f.label}</label>
            <textarea
              className="input"
              rows={f.rows}
              placeholder={f.placeholder}
              value={persona[f.key] || ""}
              onChange={(e) =>
                setPersona((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Persona"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────
function AnalyticsTab({ campaignId }) {
  const [range, setRange] = useState("30d");
  const [metric, setMetric] = useState("sent");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsApi
      .getAnalytics(campaignId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const totals = data || {
    sent: 0,
    accepted: 0,
    replied: 0,
    booked: 0,
    acceptanceRate: 0,
    replyRate: 0,
  };
  const allSeries = data?.timeSeries || [];

  // Filter by range
  const rangeDays =
    range === "7d"
      ? 7
      : range === "14d"
        ? 14
        : range === "30d"
          ? 30
          : allSeries.length;
  const series = allSeries.slice(-rangeDays);

  // Pick metric key
  const metricKey = metric === "responses" ? "replied" : metric;
  const values = series.map((d) => d[metricKey] || 0);
  const maxVal = Math.max(...values, 1);

  const METRIC_COLOR = {
    sent: "var(--signal-subtle)",
    accepted: "rgba(99,102,241,0.25)",
    replied: "rgba(249,115,22,0.25)",
  };
  const METRIC_BORDER = {
    sent: "rgba(57,255,135,0.35)",
    accepted: "rgba(99,102,241,0.5)",
    replied: "rgba(249,115,22,0.5)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div className="analytics-stats">
        <div className="cstat">
          <div className="stat-value">{totals.acceptanceRate ?? 0}%</div>
          <div className="stat-label">Acceptance Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">{totals.replyRate ?? 0}%</div>
          <div className="stat-label">Reply Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.sent || 0}</div>
          <div className="stat-label">Requests Sent</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.accepted || 0}</div>
          <div className="stat-label">Accepted</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.replied || 0}</div>
          <div className="stat-label">Replies</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.booked || 0}</div>
          <div className="stat-label">Booked</div>
        </div>
      </div>

      {/* Chart card */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "sent", label: "Sent" },
              { id: "accepted", label: "Accepted" },
              { id: "responses", label: "Responses" },
            ].map((m) => (
              <button
                key={m.id}
                className={`filter-tab ${metric === m.id ? "active" : ""}`}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["7d", "14d", "30d", "All"].map((r) => (
              <button
                key={r}
                className={`filter-tab ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : values.every((v) => v === 0) ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No data yet. Run the campaign to see analytics.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
                height: 160,
                minWidth: values.length * 20,
                paddingBottom: 24,
                position: "relative",
              }}
            >
              {/* Y-axis guideline */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 24,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  pointerEvents: "none",
                }}
              >
                {[1, 0.5, 0].map((f) => (
                  <div
                    key={f}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--text-disabled)",
                        width: 20,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(maxVal * f)}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        borderTop: "1px dashed var(--border)",
                        opacity: 0.5,
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* Bars */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 4,
                  height: "100%",
                  flex: 1,
                  paddingLeft: 28,
                }}
              >
                {values.map((v, i) => {
                  const barH = Math.max(2, Math.round((v / maxVal) * 120));
                  const d = series[i];
                  const label = d?.date
                    ? new Date(d.date + "T00:00:00").toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })
                    : `D${d?.day ?? i + 1}`;
                  const showLabel =
                    values.length <= 14 ||
                    i % Math.ceil(values.length / 10) === 0;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        flex: 1,
                        minWidth: 12,
                      }}
                    >
                      <div
                        title={`Day ${series[i]?.day ?? i + 1}: ${v}`}
                        style={{
                          width: "100%",
                          maxWidth: 28,
                          height: barH,
                          background:
                            METRIC_COLOR[metricKey] || METRIC_COLOR.sent,
                          borderRadius: "3px 3px 0 0",
                          border: `1px solid ${METRIC_BORDER[metricKey] || METRIC_BORDER.sent}`,
                          transition: "height 0.2s",
                        }}
                      />
                      {showLabel && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--text-disabled)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────
function SettingsTab({ campaign, agents, linkedinAccounts, onSaved, toast }) {
  const [form, setForm] = useState({
    linkedinAccountId: campaign.settings?.linkedinAccountId || "",
    linkedinAccountName: campaign.settings?.linkedinAccountName || "",
    agentId: campaign.settings?.agentId || "",
    dailyConnectionLimit: campaign.settings?.dailyConnectionLimit || 20,
    dailyMessageLimit: campaign.settings?.dailyMessageLimit || 30,
    timezone: campaign.settings?.timezone || "Europe/London",
    activeHoursStart: campaign.settings?.activeHoursStart || "09:00",
    activeHoursEnd: campaign.settings?.activeHoursEnd || "18:00",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (form.activeHoursStart >= form.activeHoursEnd) {
      toast?.("Active hours end time must be after start time", "danger");
      return;
    }
    setSaving(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: {
          ...campaign.settings,
          ...form,
        },
      });
      onSaved(updated);
      toast?.("Settings saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save settings", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `Delete campaign "${campaign.name}"? This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await campaignsApi.delete(campaign.id);
      window.location.href = "/campaigns";
    } catch (err) {
      toast?.(err.message || "Could not delete campaign", "danger");
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 600,
      }}
    >
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Campaign Settings</h3>

        <div className="input-group">
          <label className="input-label">LinkedIn Account</label>
          <select
            className="input"
            value={form.linkedinAccountId}
            onChange={(e) => {
              const acc = linkedinAccounts.find((a) => a.id === e.target.value);
              setForm((f) => ({
                ...f,
                linkedinAccountId: e.target.value,
                linkedinAccountName: acc?.name || "",
              }));
            }}
          >
            <option value="">Select account…</option>
            {linkedinAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))}
            {linkedinAccounts.length === 0 && (
              <option disabled>No accounts connected — add in Settings</option>
            )}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">AI Assistant (Persona)</label>
          <select
            className="input"
            value={form.agentId}
            onChange={(e) =>
              setForm((f) => ({ ...f, agentId: e.target.value }))
            }
          >
            <option value="">No agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div
            style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}
          >
            Configure persona details in the Persona tab.
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Daily Connection Requests</label>
          <input
            className="input"
            type="number"
            value={form.dailyConnectionLimit}
            min={1}
            max={50}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                dailyConnectionLimit: Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="input-group">
          <label className="input-label">Daily Message Limit</label>
          <input
            className="input"
            type="number"
            value={form.dailyMessageLimit}
            min={1}
            max={100}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                dailyMessageLimit: Number(e.target.value),
              }))
            }
          />
        </div>

        <div className="input-group">
          <label className="input-label">Timezone</label>
          <select
            className="input"
            value={form.timezone}
            onChange={(e) =>
              setForm((f) => ({ ...f, timezone: e.target.value }))
            }
          >
            <option value="Europe/London">Europe/London (UTC+0/+1)</option>
            <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
            <option value="America/New_York">
              America/New_York (UTC-5/-4)
            </option>
            <option value="America/Los_Angeles">
              America/Los_Angeles (UTC-8/-7)
            </option>
            <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">Active Hours</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="input"
              type="time"
              value={form.activeHoursStart}
              onChange={(e) =>
                setForm((f) => ({ ...f, activeHoursStart: e.target.value }))
              }
              style={{ width: 120 }}
            />
            <span style={{ color: "var(--text-muted)" }}>to</span>
            <input
              className="input"
              type="time"
              value={form.activeHoursEnd}
              onChange={(e) =>
                setForm((f) => ({ ...f, activeHoursEnd: e.target.value }))
              }
              style={{ width: 120 }}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="card">
        <h3
          style={{ fontWeight: 700, marginBottom: 12, color: "var(--danger)" }}
        >
          Danger Zone
        </h3>
        <button
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete Campaign"}
        </button>
      </div>
    </div>
  );
}

// ── Message Step Editor ────────────────────────────────────────
const CONTACT_VARS = [
  { group: "Contact" },
  { label: "First Name",      value: "{firstName}",     preview: "John" },
  { label: "Last Name",       value: "{lastName}",      preview: "Smith" },
  { label: "Full Name",       value: "{fullName}",      preview: "John Smith" },
  { label: "Job Title",       value: "{jobTitle}",      preview: "Head of Sales" },
  { label: "Company",         value: "{company}",       preview: "Acme Corp" },
  { label: "Location",        value: "{location}",      preview: "London, UK" },
  { group: "Sender" },
  { label: "Calendar Link",   value: "{calendarLink}",  preview: "https://cal.com/you" },
  { label: "Your Company",    value: "{senderCompany}", preview: "ReachFlow" },
  { label: "Your Website",    value: "{senderWebsite}", preview: "https://reachflow.io" },
];

const SEND_CONDITIONS = [
  { value: "always",          label: "Always send" },
  { value: "if_accepted",     label: "Only if connection accepted" },
  { value: "if_no_reply",     label: "Send only if the recipient has never sent a message" },
];

function MessageStepEditor({ node, linkedinAccounts, updateNode, toast }) {
  const [showVarMenu, setShowVarMenu]     = useState(false);
  const [showAiPrompt, setShowAiPrompt]   = useState(false);
  const [aiPrompt, setAiPrompt]           = useState("");
  const [generatingAI, setGeneratingAI]   = useState(false);
  const [showPreview, setShowPreview]     = useState(false);
  const textareaRef = useRef(null);

  const config  = node.config || {};
  const msgText = config.text || "";
  const isEmpty = !msgText.trim();
  const selAcc  = linkedinAccounts.find((a) => a.id === config.accountId);

  function insertVar(v) {
    const ta = textareaRef.current;
    if (!ta) { updateNode(node._id, { text: msgText + v }); setShowVarMenu(false); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = msgText.slice(0, start) + v + msgText.slice(end);
    updateNode(node._id, { text: next });
    setShowVarMenu(false);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length); }, 0);
  }

  async function handleGenerateAI() {
    if (!aiPrompt.trim()) return;
    setGeneratingAI(true);
    try {
      const result = await campaignsApi.generateMessage({ prompt: aiPrompt });
      updateNode(node._id, { text: result.message });
      setShowAiPrompt(false);
      setAiPrompt("");
    } catch (err) {
      toast?.(err.message || "AI generation failed", "danger");
    } finally {
      setGeneratingAI(false);
    }
  }

  function previewText() {
    let t = msgText;
    CONTACT_VARS.filter((v) => v.value).forEach((v) => {
      t = t.replace(new RegExp(v.value.replace(/[{}]/g, "\\$&"), "g"), v.preview);
    });
    return t;
  }

  return (
    <>
      {/* Sender account */}
      <div className="input-group">
        <label className="input-label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
          Select a sender account
        </label>
        {selAcc ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="sender-chip">
              <div className="sender-avatar">{(selAcc.name || "?")[0].toUpperCase()}</div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{selAcc.name}</span>
              <button
                className="sender-chip-remove"
                onClick={() => updateNode(node._id, { accountId: "", accountName: "" })}
              >
                ×
              </button>
            </div>
            <select
              className="input"
              style={{ fontSize: 12, padding: "4px 8px", width: "auto" }}
              value={config.accountId}
              onChange={(e) => {
                const acc = linkedinAccounts.find((a) => a.id === e.target.value);
                updateNode(node._id, { accountId: e.target.value, accountName: acc?.name || "" });
              }}
            >
              {linkedinAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.id}</option>
              ))}
            </select>
          </div>
        ) : (
          <select
            className="input"
            value=""
            onChange={(e) => {
              const acc = linkedinAccounts.find((a) => a.id === e.target.value);
              updateNode(node._id, { accountId: e.target.value, accountName: acc?.name || "" });
            }}
          >
            <option value="">Select account…</option>
            {linkedinAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name || a.id}</option>
            ))}
          </select>
        )}
      </div>

      {/* Message composer */}
      <div className="msg-composer">
        {/* Toolbar */}
        <div className="msg-toolbar">
          <button
            className={`msg-toolbar-btn${showAiPrompt ? " active" : ""}`}
            onClick={() => { setShowAiPrompt((v) => !v); setShowPreview(false); }}
          >
            ✦ AI Prompt
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="msg-toolbar-btn"
              onClick={() => setShowVarMenu((v) => !v)}
            >
              + Contact Variables
            </button>
            {showVarMenu && (
              <div className="var-dropdown" onMouseLeave={() => setShowVarMenu(false)}>
                {CONTACT_VARS.map((v, i) =>
                  v.group ? (
                    <div key={i} className="var-dropdown-group">{v.group}</div>
                  ) : (
                    <button key={v.value} className="var-dropdown-item" onClick={() => insertVar(v.value)}>
                      <span className="var-tag">{v.value}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{v.label}</span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
          <button className="msg-toolbar-btn">📎 Add</button>
          <button
            className={`msg-toolbar-btn${showPreview ? " active" : ""}`}
            onClick={() => { setShowPreview((v) => !v); setShowAiPrompt(false); }}
          >
            ◉ Preview
          </button>
        </div>

        {/* AI Prompt bar */}
        {showAiPrompt && (
          <div className="ai-prompt-bar">
            <input
              className="input"
              style={{ fontSize: 12, flex: 1 }}
              placeholder="Describe the message you want… e.g. Follow up after connection, mention their company"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleGenerateAI()}
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!aiPrompt.trim() || generatingAI}
              onClick={handleGenerateAI}
              style={{ whiteSpace: "nowrap" }}
            >
              {generatingAI ? "Generating…" : "✦ Generate"}
            </button>
          </div>
        )}

        {/* Message body */}
        {showPreview ? (
          <div className="msg-preview-body">
            {previewText() || <span style={{ color: "var(--text-disabled)" }}>Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="msg-textarea"
            rows={9}
            placeholder=""
            value={msgText}
            onChange={(e) => updateNode(node._id, { text: e.target.value })}
          />
        )}
      </div>

      {/* Validation */}
      {isEmpty && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--danger)" }}>
          <span>⊙</span> Type your message
        </div>
      )}

      {/* Send condition */}
      <div className="input-group" style={{ margin: 0 }}>
        <select
          className="input msg-condition-select"
          value={config.condition || "if_no_reply"}
          onChange={(e) => updateNode(node._id, { condition: e.target.value })}
        >
          {SEND_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
