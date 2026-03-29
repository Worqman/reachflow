import { useEffect, useState } from "react";
import { agents as agentsApi } from "../lib/api";
import { useToast } from "../components/Toast";
import "./Agents.css";

const TYPE_META = {
  signal: { label: "Signal Agent", icon: "◎", badge: "badge-info" },
  assistant: { label: "AI Assistant", icon: "◆", badge: "badge-signal" },
};

const PERSONA_FIELDS = [
  {
    key: "roleAndObjective",
    label: "Role & Objective",
    rows: 3,
    placeholder:
      "Describe the assistant's role and what it's trying to achieve…",
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
      "How to handle: not right person, too small, are you automated…",
  },
  {
    key: "finalRules",
    label: "Final Rules",
    rows: 3,
    placeholder: "Word limits, dos and donts, must-follow rules…",
  },
];

export default function Agents() {
  const { toast } = useToast();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);

  useEffect(() => {
    agentsApi
      .list()
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(agent) {
    setAgents((prev) => [agent, ...prev]);
    setCreateOpen(false);
    setShowTypeSelect(false);
    setEditingAgent(agent); // open detail immediately after create
  }

  function handleUpdated(agent) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
    setEditingAgent(agent);
  }

  function handleDeleted(id) {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setEditingAgent(null);
  }

  async function handleToggle(e, agent) {
    e.stopPropagation();
    const next = agent.status === "active" ? "paused" : "active";
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, status: next } : a)),
    );
    try {
      await agentsApi.update(agent.id, { status: next });
    } catch {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id ? { ...a, status: agent.status } : a,
        ),
      );
    }
  }

  const active = agents.filter((a) => a.status === "active").length;

  if (showTypeSelect && !createOpen) {
    return (
      <AgentTypeSelect
        onBack={() => setShowTypeSelect(false)}
        onSelectAssistant={() => setCreateOpen(true)}
      />
    );
  }

  return (
    <div className="page agents-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Agents</h1>
          <p className="page-subtitle">
            {agents.length} agents · {active} active
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowTypeSelect(true)}
        >
          + Create Agent
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
          Loading agents…
        </div>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => {
            const meta = TYPE_META[agent.type] || TYPE_META.assistant;
            const hasPersona =
              agent.persona &&
              Object.values(agent.persona).some((v) => v?.trim?.());
            return (
              <div key={agent.id} className="agent-card card">
                <div className="agent-card-header">
                  <span className={`badge ${meta.badge}`}>
                    {meta.icon} {meta.label}
                  </span>
                  <div className="agent-card-actions">
                    <label
                      className="toggle"
                      onClick={(e) => handleToggle(e, agent)}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={agent.status === "active"}
                      />
                      <span className="toggle-track" />
                    </label>
                    <button
                      className="btn btn-icon btn-ghost"
                      title="Edit agent"
                      onClick={() => setEditingAgent(agent)}
                    >
                      ✎
                    </button>
                  </div>
                </div>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-metric">
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {hasPersona ? (
                      <span
                        className="badge badge-signal"
                        style={{ fontSize: 11 }}
                      >
                        ◆ Persona configured
                      </span>
                    ) : (
                      <span
                        className="badge badge-muted"
                        style={{ fontSize: 11 }}
                      >
                        No persona yet
                      </span>
                    )}
                  </span>
                </div>
                <div className="agent-card-footer">
                  <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>
                    Created{" "}
                    {agent.createdAt
                      ? new Date(agent.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <span
                    className={`badge ${agent.status === "active" ? "badge-signal" : "badge-muted"}`}
                  >
                    {agent.status}
                  </span>
                </div>
              </div>
            );
          })}

          <div
            className="agent-card agent-card-create card"
            onClick={() => setShowTypeSelect(true)}
          >
            <div className="create-plus">+</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Create New Agent
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              Signal Agent or AI Assistant
            </div>
          </div>
        </div>
      )}

      {/* Create AI Assistant modal */}
      {createOpen && (
        <CreateAssistantModal
          onClose={() => {
            setCreateOpen(false);
            setShowTypeSelect(false);
          }}
          onCreated={handleCreated}
          toast={toast}
        />
      )}

      {/* Edit / Persona modal */}
      {editingAgent && (
        <AgentDetailModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Agent type selector ────────────────────────────────────────
function AgentTypeSelect({ onBack, onSelectAssistant }) {
  return (
    <div className="page type-select-page animate-fade-in">
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ marginBottom: 32 }}
      >
        ← Back
      </button>
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          What type of agent do you need?
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 40 }}>
          Choose the right agent for your goal — you can create as many as you
          need.
        </p>
        <div className="type-cards">
          <div
            className="type-card card"
            onClick={() => alert("Signal Agent — coming soon")}
          >
            <div className="type-card-icon">◎</div>
            <div className="type-card-title">Intent Signal Agent</div>
            <div className="type-card-subtitle">Lead Discovery</div>
            <p className="type-card-desc">
              Monitors LinkedIn 24/7 for buying signals — job changes, keyword
              posts, competitor follows. Surfaces warm leads that match your
              ICP.
            </p>
            <div className="type-card-tags">
              <span className="chip">Finds Leads</span>
              <span className="chip">Intent Signals</span>
              <span className="chip">ICP Scoring</span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: 16 }}
            >
              Create Signal Agent →
            </button>
          </div>

          <div
            className="type-card card type-card-featured"
            onClick={onSelectAssistant}
          >
            <div className="type-card-icon" style={{ color: "var(--signal)" }}>
              ◆
            </div>
            <div className="type-card-title">AI Assistant</div>
            <div className="type-card-subtitle">Sales & BD</div>
            <p className="type-card-desc">
              Handles LinkedIn conversations autonomously from the first reply
              all the way through to booking a meeting — without you lifting a
              finger.
            </p>
            <div className="type-card-tags">
              <span className="chip">Books Meetings</span>
              <span className="chip">24/7 Replies</span>
              <span className="chip">Fully Autonomous</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16 }}
            >
              Create AI Assistant →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create AI Assistant modal ──────────────────────────────────
