import { useState } from 'react'
import './CampaignDetail.css'

const CAMPAIGN = {
  id: '1',
  name: 'UK Accountants — MTD 2026',
  status: 'active',
  assistant: 'Creative Deer SDR',
  account: 'Asdren Zhubi',
}

const LEADS = [
  { name: 'James McKenzie',  title: 'Managing Partner', company: 'McKenzie & Co',   status: 'Accepted', replied: true },
  { name: 'Sarah Patel',     title: 'Senior Partner',   company: 'SP Financial',    status: 'Accepted', replied: false },
  { name: 'Oliver Thornton', title: 'Founding Partner', company: 'Thornton Adv.',   status: 'Pending',  replied: false },
  { name: 'Rachel Ahmed',    title: 'Finance Director', company: 'Ahmed Finance',   status: 'Accepted', replied: true },
  { name: 'Tom Whitfield',   title: 'Managing Director', company: 'Whitfield CPA', status: 'Rejected', replied: false },
]

const IMPORT_SOURCES = [
  { id: 'signal',   icon: '◎', label: 'Signal Agent Leads',   desc: 'Pull warm leads from your Intent Signal Agents' },
  { id: 'finder',  icon: '◈', label: 'Lead Finder',            desc: 'Search Apollo\'s 300M+ contact database' },
  { id: 'csv',     icon: '⬆', label: 'Import from CSV',        desc: 'Upload a CSV of LinkedIn profile URLs' },
  { id: 'url',     icon: '🔗', label: 'LinkedIn Search URL',   desc: 'Paste a LinkedIn search results URL' },
  { id: 'event',   icon: '◆', label: 'LinkedIn Event',         desc: 'Import attendees from a LinkedIn event' },
  { id: 'post',    icon: '◇', label: 'LinkedIn Post',          desc: 'Import people who liked or commented' },
  { id: 'group',   icon: '◉', label: 'LinkedIn Group',         desc: 'Import members from a LinkedIn group' },
  { id: 'list',    icon: '☰', label: 'Add from my list',       desc: 'Choose from your saved lead lists' },
]

const SEQUENCE_NODES = [
  { type: 'action', label: 'Visit LinkedIn profile',           icon: '◎', status: 'ok' },
  { type: 'action', label: 'Like last user LinkedIn post',     icon: '◇', status: 'ok' },
  { type: 'action', label: 'Wait 1 day',                       icon: '⏰', status: 'ok' },
  { type: 'action', label: 'Send LinkedIn connection request', icon: '◈', status: 'ok', hasMessage: true },
  { type: 'action', label: 'Wait 2 days',                      icon: '⏰', status: 'ok' },
  { type: 'action', label: 'Send LinkedIn message',            icon: '✉', status: 'ok', hasMessage: true },
  { type: 'action', label: 'Wait 3 days',                      icon: '⏰', status: 'ok' },
  { type: 'action', label: 'Send LinkedIn message',            icon: '✉', status: 'missing', hasMessage: false },
]

const STATUS_COLORS = { Accepted: 'badge-signal', Pending: 'badge-muted', Rejected: 'badge-danger' }

