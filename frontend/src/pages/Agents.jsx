import { useEffect, useState } from "react";
import { agents as agentsApi } from "../lib/api";
import { useToast } from "../components/Toast";
import "./Agents.css";

const TONE_OPTIONS = [
  {
    value: "professional",
    label: "Professional",
    desc: "Formal, confident, clear",
  },
  {
    value: "friendly",
    label: "Friendly",
    desc: "Warm, approachable, conversational",
  },
  {
    value: "direct",
    label: "Direct",
    desc: "Concise, no fluff, gets to the point",
  },
];

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
    rows: 5,
    placeholder:
      "Scripts for: not right person, too small, are you automated, need approval…",
    aiGenerated: true,
  },
  {
    key: "exampleConversation",
    label: "Example Conversation",
    rows: 8,
    placeholder:
      "Agent: Hi [Name]…\nProspect: Thanks, but…\nAgent: Totally understand…",
    aiGenerated: true,
  },
  {
    key: "finalRules",
    label: "Final Rules",
    rows: 3,
    placeholder: "Word limits, dos and donts, must-follow rules…",
    aiGenerated: true,
  },
];

const SIGNAL_TYPE_OPTIONS = [
  { value: "job_change", label: "Job Change" },
  { value: "keyword_post", label: "Keyword Post" },
  { value: "competitor_follow", label: "Competitor Follow" },
  { value: "company_growth", label: "Company Growth" },
  { value: "funding_round", label: "Funding Round" },
];

const SIGNAL_TYPE_LABELS = Object.fromEntries(
  SIGNAL_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default function Agents() {
  const { toast } = useToast();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
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
    setEditingAgent(agent);
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
    e.preventDefault();
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

  return (
    <div className="page agents-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Agents</h1>
          <p className="page-subtitle">
            {agents.length} agents · {active} active
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
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
            const hasPersona =
              agent.persona &&
              Object.values(agent.persona).some((v) => v?.trim?.());
            const hasSignals =
              (agent.keywords || []).length > 0 ||
              (agent.signalTypes || []).length > 0;
            return (
              <div key={agent.id} className="agent-card card">
                <div className="agent-card-header">
                  <span className="badge badge-signal">◆◎ AI Agent</span>
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {hasPersona ? (
                      <span
                        className="badge badge-signal"
                        style={{ fontSize: 11 }}
                      >
                        ◆ Persona set
                      </span>
                    ) : (
                      <span
                        className="badge badge-muted"
                        style={{ fontSize: 11 }}
                      >
                        No persona
                      </span>
                    )}
                    {hasSignals ? (
                      <span
                        className="badge badge-info"
                        style={{ fontSize: 11 }}
                      >
                        ◎ Signals set
                      </span>
                    ) : (
                      <span
                        className="badge badge-muted"
                        style={{ fontSize: 11 }}
                      >
                        No signals
                      </span>
                    )}
                  </div>
                  {(agent.signalsDetected > 0 || agent.leadsFound > 0) && (
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>◎ {agent.signalsDetected} signals</span>
                      <span>◆ {agent.leadsFound} leads</span>
                    </div>
                  )}
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
            onClick={() => setCreateOpen(true)}
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
              AI Assistant + Intent Signals
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          toast={toast}
        />
      )}

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

// ── Section divider header ─────────────────────────────────────
function SectionHeader({ icon, title, noBorder }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "16px 0 4px",
        borderTop: noBorder ? "none" : "1px solid var(--border)",
        marginTop: noBorder ? 0 : 8,
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span
        style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}
      >
        {title}
      </span>
    </div>
  );
}

