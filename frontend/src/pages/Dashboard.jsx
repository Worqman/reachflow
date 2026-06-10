import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboard as dashboardApi } from '../lib/api'
import { Sk, SkeletonTableRows } from '../components/Skeleton'
import './Dashboard.css'

function timeAgo(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.get()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const stats = data?.stats || {}
  const campaigns = data?.campaigns || []
  const meetings = data?.meetings || []
  const needsReview = data?.needsReview || []

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const statCards = [
    {
      label:    'Invites Sent This Week',
      value:    loading ? '—' : String(stats.invitesSentThisWeek ?? 0),
      icon:     '◈',
      positive: true,
      to:       '/campaigns',
    },
    {
      label:    'Acceptance Rate',
      value:    loading ? '—' : `${stats.acceptanceRate ?? 0}%`,
      icon:     '◎',
      positive: (stats.acceptanceRate ?? 0) > 0,
      to:       '/campaigns',
    },
    {
      label:    'Active Campaigns',
      value:    loading ? '—' : String(stats.activeCampaigns ?? 0),
      icon:     '✉',
      positive: (stats.activeCampaigns ?? 0) > 0,
      to:       '/campaigns',
    },
    {
      label:    'Meetings This Month',
      value:    loading ? '—' : String(stats.meetingsThisMonth ?? 0),
      icon:     '◆',
      positive: (stats.meetingsThisMonth ?? 0) > 0,
      to:       '/inbox',
    },
  ]

  return (
    <div className="page dashboard-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{today} — Your outreach at a glance</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/campaigns')}>
            + New Campaign
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {statCards.map(s => (
          <div
            key={s.label}
            className="stat-card card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(s.to)}
            title={`Go to ${s.label}`}
          >
            <div className="stat-icon">{s.icon}</div>
            {loading
              ? <Sk w="48px" h={32} r={6} style={{ marginBottom: 4 }} />
              : <div className="stat-value">{s.value}</div>
            }
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Active Campaigns */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">Campaigns</h2>
            <a href="/campaigns" className="card-link">View all →</a>
          </div>
          {loading ? (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table><tbody><SkeletonTableRows rows={4} cols={5} /></tbody></table>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-icon">◈</div>
              <h3>No campaigns yet</h3>
              <p>Create your first campaign to start outreach</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Sent</th>
                    <th>Accepted</th>
                    <th>Replied</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 5).map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="mono">{c.sent}</td>
                      <td className="mono">{c.accepted}</td>
                      <td className="mono">{c.replied}</td>
                      <td>
                        <span className={`badge ${c.status === 'active' ? 'badge-signal' : 'badge-muted'}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Needs Review */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">Needs Your Review</h2>
            <a href="/inbox" className="card-link">Open inbox →</a>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="review-item" style={{ opacity: 1 - i * 0.2, pointerEvents: 'none' }}>
                  <Sk w={32} h={32} r={999} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Sk w="55%" h={13} />
                    <Sk w="75%" h={11} />
                  </div>
                </div>
              ))}
            </div>
          ) : needsReview.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-icon">✉</div>
              <h3>All caught up</h3>
              <p>No conversations need attention right now</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {needsReview.map((n, i) => (
                <div key={i} className="review-item">
                  <div className="review-avatar">{(n.name || '?')[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }} className="truncate">{n.company}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-disabled)', flexShrink: 0 }}>{timeAgo(n.updatedAt)}</div>
                  <span className="badge badge-warning" style={{ flexShrink: 0 }}>Replied</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meetings Booked */}
        <div className="card dashboard-card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h2 className="card-title">Meetings Booked</h2>
          </div>
          {loading ? (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table><tbody><SkeletonTableRows rows={3} cols={3} /></tbody></table>
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-icon">◆</div>
              <h3>No meetings yet</h3>
              <p>Meetings booked by AI Assistants will appear here</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Prospect</th>
                    <th>Booked</th>
                    <th>Company / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.prospect_name || 'Unknown'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(m.booked_at)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
