import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { campaigns as campaignsApi } from '../lib/api'
import './Campaigns.css'

export default function Campaigns() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    campaignsApi.list()
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const campaign = await campaignsApi.create({ name: name.trim() })
      setCreateOpen(false)
      setName('')
      navigate(`/campaigns/${campaign.id}`)
    } catch {
      setCreating(false)
    }
  }

  async function handleToggle(e, campaign) {
    e.stopPropagation()
    const next = campaign.status === 'active' ? 'paused' : 'active'
    setList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: next } : c))
    await campaignsApi.update(campaign.id, { status: next }).catch(() => {
      setList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: campaign.status } : c))
    })
  }

  const active = list.filter(c => c.status === 'active').length
  const totalSent = list.reduce((s, c) => s + (c.analytics?.sent || 0), 0)
  const totalAccepted = list.reduce((s, c) => s + (c.analytics?.accepted || 0), 0)
  const totalReplied = list.reduce((s, c) => s + (c.analytics?.replied || 0), 0)
  const acceptRate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0
  const replyRate = totalAccepted > 0 ? Math.round((totalReplied / totalAccepted) * 100) : 0

  return (
    <div className="page campaigns-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">{list.length} campaigns · {active} active</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Create Campaign
        </button>
      </div>

      <div className="campaigns-stats">
        <div className="cstat">
          <div className="stat-value">{acceptRate}%</div>
          <div className="stat-label">Overall Acceptance Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">{replyRate}%</div>
          <div className="stat-label">Overall Reply Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">{totalSent}</div>
          <div className="stat-label">Connections Sent</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">{totalReplied}</div>
          <div className="stat-label">Replies Received</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Loading campaigns…</div>
      ) : list.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No campaigns yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first campaign to start LinkedIn outreach.</div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Create Campaign</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Campaign</th>
                <th>AI Assistant</th>
                <th>Sent</th>
                <th>Acceptance</th>
                <th>Reply Rate</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const acc = c.analytics?.sent > 0 ? Math.round((c.analytics.accepted / c.analytics.sent) * 100) : 0
                const rep = c.analytics?.accepted > 0 ? Math.round((c.analytics.replied / c.analytics.accepted) * 100) : 0
                return (
                  <tr key={c.id} className="campaign-row" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <label className="toggle" onClick={e => handleToggle(e, c)}>
                        <input type="checkbox" readOnly checked={c.status === 'active'} />
                        <span className="toggle-track" />
                      </label>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {c.status === 'paused' && (
                        <span className="badge badge-muted" style={{ fontSize: 10, marginTop: 2 }}>paused</span>
                      )}
                    </td>
                    <td>
                      {c.settings?.agentName
                        ? <span className="chip">◆ {c.settings.agentName}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No agent</span>
                      }
                    </td>
                    <td className="mono">{c.analytics?.sent || 0}</td>
                    <td>
                      <span className="mono" style={{ color: acc > 30 ? 'var(--success)' : 'var(--text-primary)' }}>
                        {acc}%
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: rep > 15 ? 'var(--success)' : 'var(--text-primary)' }}>
                        {rep}%
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setName('') }} title="New Campaign">
        <div className="input-group">
          <label className="input-label">Campaign Name</label>
          <input
            className="input"
            placeholder="e.g. UK Accountants — MTD 2026"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && name.trim() && handleCreate()}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || creating} onClick={handleCreate}>
            {creating ? 'Creating…' : 'Create Campaign →'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
