import { useEffect, useState } from "react";
import { agents as agentsApi } from "../lib/api";
import { useToast } from "../components/Toast";
import { Sk } from "../components/Skeleton";
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
    <div className="agents-page animate-fade-in">

      <div className="agents-header">
        <div>
          <div className="agents-title">AI Agents</div>
          <div className="agents-subtitle">
            {loading ? "Loading…" : `${agents.length} agent${agents.length !== 1 ? "s" : ""} · ${active} active`}
          </div>
        </div>
        <button className="agents-btn-new" onClick={() => setCreateOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Agent
        </button>
      </div>

      {loading ? (
        <div className="agents-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="agent-card" style={{ opacity: 1 - i * 0.2 }}>
              <div className="agent-card-header">
                <Sk w={90} h={22} r={999} />
                <Sk w={40} h={22} r={4} />
              </div>
              <Sk w="60%" h={20} r={6} style={{ marginBottom: 8 }} />
              <Sk w="100%" h={13} r={4} style={{ marginBottom: 4 }} />
              <Sk w="80%" h={13} r={4} style={{ marginBottom: 16 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => {
            const hasPersona = agent.persona && Object.values(agent.persona).some((v) => v?.trim?.());
            const hasSignals = (agent.keywords || []).length > 0 || (agent.signalTypes || []).length > 0;
            const isActive = agent.status === "active";
            return (
              <div key={agent.id} className="agent-card" onClick={() => setEditingAgent(agent)}>
                <div className="agent-card-header">
                  <span className="agent-card-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
                    AI Agent
                  </span>
                  <div className="agent-card-actions">
                    <label className="agent-toggle" onClick={(e) => handleToggle(e, agent)}>
                      <input type="checkbox" readOnly checked={isActive} />
                      <span className="agent-toggle-track" />
                    </label>
                    <button
                      className="agent-edit-btn"
                      title="Edit agent"
                      onClick={(e) => { e.stopPropagation(); setEditingAgent(agent); }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                </div>

                <div className="agent-name">{agent.name}</div>

                <div className="agent-chips">
                  <span className={`agent-chip ${hasPersona ? "set" : "unset"}`}>
                    {hasPersona ? "✓ Persona set" : "No persona"}
                  </span>
                  <span className={`agent-chip ${hasSignals ? "set" : "unset"}`}>
                    {hasSignals ? "✓ Signals set" : "No signals"}
                  </span>
                </div>

                {(agent.signalsDetected > 0 || agent.leadsFound > 0) && (
                  <div className="agent-stats">
                    <span>{agent.signalsDetected || 0} signals</span>
                    <span>{agent.leadsFound || 0} leads found</span>
                  </div>
                )}

                <div className="agent-card-footer">
                  <span className="agent-date">
                    {agent.createdAt
                      ? new Date(agent.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </span>
                  <span className={`agent-status-badge ${isActive ? "active" : "paused"}`}>
                    <span className="agent-status-dot" />
                    {isActive ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="agent-card agent-card-create" onClick={() => setCreateOpen(true)}>
            <div className="agent-create-plus">+</div>
            <div className="agent-create-label">Create New Agent</div>
            <div className="agent-create-desc">AI persona + intent signals</div>
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
    <div className={`agent-section-label${noBorder ? " agent-section-label-first" : ""}`}>
      <div className="agent-section-icon">{icon}</div>
      <span className="agent-section-title">{title}</span>
    </div>
  );
}

// ── Create Agent modal (2-step wizard) ────────────────────────
function CreateAgentModal({ onClose, onCreated, toast }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [yourRole, setYourRole] = useState("");
  const [serviceOffer, setServiceOffer] = useState("");
  const [targetingBrief, setTargetingBrief] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const agent = await agentsApi.create({ name: name.trim() });
      const result = await agentsApi.generatePersona(agent.id, {
        yourRole,
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
    <div className="modal-overlay" onClick={(e) => !loading && e.target === e.currentTarget && onClose()}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: 540 }}>

        {loading ? (
          /* ── Loading ── */
          <div className="modal-icon-header" style={{ paddingBottom: 36 }}>
            <div className="modal-icon-wrap modal-icon-pulse">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/>
                <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
              </svg>
            </div>
            <div className="modal-heading">Building your agent…</div>
            <div className="modal-subtext">AI is generating the persona, objection handling, example conversation, and messaging rules.</div>
            <div className="modal-dots"><span /><span /><span /></div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/>
                    <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>New AI Agent</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div className="modal-step-dots">
                      {[1, 2].map((s) => (
                        <div key={s} className={`modal-step-dot ${s === step ? "active" : s < step ? "done" : "todo"}`} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11.5, color: "#9ca3af" }}>Step {step} of 2</span>
                  </div>
                </div>
              </div>
              <button className="modal-close-x" onClick={onClose} style={{ marginTop: 2 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ height: 1, background: "#f3f4f6", margin: "16px 0 0" }} />

            {step === 1 ? (
              <>
                <div className="modal-form">
                  <div className="modal-subtext" style={{ margin: 0, textAlign: "left" }}>
                    On the next step the AI will generate the full persona — objection scripts, an example conversation, and messaging rules.
                  </div>
                  <div>
                    <label className="modal-field-label">Agent name</label>
                    <input
                      className="modal-input"
                      placeholder="e.g. EMEA Outbound Agent"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(2)}
                    />
                  </div>
                </div>
                <div className="modal-footer-bar">
                  <button className="modal-btn-ghost" onClick={onClose}>Cancel</button>
                  <button className="modal-btn-primary" disabled={!name.trim()} onClick={() => setStep(2)}>
                    Continue →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-form">
                  <div>
                    <label className="modal-field-label">Your role</label>
                    <input className="modal-input" placeholder="e.g. Head of Sales, Founder, Account Executive" value={yourRole} onChange={(e) => setYourRole(e.target.value)} autoFocus />
                  </div>
                  <div>
                    <label className="modal-field-label">Service or product you're offering</label>
                    <textarea className="modal-textarea" rows={2} placeholder="e.g. LinkedIn outreach automation for B2B SaaS companies" value={serviceOffer} onChange={(e) => setServiceOffer(e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-field-label">Ideal customer</label>
                    <textarea className="modal-textarea" rows={2} placeholder="e.g. Heads of Sales at Series A–C SaaS companies in the UK with 20–200 employees" value={targetingBrief} onChange={(e) => setTargetingBrief(e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-field-label" style={{ marginBottom: 8, display: "block" }}>Tone</label>
                    <div className="agent-tone-row">
                      {TONE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`agent-tone-pill${tone === opt.value ? " active" : ""}`}
                          onClick={() => setTone(opt.value)}
                        >
                          <div style={{ fontWeight: 600 }}>{opt.label}</div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="modal-footer-bar">
                  <button className="modal-btn-ghost" onClick={() => setStep(1)}>← Back</button>
                  <button className="modal-btn-primary" disabled={!serviceOffer.trim() && !targetingBrief.trim()} onClick={handleCreate}>
                    Generate & Create →
                  </button>
                </div>
              </>
            )}
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
  const [yourRole, setYourRole] = useState("");
  const [serviceOffer, setServiceOffer] = useState("");
  const [targetingBrief, setTargetingBrief] = useState("");
  const [genTone, setGenTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [refinementNote, setRefinementNote] = useState("");

  const hasPersona = Object.values(agent.persona || {}).some((v) => v?.trim?.());
  const [genOpen, setGenOpen] = useState(!hasPersona);

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
        yourRole,
        serviceOffer,
        targetingBrief,
        tone: genTone,
        refinementNote: refinementNote.trim() || undefined,
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
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="agent-card-badge" style={{ flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
              AI Agent
            </span>
            <input
              className="input"
              style={{ fontWeight: 700, fontSize: 15, border: "none", padding: "4px 0", background: "transparent", width: 280 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: "20px 24px",
          }}
        >
          {/* ══ AI PERSONA ══ */}
          <SectionHeader
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>}
            title="AI Persona"
            noBorder
          />

          {/* Collapsible Generate with AI */}
          <div className="agent-gen-panel">
            <button className="agent-gen-toggle" onClick={() => setGenOpen((o) => !o)}>
              <span>Generate Persona with AI</span>
              <span className="agent-gen-toggle-meta">— fills all fields automatically</span>
              <svg className={`agent-gen-chevron${genOpen ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            {genOpen && (
              <div className="agent-gen-body">
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Your Role</label>
                  <input className="input" placeholder="e.g. Head of Sales, Founder, Account Executive" value={yourRole} onChange={(e) => setYourRole(e.target.value)} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Service / Offer</label>
                  <input className="input" placeholder="e.g. LinkedIn outreach automation for UK accountants" value={serviceOffer} onChange={(e) => setServiceOffer(e.target.value)} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Target Audience</label>
                  <input className="input" placeholder="e.g. Managing Directors at UK accounting firms with 5–50 staff" value={targetingBrief} onChange={(e) => setTargetingBrief(e.target.value)} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Tone</label>
                  <div className="agent-tone-row">
                    {TONE_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" className={`agent-tone-pill${genTone === opt.value ? " active" : ""}`} onClick={() => setGenTone(opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {hasPersona && (
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">
                      Refinement Feedback <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                    </label>
                    <input className="input" placeholder="e.g. Make objection handling more concise, focus more on SaaS companies" value={refinementNote} onChange={(e) => setRefinementNote(e.target.value)} />
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} disabled={generating} onClick={handleGeneratePersona}>
                  {generating ? "Generating…" : hasPersona && refinementNote.trim() ? "Refine Persona" : "Generate Persona"}
                </button>
              </div>
            )}
          </div>

          {/* Persona fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PERSONA_FIELDS.map((f) => (
              <div key={f.key} className="input-group" style={{ margin: 0 }}>
                <label className="input-label" style={{ display: "flex", alignItems: "center" }}>
                  {f.label}
                  {f.aiGenerated && (
                    <span className="agent-ai-tag">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
                      AI generated
                    </span>
                  )}
                </label>
                <textarea className="input" rows={f.rows} placeholder={f.placeholder} value={persona[f.key] || ""} onChange={(e) => setPersona((p) => ({ ...p, [f.key]: e.target.value }))} style={{ resize: "vertical" }} />
              </div>
            ))}
          </div>

          {/* ══ INTENT SIGNALS ══ */}
          <SectionHeader
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
            title="Intent Signals"
          />

          {/* Stats */}
          <div className="agent-stat-mini-grid">
            {[
              { label: "Signals Detected", value: agent.signalsDetected || 0 },
              { label: "Leads Found", value: agent.leadsFound || 0 },
            ].map((s) => (
              <div key={s.label} className="agent-stat-mini">
                <div className="agent-stat-mini-value">{s.value}</div>
                <div className="agent-stat-mini-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Keywords */}
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">Keywords to Monitor</label>
            <input className="input" placeholder="e.g. outreach automation, sales tool, CRM replacement (comma-separated)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, marginBottom: 0 }}>
              Comma-separated. The agent will surface leads who post or engage with these topics.
            </p>
          </div>

          {/* Signal Types */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "#374151" }}>Signal Types</div>
            <div className="agent-signal-chips">
              {SIGNAL_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`agent-signal-chip${signalTypes.includes(opt.value) ? " active" : ""}`}
                  onClick={() => toggleSignalType(opt.value)}
                >
                  {signalTypes.includes(opt.value) ? "✓ " : ""}{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ICP Filters */}
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">ICP Filters</label>
            <textarea className="input" rows={3} placeholder="e.g. Only surface leads at companies with 10–200 employees in the UK, in SaaS or fintech…" value={icpFilters} onChange={(e) => setIcpFilters(e.target.value)} style={{ resize: "vertical" }} />
          </div>

          {/* Signal Events */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#374151" }}>Recent Signal Events</div>
            {eventsLoading ? (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading events…</div>
            ) : signalEvents.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0", textAlign: "center" }}>
                No signal events yet. Once the agent detects buying signals, they'll appear here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {signalEvents.map((ev) => (
                  <div key={ev.id} className={`agent-event-row${ev.actioned ? " actioned" : ""}`}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{ev.leadName}</span>
                        {ev.company && <span style={{ fontSize: 12, color: "#9ca3af" }}>· {ev.company}</span>}
                        <span className="agent-event-type-badge">{SIGNAL_TYPE_LABELS[ev.type] || ev.type}</span>
                        {ev.intentScore > 0 && (
                          <span className={`agent-event-intent${ev.intentScore < 70 ? " low" : ""}`}>
                            {ev.intentScore}% intent
                          </span>
                        )}
                      </div>
                      {ev.signal && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>{ev.signal}</div>}
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        {new Date(ev.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {!ev.actioned ? (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleActionEvent(ev.id)} style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                        Mark actioned
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>✓ Actioned</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-ghost btn-sm" style={{ color: "#ef4444" }} disabled={deleting} onClick={handleDelete}>
            {deleting ? "Deleting…" : "Delete Agent"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save Agent →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