// ── Create Agent modal (2-step wizard) ────────────────────────
function CreateAgentModal({ onClose, onCreated, toast }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [serviceOffer, setServiceOffer] = useState("");
  const [targetingBrief, setTargetingBrief] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const agent = await agentsApi.create({ name: name.trim() });
      const result = await agentsApi.generatePersona(agent.id, {
        serviceOffer,
        targetingBrief,
        tone,
      });
      onCreated({ ...agent, persona: result.persona });
    } catch (err) {
      toast?.(err.message || "Could not create agent", "danger");
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => !loading && e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box animate-fade-in" style={{ maxWidth: 500 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 className="modal-title" style={{ margin: 0 }}>
              New AI Agent
            </h2>
            {/* Step indicator */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[1, 2].map((s) => (
                <div
                  key={s}
                  style={{
                    width: s === step ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    background:
                      s === step
                        ? "var(--signal)"
                        : s < step
                          ? "var(--signal)"
                          : "var(--border-2)",
                    opacity: s < step ? 0.4 : 1,
                    transition: "all 0.2s",
                  }}
                />
              ))}
            </div>
          </div>
          {!loading && (
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading ? (
          <div
            className="modal-body"
            style={{ textAlign: "center", padding: "40px 24px" }}
          >
            <div style={{ fontSize: 28, marginBottom: 16 }}>◆</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              Building your agent…
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              AI is generating the persona, objection handling, example
              conversation, and rules.
            </div>
          </div>
        ) : step === 1 ? (
          <>
            <div className="modal-body">
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginBottom: 20,
                }}
              >
                Give your agent a name, then answer a few quick questions so the
                AI can build its persona automatically.
              </p>
              <div className="input-group">
                <label className="input-label">Agent Name</label>
                <input
                  className="input"
                  placeholder="e.g. EMEA Outbound Agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" && name.trim() && setStep(2)
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!name.trim()}
                onClick={() => setStep(2)}
              >
                Next →
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="modal-body"
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <p
                style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}
              >
                Answer these questions and the AI will generate the full persona
                — including objection handling, an example conversation, and
                final rules.
              </p>

              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">
                  What service or product are you offering?
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. LinkedIn outreach automation for B2B SaaS companies"
                  value={serviceOffer}
                  onChange={(e) => setServiceOffer(e.target.value)}
                  autoFocus
                  style={{ resize: "none" }}
                />
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">
                  Who is your ideal customer?
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Heads of Sales at Series A–C SaaS companies in the UK with 20–200 employees"
                  value={targetingBrief}
                  onChange={(e) => setTargetingBrief(e.target.value)}
                  style={{ resize: "none" }}
                />
              </div>

              <div>
                <label
                  className="input-label"
                  style={{ display: "block", marginBottom: 8 }}
                >
                  What tone should the agent use?
                </label>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {TONE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: "var(--radius)",
                        border: `1px solid ${tone === opt.value ? "var(--signal)" : "var(--border)"}`,
                        background:
                          tone === opt.value
                            ? "var(--signal-subtle)"
                            : "var(--surface)",
                        cursor: "pointer",
                        transition: "all var(--transition-base)",
                      }}
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={opt.value}
                        checked={tone === opt.value}
                        onChange={() => setTone(opt.value)}
                        style={{ accentColor: "var(--signal)" }}
                      />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color:
                              tone === opt.value
                                ? "var(--signal)"
                                : "var(--text-primary)",
                          }}
                        >
                          {opt.label}
                        </div>
                        <div
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className="btn btn-primary"
                disabled={!serviceOffer.trim() && !targetingBrief.trim()}
                onClick={handleCreate}
              >
                ◆ Generate & Create Agent →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Agent detail modal ─────────────────────────────────────────
