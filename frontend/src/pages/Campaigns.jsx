import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../components/Modal.css'
import { campaigns as campaignsApi } from '../lib/api'
import { Sk, SkeletonTableRows } from '../components/Skeleton'
import './Campaigns.css'

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function relDate(dateStr) {
  if (!dateStr) return '—'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function IconAgent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="10" r="3"/>
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
    </svg>
  )
}

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

  useEffect(() => {
    if (!createOpen) return
    const handler = e => { if (e.key === 'Escape' && !creating) { setCreateOpen(false); setName('') } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createOpen, creating])

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    try {
      const campaign = await campaignsApi.create({ name: name.trim() })
      setCreateOpen(false)
      setName('')
      navigate(`/campaigns/${campaign.id}?setup=true`)
    } catch {
      setCreating(false)
    }
  }

  async function handleToggle(e, campaign) {
    e.stopPropagation()
    e.preventDefault()
    const next = campaign.status === 'active' ? 'paused' : 'active'
    setList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: next } : c))
    await campaignsApi.update(campaign.id, { status: next }).catch(() => {
      setList(prev => prev.map(c => c.id === campaign.id ? { ...c, status: campaign.status } : c))
    })
  }

  const [search, setSearch] = useState('')

  const active = list.filter(c => c.status === 'active').length
  const totalSent = list.reduce((s, c) => s + (c.analytics?.sent || 0), 0)
  const totalAccepted = list.reduce((s, c) => s + (c.analytics?.accepted || 0), 0)
  const totalReplied = list.reduce((s, c) => s + (c.analytics?.replied || 0), 0)
  const acceptRate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0
  const replyRate = totalAccepted > 0 ? Math.round((totalReplied / totalAccepted) * 100) : 0

  const filteredList = search
    ? list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : list

  return (
    <div className="campaigns-page animate-fade-in">

      {/* Header */}
      <div className="camp-header">
        <div>
          <div className="camp-title">Campaigns</div>
          <div className="camp-subtitle">
            {loading ? 'Loading…' : `${list.length} campaign${list.length !== 1 ? 's' : ''} · ${active} active`}
          </div>
        </div>
        <button className="camp-btn-new" onClick={() => setCreateOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="camp-stats">
        <div className="camp-stat">
          <div className="camp-stat-icon indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          {loading ? <Sk w="56px" h={28} r={6} style={{ marginBottom: 4 }} /> : (
            <div className={`camp-stat-value${acceptRate > 30 ? ' good' : ''}`}>{acceptRate}%</div>
          )}
          <div className="camp-stat-label">Acceptance Rate</div>
          <div className="camp-stat-context">{totalSent > 0 ? `from ${totalSent} invites` : 'no invites sent yet'}</div>
        </div>

        <div className="camp-stat">
          <div className="camp-stat-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          {loading ? <Sk w="56px" h={28} r={6} style={{ marginBottom: 4 }} /> : (
            <div className={`camp-stat-value${replyRate > 15 ? ' good' : ''}`}>{replyRate}%</div>
          )}
          <div className="camp-stat-label">Reply Rate</div>
          <div className="camp-stat-context">{totalAccepted > 0 ? `from ${totalAccepted} connected` : 'no connections yet'}</div>
        </div>

        <div className="camp-stat">
          <div className="camp-stat-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </div>
          {loading ? <Sk w="56px" h={28} r={6} style={{ marginBottom: 4 }} /> : (
            <div className="camp-stat-value">{totalSent}</div>
          )}
          <div className="camp-stat-label">Invites Sent</div>
          <div className="camp-stat-context">{totalAccepted > 0 ? `${totalAccepted} accepted` : 'across all campaigns'}</div>
        </div>

        <div className="camp-stat">
          <div className="camp-stat-icon amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          {loading ? <Sk w="56px" h={28} r={6} style={{ marginBottom: 4 }} /> : (
            <div className="camp-stat-value">{totalReplied}</div>
          )}
          <div className="camp-stat-label">Replies</div>
          <div className="camp-stat-context">{active > 0 ? `${active} campaign${active !== 1 ? 's' : ''} active` : 'no active campaigns'}</div>
        </div>
      </div>

      {/* Table card */}
      <div className="camp-table-card">
        <div className="camp-table-header">
          <div className="camp-table-title-row">
            <div className="camp-table-title">All Campaigns</div>
            {!loading && list.length > 0 && (
              <span className="camp-count-badge">{list.length}</span>
            )}
          </div>
          {!loading && list.length > 0 && (
            <div className="camp-search-wrap">
              <span className="camp-search-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input
                className="camp-search-input"
                placeholder="Search campaigns…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        {loading ? (
          <table className="camp-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}></th>
                <th>Campaign</th>
                <th>AI Agent</th>
                <th>Acceptance</th>
                <th>Reply Rate</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody><SkeletonTableRows rows={5} cols={7} /></tbody>
          </table>
        ) : list.length === 0 ? (
          <div className="camp-empty">
            <div className="camp-empty-icon"><IconZap /></div>
            <div className="camp-empty-title">No campaigns yet</div>
            <div className="camp-empty-desc">Create your first campaign to start LinkedIn outreach and track results.</div>
            <button className="camp-empty-btn" onClick={() => setCreateOpen(true)}>New Campaign</button>
          </div>
        ) : (
          <>
            <table className="camp-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}></th>
                  <th>Campaign</th>
                  <th>AI Agent</th>
                  <th>Acceptance</th>
                  <th>Reply Rate</th>
                  <th>Created</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map(c => {
                  const sent = c.analytics?.sent || 0
                  const accepted = c.analytics?.accepted || 0
                  const replied = c.analytics?.replied || 0
                  const acc = sent > 0 ? Math.round((accepted / sent) * 100) : 0
                  const rep = accepted > 0 ? Math.round((replied / accepted) * 100) : 0
                  const isActive = c.status === 'active'
                  const leadCount = c.analytics?.total || c.leadCount || null
                  return (
                    <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>

                      <td onClick={e => e.stopPropagation()}>
                        <div className="camp-toggle-cell">
                          <label className="camp-toggle" onClick={e => handleToggle(e, c)}>
                            <input type="checkbox" readOnly checked={isActive} />
                            <span className="camp-toggle-track" />
                          </label>
                          <span className={`camp-toggle-label ${isActive ? 'active' : 'paused'}`}>
                            {isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="camp-name-cell">
                          <span className="camp-name">{c.name}</span>
                          {leadCount != null && <span className="camp-name-sub">{leadCount} leads</span>}
                        </div>
                      </td>

                      <td>
                        {c.settings?.agentName ? (
                          <span className="camp-agent-chip">
                            <IconAgent />
                            {c.settings.agentName}
                          </span>
                        ) : (
                          <span className="camp-no-agent">—</span>
                        )}
                      </td>

                      <td>
                        <div className="camp-metric">
                          <span className={`camp-metric-val${acc > 30 ? ' good' : ''}`}>{acc}%</span>
                          <span className="camp-metric-sub">of {sent} sent</span>
                        </div>
                      </td>

                      <td>
                        <div className="camp-metric">
                          <span className={`camp-metric-val${rep > 15 ? ' good' : ''}`}>{rep}%</span>
                          <span className="camp-metric-sub">of {accepted} connected</span>
                        </div>
                      </td>

                      <td>
                        <div className="camp-metric">
                          <span className="camp-date">{relDate(c.createdAt)}</span>
                          {c.createdAt && (
                            <span className="camp-metric-sub">
                              {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="camp-arrow">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </span>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredList.length === 0 && (
              <div className="camp-no-results">No campaigns match "{search}"</div>
            )}
          </>
        )}
      </div>

      {/* Create campaign modal */}
      {createOpen && (
        <div
          className="modal-overlay"
          onClick={e => e.target === e.currentTarget && !creating && (setCreateOpen(false), setName(''))}
        >
          <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-icon-header" style={{ paddingBottom: 20 }}>
              <div className="modal-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div className="modal-heading">New Campaign</div>
              <div className="modal-subtext">Give it a name — you'll add leads and set the sequence on the next page.</div>
            </div>
            <div className="modal-form">
              <div>
                <label className="modal-field-label">Campaign name</label>
                <input
                  className="modal-input"
                  placeholder="e.g. UK Accountants — MTD 2026"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && name.trim() && !creating && handleCreate()}
                />
              </div>
            </div>
            <div className="modal-footer-bar">
              <button className="modal-btn-ghost" onClick={() => { setCreateOpen(false); setName('') }}>Cancel</button>
              <button className="modal-btn-primary" disabled={!name.trim() || creating} onClick={handleCreate}>
                {creating ? 'Creating…' : 'Create Campaign →'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
