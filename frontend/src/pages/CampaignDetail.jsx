import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LeadFinderModal from "../components/LeadFinderModal";
import {
  campaigns as campaignsApi,
  agents as agentsApi,
  unipile,
} from "../lib/api";
import { useToast } from "../components/Toast";
import "./CampaignDetail.css";

// ── Step type definitions ─────────────────────────────────────
const STEP_TYPES = [
  {
    type: "visit_profile",
    icon: "◎",
    label: "Visit LinkedIn profile",
    hasConfig: false,
  },
  {
    type: "like_post",
    icon: "◇",
    label: "Like last LinkedIn post",
    hasConfig: false,
  },
  { type: "follow", icon: "◆", label: "Follow on LinkedIn", hasConfig: false },
  { type: "wait", icon: "⏰", label: "Wait", hasConfig: true },
  {
    type: "connection_request",
    icon: "◈",
    label: "Send connection request",
    hasConfig: true,
  },
  {
    type: "message",
    icon: "✉",
    label: "Send LinkedIn message",
    hasConfig: true,
  },
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
  if (!stepMeta(node.type).hasConfig) return true;
  if (node.type === "wait") return (node.config?.days || 0) > 0;
  if (node.type === "connection_request") return true; // note is optional
  if (node.type === "message") return !!node.config?.text?.trim();
  return true;
}

