import { useState } from 'react'
import Modal from '../components/Modal'
import './Campaigns.css'

const MOCK_CAMPAIGNS = [
  {
    id: '1', name: 'UK Accountants — MTD 2026', status: 'active',
    assistant: 'Creative Deer SDR', leads: { sent: 84, total: 120 },
    acceptance: 33, reply: 14, created: '10 Mar 2026', lastAction: '2 min ago',
  },
  {
    id: '2', name: 'SaaS Founders — Web Design', status: 'active',
    assistant: 'Web Design SDR', leads: { sent: 56, total: 80 },
    acceptance: 34, reply: 18, created: '8 Mar 2026', lastAction: '18 min ago',
  },
  {
    id: '3', name: 'Property Firms Q1', status: 'paused',
    assistant: 'Creative Deer SDR', leads: { sent: 120, total: 120 },
    acceptance: 34, reply: 14, created: '1 Feb 2026', lastAction: '2 days ago',
  },
]

export default function Campaigns() {
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')

  return (
    <div className="page campaigns-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">{MOCK_CAMPAIGNS.length} campaigns · 2 active</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Create Campaign
        </button>
      </div>

      {/* Stats bar */}
      <div className="campaigns-stats">
        <div className="cstat">
          <div className="stat-value">34%</div>
          <div className="stat-label">Overall Acceptance Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">15%</div>
          <div className="stat-label">Overall Reply Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">260</div>
          <div className="stat-label">Connections Sent</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">7</div>
          <div className="stat-label">Meetings Booked</div>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Campaign</th>
              <th>AI Assistant</th>
              <th>Leads</th>
              <th>Acceptance</th>
              <th>Reply Rate</th>
              <th>Created</th>
              <th>Last Action</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_CAMPAIGNS.map(c => (
              <tr key={c.id} className="campaign-row" onClick={() => window.location.href=`/campaigns/${c.id}`}>
                <td onClick={e => e.stopPropagation()}>
                  <label className="toggle">
                    <input type="checkbox" defaultChecked={c.status === 'active'} />
                    <span className="toggle-track" />
                  </label>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                </td>
                <td>
                  <span className="chip">{c.assistant}</span>
                </td>
                <td className="mono">
                  {c.leads.sent}/{c.leads.total}
                </td>
                <td>
                  <span className="mono" style={{ color: c.acceptance > 30 ? 'var(--success)' : 'var(--text-primary)' }}>
                    {c.acceptance}%
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ color: c.reply > 15 ? 'var(--success)' : 'var(--text-primary)' }}>
                    {c.reply}%
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.created}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.lastAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setName('') }} title="New Campaign">
        <div className="input-group">
          <label className="input-label">Campaign Name</label>
          <input
            className="input"
            placeholder="e.g. UK Accountants — MTD 2026"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && name && alert(`Creating: ${name}`)}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => alert(`Creating campaign: ${name}`)}
          >
            Create Campaign →
          </button>
        </div>
      </Modal>
    </div>
  )
}