function AgentDetailModal({ agent, onClose, onUpdated, onDeleted, toast }) {
  const [name, setName] = useState(agent.name);
  const [persona, setPersona] = useState(agent.persona || {});
  const [keywords, setKeywords] = useState((agent.keywords || []).join(", "));
  const [signalTypes, setSignalTypes] = useState(agent.signalTypes || []);
  const [icpFilters, setIcpFilters] = useState(agent.icpFilters?.notes || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // AI generation state
  const [serviceOffer, setServiceOffer] = useState("");
  const [targetingBrief, setTargetingBrief] = useState("");
  const [genTone, setGenTone] = useState("professional");
  const [generating, setGenerating] = useState(false);

  // Signal events — load immediately when modal opens
  const [signalEvents, setSignalEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    agentsApi
      .listSignalEvents(agent.id)
      .then((data) => setSignalEvents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, [agent.id]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await agentsApi.update(agent.id, {
        name: name.trim(),
        persona,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        signalTypes,
        icpFilters: icpFilters.trim() ? { notes: icpFilters.trim() } : {},
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
        tone: genTone,
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

  async function handleActionEvent(eventId) {
    try {
      await agentsApi.actionSignalEvent(agent.id, eventId);
      setSignalEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, actioned: true } : e)),
      );
    } catch (err) {
      toast?.(err.message || "Could not mark as actioned", "danger");
    }
  }

  function toggleSignalType(value) {
    setSignalTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box animate-fade-in"
        style={{
          maxWidth: 700,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge badge-signal">◆◎ AI Agent</span>
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
            gap: 0,
          }}
        >
          {/* ══ AI PERSONA ══ */}
          <SectionHeader icon="◆" title="AI Persona" noBorder />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              padding: "20px 0",
            }}
          >
            {/* Generate with AI */}
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
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
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
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Tone</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {TONE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 10px",
                          borderRadius: "var(--radius)",
                          border: `1px solid ${genTone === opt.value ? "var(--signal)" : "var(--border)"}`,
                          background:
                            genTone === opt.value
                              ? "var(--signal-subtle)"
                              : "transparent",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: genTone === opt.value ? 600 : 400,
                          color:
                            genTone === opt.value
                              ? "var(--signal)"
                              : "var(--text-secondary)",
                          transition: "all var(--transition-base)",
                        }}
                      >
                        <input
                          type="radio"
                          name="genTone"
                          value={opt.value}
                          checked={genTone === opt.value}
                          onChange={() => setGenTone(opt.value)}
                          style={{ display: "none" }}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {PERSONA_FIELDS.map((f) => (
                <div key={f.key} className="input-group" style={{ margin: 0 }}>
                  <label
                    className="input-label"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {f.label}
                    {f.aiGenerated && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--signal)",
                          background: "var(--signal-subtle)",
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        ◆ AI generated
                      </span>
                    )}
                  </label>
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

          {/* ══ INTENT SIGNALS ══ */}
          <SectionHeader icon="◎" title="Intent Signals" />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              padding: "20px 0",
            }}
          >
            {/* Stats */}
            <div style={{ display: "flex", gap: 16 }}>
              {[
                {
                  label: "Signals Detected",
                  value: agent.signalsDetected || 0,
                },
                { label: "Leads Found", value: agent.leadsFound || 0 },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: 1,
                    background: "var(--surface-2, var(--surface))",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Keywords */}
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">Keywords to Monitor</label>
              <input
                className="input"
                placeholder="e.g. outreach automation, sales tool, CRM replacement (comma-separated)"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                Comma-separated. The agent will surface leads who post or engage
                with these topics.
              </p>
            </div>

            {/* Signal Types */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Signal Types
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SIGNAL_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      background: signalTypes.includes(opt.value)
                        ? "var(--signal-subtle)"
                        : "var(--surface)",
                      fontSize: 13,
                      fontWeight: signalTypes.includes(opt.value) ? 600 : 400,
                      color: signalTypes.includes(opt.value)
                        ? "var(--signal)"
                        : "var(--text-secondary)",
                      transition: "all var(--transition-base)",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ display: "none" }}
                      checked={signalTypes.includes(opt.value)}
                      onChange={() => toggleSignalType(opt.value)}
                    />
                    {signalTypes.includes(opt.value) ? "◎ " : "○ "}
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* ICP Filters */}
            <div className="input-group" style={{ margin: 0 }}>
              <label className="input-label">ICP Filters</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Only surface leads at companies with 10–200 employees in the UK, in SaaS or fintech…"
                value={icpFilters}
                onChange={(e) => setIcpFilters(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>

            {/* Signal Events */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                Recent Signal Events
              </div>
              {eventsLoading ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Loading events…
                </div>
              ) : signalEvents.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    padding: "20px 0",
                    textAlign: "center",
                  }}
                >
                  No signal events yet. Once the agent detects buying signals,
                  they'll appear here.
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {signalEvents.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "12px 14px",
                        background: "var(--surface-2, var(--surface))",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        opacity: ev.actioned ? 0.55 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                            {ev.leadName}
                          </span>
                          {ev.company && (
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                              }}
                            >
                              · {ev.company}
                            </span>
                          )}
                          <span
                            className="badge badge-info"
                            style={{ fontSize: 10 }}
                          >
                            {SIGNAL_TYPE_LABELS[ev.type] || ev.type}
                          </span>
                          {ev.intentScore > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                  ev.intentScore >= 70
                                    ? "var(--signal)"
                                    : "var(--text-muted)",
                              }}
                            >
                              {ev.intentScore}% intent
                            </span>
                          )}
                        </div>
                        {ev.signal && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              marginTop: 3,
                            }}
                          >
                            {ev.signal}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-disabled)",
                            marginTop: 4,
                          }}
                        >
                          {new Date(ev.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {!ev.actioned && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleActionEvent(ev.id)}
                          style={{ whiteSpace: "nowrap", fontSize: 11 }}
                        >
                          Mark actioned
                        </button>
                      )}
                      {ev.actioned && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-disabled)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✓ Actioned
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ justifyContent: "space-between" }}>
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
  );
}