const IMPORT_SOURCES = [
  {
    id: "signal",
    icon: "◎",
    label: "Signal Agent Leads",
    desc: "Pull warm leads from your Intent Signal Agents",
  },
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
  Accepted: "badge-signal",
  accepted: "badge-signal",
  Pending: "badge-muted",
  pending: "badge-muted",
  Rejected: "badge-danger",
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
        if (campLeads.status === "fulfilled")
          setLeads(Array.isArray(campLeads.value) ? campLeads.value : []);
        if (agentList.status === "fulfilled")
          setAgents(Array.isArray(agentList.value) ? agentList.value : []);
        if (accs.status === "fulfilled")
          setLinkedinAccounts(accs.value?.items || []);
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
            {campaign.status || "draft"}
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
            className={`btn btn-secondary btn-sm`}
            onClick={handleToggleStatus}
          >
            {campaign.status === "active" ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleToggleStatus}
            disabled={campaign.status === "active"}
          >
            ▶ Run it!
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

      {/* Tab content */}
      <div className="detail-content">
        {tab === "leads" && (
          <LeadsTab
            leads={leads}
            onImport={() => setShowImport(true)}
            showImport={showImport}
            onCloseImport={() => setShowImport(false)}
            onOpenLeadFinder={() => { setShowImport(false); setLfOpen(true) }}
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

// ── Leads Tab ─────────────────────────────────────────────────
function LeadsTab({ leads, onImport, showImport, onCloseImport, onOpenLeadFinder }) {
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
        <button className="btn btn-primary btn-sm" onClick={onImport}>
          + Import Contacts
        </button>
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
                      {l.status || "Pending"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {l.addedAt
                      ? new Date(l.addedAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                      if (s.id === 'finder' || s.id === 'post') {
                        onOpenLeadFinder()
                      } else {
                        alert(`${s.label} — coming soon`)
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
}) {
  const [nodes, setNodes] = useState(() =>
    (initialNodes || []).map((n, i) => ({ ...n, _id: n.id || `n_${i}` })),
  );
  const [selectedId, setSelectedId] = useState(null);
  const [addingAt, setAddingAt] = useState(null); // index to insert after (-1 = beginning)
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
        <div className="builder-entry-node">
          <span>▶</span> Start the campaign
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
          return (
            <div key={node._id}>
              <div
                className={`builder-node ${!ok ? "missing" : ""} ${selectedId === node._id ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(node._id);
                }}
              >
                <div className="node-icon">{meta.icon}</div>
                <div className="node-content">
                  <div className="node-label">{nodeLabel(node)}</div>
                  {!ok && <div className="node-error">Message required</div>}
                  {ok &&
                    meta.hasConfig &&
                    node.type !== "wait" &&
                    node.config?.text && (
                      <div className="node-preview">
                        "{node.config.text.slice(0, 50)}
                        {node.config.text.length > 50 ? "…" : ""}"
                      </div>
                    )}
                  {ok &&
                    node.type === "connection_request" &&
                    node.config?.note && (
                      <div className="node-preview">
                        Note: "{node.config.note.slice(0, 40)}…"
                      </div>
                    )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 10, padding: "2px 5px", lineHeight: 1 }}
                    disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); moveNode(node._id, -1); }}
                    title="Move up"
                  >▲</button>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 10, padding: "2px 5px", lineHeight: 1 }}
                    disabled={i === nodes.length - 1}
                    onClick={(e) => { e.stopPropagation(); moveNode(node._id, 1); }}
                    title="Move down"
                  >▼</button>
                </div>
                <button
                  className="btn btn-icon btn-ghost node-edit-btn"
                  style={{
                    fontSize: 11,
                    color: "var(--danger)",
                    flexShrink: 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNode(node._id);
                  }}
                  title="Remove step"
                >
                  ✕
                </button>
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
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          onClick={(e) => {
            e.stopPropagation();
            saveSequence(nodes);
          }}
          disabled={saving}
        >
          {saving ? "Saving…" : "✓ Save Sequence"}
        </button>
      </div>

      {/* Right: step config panel */}
      {selectedNode && (
        <div
          className="node-config-panel animate-slide-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="node-config-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>
                {stepMeta(selectedNode.type).icon}
              </span>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>
                {stepMeta(selectedNode.type).label}
              </h3>
            </div>
            <button
              className="btn btn-icon btn-ghost"
              onClick={() => setSelectedId(null)}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
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
                    Variables: {"{firstName}"} {"{lastName}"} {"{company}"}
                  </div>
                </div>
              </>
            )}

            {selectedNode.type === "message" && (
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
                  <label className="input-label">Message</label>
                  <textarea
                    className="input"
                    rows={6}
                    placeholder="Hey {firstName}, following up on my connection request…"
                    value={selectedNode.config?.text || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { text: e.target.value })
                    }
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Variables: {"{firstName}"} {"{lastName}"} {"{company}"}{" "}
                    {"{calendarLink}"}
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Send Condition</label>
                  <select
                    className="input"
                    value={selectedNode.config?.condition || "always"}
                    onChange={(e) =>
                      updateNode(selectedNode._id, {
                        condition: e.target.value,
                      })
                    }
                  >
                    <option value="always">Always send</option>
                    <option value="if_accepted">
                      Only if connection accepted
                    </option>
                    <option value="if_no_reply">Only if no reply yet</option>
                  </select>
                </div>
              </>
            )}

            {!stepMeta(selectedNode.type).hasConfig && (
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
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={() => deleteNode(selectedNode._id)}
              >
                Remove Step
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={() => saveSequence(nodes)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Sequence"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add step picker modal */}
      {addingAt !== null && (
        <div className="modal-overlay" onClick={() => setAddingAt(null)}>
          <div
            className="modal-box animate-fade-in"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Add Step</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setAddingAt(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {STEP_TYPES.map((s) => (
                  <button
                    key={s.type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all var(--transition-fast)",
                    }}
                    onClick={() => addNode(s.type, addingAt)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--signal)";
                      e.currentTarget.style.background = "var(--signal-subtle)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--surface-2)";
                    }}
                  >
                    <span
                      style={{
                        fontSize: 20,
                        width: 28,
                        textAlign: "center",
                        flexShrink: 0,
                        color: "var(--signal)",
                      }}
                    >
                      {s.icon}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {s.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {s.hasConfig ? "Configurable" : "Automatic action"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
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
    campaignsApi.getAnalytics(campaignId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const totals = data || { sent: 0, accepted: 0, replied: 0, acceptanceRate: 0, replyRate: 0 };
  const allSeries = data?.timeSeries || [];

  // Filter by range
  const rangeDays = range === "7d" ? 7 : range === "14d" ? 14 : range === "30d" ? 30 : allSeries.length;
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
      </div>

      {/* Chart card */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
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
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : values.every((v) => v === 0) ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No data yet. Run the campaign to see analytics.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, minWidth: values.length * 20, paddingBottom: 24, position: "relative" }}>
              {/* Y-axis guideline */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
                {[1, 0.5, 0].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "var(--text-disabled)", width: 20, textAlign: "right", flexShrink: 0 }}>
                      {Math.round(maxVal * f)}
                    </span>
                    <div style={{ flex: 1, borderTop: "1px dashed var(--border)", opacity: 0.5 }} />
                  </div>
                ))}
              </div>
              {/* Bars */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: "100%", flex: 1, paddingLeft: 28 }}>
                {values.map((v, i) => {
                  const barH = Math.max(2, Math.round((v / maxVal) * 120));
                  const label = series[i] ? `D${series[i].day}` : `${i + 1}`;
                  const showLabel = values.length <= 14 || i % Math.ceil(values.length / 10) === 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, minWidth: 12 }}>
                      <div title={`Day ${series[i]?.day ?? i + 1}: ${v}`} style={{ width: "100%", maxWidth: 28, height: barH, background: METRIC_COLOR[metricKey] || METRIC_COLOR.sent, borderRadius: "3px 3px 0 0", border: `1px solid ${METRIC_BORDER[metricKey] || METRIC_BORDER.sent}`, transition: "height 0.2s" }} />
                      {showLabel && (
                        <span style={{ fontSize: 9, color: "var(--text-disabled)", whiteSpace: "nowrap" }}>{label}</span>
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