export default function CampaignDetail() {
  const [tab, setTab] = useState('leads')
  const [showImport, setShowImport] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)

  return (
    <div className="campaign-detail animate-fade-in">
      {/* Top bar */}
      <div className="detail-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/campaigns" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Campaigns</a>
          <span style={{ color: 'var(--border-2)' }}>/</span>
          <h1 style={{ fontSize: 16, fontWeight: 700 }}>{CAMPAIGN.name}</h1>
          <span className="badge badge-signal">active</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="chip">◆ {CAMPAIGN.assistant}</span>
          <span className="chip">◎ {CAMPAIGN.account}</span>
          <button className="btn btn-secondary btn-sm">⏸ Pause</button>
          <button className="btn btn-primary btn-sm">▶ Run it!</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        {['leads','builder','analytics','settings'].map(t => (
          <button key={t} className={`detail-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="detail-content">
        {tab === 'leads' && (
          <LeadsTab leads={LEADS} onImport={() => setShowImport(true)} showImport={showImport} onCloseImport={() => setShowImport(false)} />
        )}
        {tab === 'builder' && (
          <BuilderTab nodes={SEQUENCE_NODES} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
        )}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}

/* ── Leads Tab ─────────────────────────────────────────────── */
function LeadsTab({ leads, onImport, showImport, onCloseImport }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{leads.length} leads in campaign</span>
        <button className="btn btn-primary btn-sm" onClick={onImport}>+ Import Contacts</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Company</th>
              <th>Status</th>
              <th>Replied</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.name}>
                <td style={{ fontWeight: 600 }}>{l.name}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{l.title}</td>
                <td>{l.company}</td>
                <td><span className={`badge ${STATUS_COLORS[l.status]}`}>{l.status}</span></td>
                <td>{l.replied ? <span className="badge badge-signal">Yes</span> : <span className="badge badge-muted">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import modal */}
      {showImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCloseImport()}>
          <div className="modal-box animate-fade-in" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2 className="modal-title">Import Contacts</h2>
              <button className="btn btn-icon btn-ghost" onClick={onCloseImport}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                Choose a source to import leads into this campaign.
              </p>
              <div className="import-sources-grid">
                {IMPORT_SOURCES.map(s => (
                  <div key={s.id} className="import-source-card" onClick={() => alert(`${s.label} — Phase 4`)}>
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
  )
}

/* ── Builder Tab ───────────────────────────────────────────── */
function BuilderTab({ nodes, selectedNode, onSelectNode }) {
  return (
    <div className="builder-wrap">
      <div className="builder-canvas" onClick={() => onSelectNode(null)}>
        {/* Entry node */}
        <div className="builder-entry-node">
          <span>▶</span> Start the campaign
        </div>
        <div className="builder-connector" />

        {nodes.map((node, i) => (
          <div key={i}>
            <div
              className={`builder-node ${node.status === 'missing' ? 'missing' : ''} ${selectedNode === i ? 'selected' : ''}`}
              onClick={e => { e.stopPropagation(); onSelectNode(i) }}
            >
              <div className="node-icon">{node.icon}</div>
              <div className="node-content">
                <div className="node-label">{node.label}</div>
                {node.status === 'missing' && <div className="node-error">Action required</div>}
                {node.hasMessage && <div className="node-preview">Message configured ✓</div>}
              </div>
              <button className="btn btn-icon btn-ghost node-edit-btn" style={{ fontSize: 12 }}>✎</button>
            </div>
            {i < nodes.length - 1 && (
              <div className="builder-connector-wrap">
                <div className="builder-connector" />
                <button className="add-node-btn" onClick={e => { e.stopPropagation(); alert('Add step — Phase 4') }}>+</button>
                <div className="builder-connector" />
              </div>
            )}
          </div>
        ))}

        <div className="builder-connector-wrap">
          <div className="builder-connector" />
          <button className="add-node-btn" onClick={() => alert('Add step — Phase 4')}>+</button>
        </div>
      </div>

      {/* Right config panel */}
      {selectedNode !== null && (
        <div className="node-config-panel animate-slide-in">
          <div className="node-config-header">
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Configure Step</h3>
            <button className="btn btn-icon btn-ghost" onClick={() => onSelectNode(null)}>✕</button>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">Sender Account</label>
              <select className="input"><option>Asdren Zhubi — Creative Deer</option></select>
            </div>
            <div className="input-group">
              <label className="input-label">Message</label>
              <textarea className="input" rows={6} placeholder="Write your message..." />
            </div>
            <div className="message-toolbar">
              <button className="btn btn-secondary btn-sm">◆ AI Prompt</button>
              <button className="btn btn-secondary btn-sm">{'{}'} Variables</button>
              <button className="btn btn-secondary btn-sm">◎ Preview</button>
            </div>
            <div className="input-group">
              <label className="input-label">Send Condition</label>
              <select className="input">
                <option>Always send</option>
                <option>Send only if recipient has never sent a message</option>
                <option>Send only if conversation has no message at all</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => onSelectNode(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }}>Save Step</button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="btn btn-ghost btn-sm">+</button>
        <button className="btn btn-ghost btn-sm">−</button>
        <button className="btn btn-ghost btn-sm">⤢</button>
      </div>
    </div>
  )
}

/* ── Analytics Tab ─────────────────────────────────────────── */
function AnalyticsTab() {
  const [range, setRange] = useState('7d')
  const [metric, setMetric] = useState('sent')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="analytics-stats">
        <div className="cstat"><div className="stat-value">33%</div><div className="stat-label">Acceptance Rate</div></div>
        <div className="cstat-divider" />
        <div className="cstat"><div className="stat-value">14%</div><div className="stat-label">Reply Rate</div></div>
        <div className="cstat-divider" />
        <div className="cstat"><div className="stat-value mono">84</div><div className="stat-label">Requests Sent</div></div>
        <div className="cstat-divider" />
        <div className="cstat"><div className="stat-value mono">28</div><div className="stat-label">Accepted</div></div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['sent','accepted','responses'].map(m => (
              <button key={m} className={`filter-tab ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['7d','14d','30d','All'].map(r => (
              <button key={r} className={`filter-tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-placeholder">
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            📈 Chart renders here — Phase 6 will add Recharts
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            {[14,22,18,31,25,19,28].map((v, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 24, height: v * 2, background: 'var(--signal-subtle)', borderRadius: 4, border: '1px solid rgba(57,255,135,0.2)' }} />
                <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>D{i+1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Settings Tab ──────────────────────────────────────────── */
function SettingsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Campaign Settings</h3>
        <div className="input-group">
          <label className="input-label">LinkedIn Account</label>
          <select className="input"><option>Asdren Zhubi — Creative Deer</option></select>
        </div>
        <div className="input-group">
          <label className="input-label">AI Assistant</label>
          <select className="input">
            <option>Creative Deer SDR</option>
            <option>Web Design SDR</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Daily Connection Requests</label>
          <input className="input" type="number" defaultValue={20} min={1} max={50} />
        </div>
        <div className="input-group">
          <label className="input-label">Daily Message Limit</label>
          <input className="input" type="number" defaultValue={30} min={1} max={100} />
        </div>
        <div className="input-group">
          <label className="input-label">Timezone</label>
          <select className="input"><option>Europe/London (UTC+0)</option></select>
        </div>
        <div className="input-group">
          <label className="input-label">Active Hours</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" type="time" defaultValue="09:00" style={{ width: 120 }} />
            <span style={{ color: 'var(--text-muted)' }}>to</span>
            <input className="input" type="time" defaultValue="18:00" style={{ width: 120 }} />
          </div>
        </div>
        <button className="btn btn-primary">Save Settings</button>
      </div>
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--danger)' }}>Danger Zone</h3>
        <button className="btn btn-danger">Delete Campaign</button>
      </div>
    </div>
  )
}