function CreateAssistantModal({ onClose, onCreated, toast }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const agent = await agentsApi.create({
        name: name.trim(),
        type: "assistant",
      });
      onCreated(agent);
    } catch (err) {
      toast?.(err.message || "Could not create agent", "danger");
      setCreating(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">New AI Assistant</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="input-group">
            <label className="input-label">Assistant Name</label>
            <input
              className="input"
              placeholder="e.g. Creative Deer SDR"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) =>
                e.key === "Enter" && name.trim() && handleCreate()
              }
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            You'll configure the persona and AI settings in the next step.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim() || creating}
            onClick={handleCreate}
          >
            {creating ? "Creating…" : "Create & Configure →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent detail / persona editor modal ───────────────────────
function AgentDetailModal({ agent, onClose, onUpdated, onDeleted, toast }) {
  const [name, setName] = useState(agent.name);
  const [persona, setPersona] = useState(agent.persona || {});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // AI generation state
  const [serviceOffer, setServiceOffer] = useState("");
  const [targetingBrief, setTargetingBrief] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await agentsApi.update(agent.id, {
        name: name.trim(),
        persona,
      });
      onUpdated(updated);
      toast?.("Agent saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePersona() {
    if (!serviceOffer.trim() && !targetingBrief.trim()) {
      toast?.(
        "Enter at least one of: service offer or target audience",
        "danger",
      );
      return;
    }
    setGenerating(true);
    try {
      const result = await agentsApi.generatePersona(agent.id, {
        serviceOffer,
        targetingBrief,
      });
      setPersona(result.persona);
      onUpdated(result.agent);
      toast?.("Persona generated", "success");
    } catch (err) {
      toast?.(err.message || "Generation failed", "danger");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete agent "${agent.name}"? This cannot be undone.`))
      return;
    setDeleting(true);
    try {
      await agentsApi.delete(agent.id);
      onDeleted(agent.id);
      toast?.("Agent deleted", "success");
    } catch (err) {
      toast?.(err.message || "Could not delete", "danger");
      setDeleting(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box animate-fade-in"
        style={{
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge badge-signal">◆ AI Assistant</span>
            <input
              className="input"
              style={{
                fontWeight: 700,
                fontSize: 15,
                border: "none",
                padding: "4px 0",
                background: "transparent",
                width: 280,
              }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Generate with AI section */}
          <div
            style={{
              background: "var(--surface-2, var(--surface))",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 16,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ◆ Generate Persona with AI
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontWeight: 400,
                }}
              >
                — fills all fields automatically
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Service / Offer</label>
                <input
                  className="input"
                  placeholder="e.g. LinkedIn outreach automation for UK accountants"
                  value={serviceOffer}
                  onChange={(e) => setServiceOffer(e.target.value)}
                />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Target Audience</label>
                <input
                  className="input"
                  placeholder="e.g. Managing Directors at UK accounting firms with 5–50 staff"
                  value={targetingBrief}
                  onChange={(e) => setTargetingBrief(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ alignSelf: "flex-start" }}
                disabled={generating}
                onClick={handleGeneratePersona}
              >
                {generating ? "◆ Generating…" : "◆ Generate Persona"}
              </button>
            </div>
          </div>

          {/* Persona fields */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Persona
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {PERSONA_FIELDS.map((f) => (
                <div key={f.key} className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">{f.label}</label>
                  <textarea
                    className="input"
                    rows={f.rows}
                    placeholder={f.placeholder}
                    value={persona[f.key] || ""}
                    onChange={(e) =>
                      setPersona((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    style={{ resize: "vertical" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="modal-footer"
          style={{ justifyContent: "space-between" }}
        >
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--danger)" }}
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete Agent"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : "Save Agent →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
