import { useState } from 'react'
import './Agents.css'

const MOCK_AGENTS = [
  {
    id: '1', type: 'signal', name: 'UK Accountants — MTD Signal',
    status: 'active', metric: 47, metricLabel: 'leads found', created: '5 Mar 2026',
  },
  {
    id: '2', type: 'assistant', name: 'Creative Deer SDR',
    status: 'active', metric: 28, metricLabel: 'conversations', created: '1 Mar 2026',
  },
  {
    id: '3', type: 'assistant', name: 'Web Design SDR',
    status: 'active', metric: 14, metricLabel: 'conversations', created: '8 Mar 2026',
  },
  {
    id: '4', type: 'signal', name: 'SaaS Founders — Job Change',
    status: 'paused', metric: 12, metricLabel: 'leads found', created: '20 Feb 2026',
  },
]

const TYPE_META = {
  signal:    { label: 'Signal Agent',  icon: '◎', badge: 'badge-info' },
  assistant: { label: 'AI Assistant',  icon: '◆', badge: 'badge-signal' },
}

export default function Agents() {
  const [showTypeSelect, setShowTypeSelect] = useState(false)

  if (showTypeSelect) {
    return <AgentTypeSelect onBack={() => setShowTypeSelect(false)} />
  }

  return (
    <div className="page agents-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Agents</h1>
          <p className="page-subtitle">{MOCK_AGENTS.length} agents — {MOCK_AGENTS.filter(a => a.status === 'active').length} active</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowTypeSelect(true)}>
          + Create Agent
        </button>
      </div>

      <div className="agents-grid">
        {MOCK_AGENTS.map(agent => {
          const meta = TYPE_META[agent.type]
          return (
            <div key={agent.id} className="agent-card card">
              <div className="agent-card-header">
                <span className={`badge ${meta.badge}`}>{meta.icon} {meta.label}</span>
                <div className="agent-card-actions">
                  <label className="toggle">
                    <input type="checkbox" defaultChecked={agent.status === 'active'} />
                    <span className="toggle-track" />
                  </label>
                  <button className="btn btn-icon btn-ghost" title="Edit agent">✎</button>
                </div>
              </div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-metric">
                <span className="mono" style={{ fontSize: 28, fontWeight: 500 }}>{agent.metric}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{agent.metricLabel}</span>
              </div>
              <div className="agent-card-footer">
                <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>Created {agent.created}</span>
                <span className={`badge ${agent.status === 'active' ? 'badge-signal' : 'badge-muted'}`}>
                  {agent.status}
                </span>
              </div>
            </div>
          )
        })}

        {/* Empty create card */}
        <div className="agent-card agent-card-create card" onClick={() => setShowTypeSelect(true)}>
          <div className="create-plus">+</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Create New Agent</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Signal Agent or AI Assistant
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentTypeSelect({ onBack }) {
  return (
    <div className="page type-select-page animate-fade-in">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 32 }}>
        ← Back
      </button>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>What type of agent do you need?</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 40 }}>
          Choose the right agent for your goal — you can create as many as you need.
        </p>
        <div className="type-cards">
          <div className="type-card card" onClick={() => alert('Signal Agent wizard — Phase 2')}>
            <div className="type-card-icon">◎</div>
            <div className="type-card-title">Intent Signal Agent</div>
            <div className="type-card-subtitle">Lead Discovery</div>
            <p className="type-card-desc">
              Monitors LinkedIn 24/7 for buying signals — job changes, keyword posts,
              competitor follows. Surfaces warm leads that match your ICP.
            </p>
            <div className="type-card-tags">
              <span className="chip">Finds Leads</span>
              <span className="chip">Intent Signals</span>
              <span className="chip">ICP Scoring</span>
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }}>
              Create Signal Agent →
            </button>
          </div>

          <div className="type-card card type-card-featured" onClick={() => alert('AI Assistant wizard — Phase 2')}>
            <div className="type-card-icon" style={{ color: 'var(--signal)' }}>◆</div>
            <div className="type-card-title">AI Assistant</div>
            <div className="type-card-subtitle">Sales & BD</div>
            <p className="type-card-desc">
              Handles LinkedIn conversations autonomously from the first reply
              all the way through to booking a meeting — without you lifting a finger.
            </p>
            <div className="type-card-tags">
              <span className="chip">Books Meetings</span>
              <span className="chip">24/7 Replies</span>
              <span className="chip">Fully Autonomous</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
              Create AI Assistant →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
