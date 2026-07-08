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

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

function IconPercent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/>
      <circle cx="6.5" cy="6.5" r="2.5"/>
      <circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  )
}

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function IconCampaigns() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  )
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
      label: 'Invites Sent This Week',
      value: loading ? null : String(stats.invitesSentThisWeek ?? 0),
      icon: <IconSend />,
      to: '/campaigns',
    },
    {
      label: 'Acceptance Rate',
      value: loading ? null : `${stats.acceptanceRate ?? 0}%`,
      icon: <IconPercent />,
      to: '/campaigns',
    },
    {
      label: 'Active Campaigns',
      value: loading ? null : String(stats.activeCampaigns ?? 0),
      icon: <IconZap />,
      to: '/campaigns',
    },
    {
      label: 'Meetings This Month',
      value: loading ? null : String(stats.meetingsThisMonth ?? 0),
      icon: <IconCalendar />,
      to: '/inbox',
    },
  ]

  return (
    <div className="dashboard-page animate-fade-in">

      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-greeting">{getGreeting()} 👋</div>
          <div className="dash-date">{today}</div>
        </div>
        <button className="dash-btn-new" onClick={() => navigate('/campaigns')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Campaign
        </button>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        {statCards.map(s => (
          <div key={s.label} className="stat-card" onClick={() => navigate(s.to)}>
            <div className="stat-card-top">
              <div className="stat-card-icon">{s.icon}</div>
            </div>
            <div className="stat-card-body">
              {s.value === null
                ? <Sk w="56px" h={28} r={6} style={{ marginBottom: 6 }} />
                : <div className="stat-card-value">{s.value}</div>
              }
              <div className="stat-card-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="dashboard-grid">

        {/* Campaigns */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7, color: '#6b7280' }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Campaigns
            </div>
            <a className="dash-card-link" href="/campaigns">View all →</a>
          </div>
          <div className="dash-card-body">
            {loading ? (
              <table className="dash-table">
                <tbody><SkeletonTableRows rows={4} cols={5} /></tbody>
              </table>
            ) : campaigns.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon"><IconCampaigns /></div>
                <div className="dash-empty-title">No campaigns yet</div>
                <div className="dash-empty-desc">Create your first campaign to start LinkedIn outreach</div>
              </div>
            ) : (
              <table className="dash-table">
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
                  {campaigns.slice(0, 6).map(c => (
                    <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td><span className="dash-campaign-name">{c.name}</span></td>
                      <td><span className="dash-num">{c.sent}</span></td>
                      <td><span className="dash-num">{c.accepted}</span></td>
                      <td><span className="dash-num">{c.replied}</span></td>
                      <td>
                        <span className={`dash-status ${c.status === 'active' ? 'active' : 'paused'}`}>
                          <span className="dash-status-dot" />
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Needs review */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7, color: '#6b7280' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Needs Review
            </div>
            <a className="dash-card-link" href="/inbox">Open inbox →</a>
          </div>
          <div className="dash-card-body">
            {loading ? (
              <div className="dash-review-list">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="dash-sk-row">
                    <Sk w={34} h={34} r={999} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Sk w="50%" h={12} />
                      <Sk w="70%" h={10} />
                    </div>
                  </div>
                ))}
              </div>
            ) : needsReview.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon"><IconInbox /></div>
                <div className="dash-empty-title">All caught up</div>
                <div className="dash-empty-desc">No conversations need attention right now</div>
              </div>
            ) : (
              <div className="dash-review-list">
                {needsReview.map((n, i) => (
                  <div key={i} className="dash-review-item" onClick={() => navigate('/inbox')}>
                    <div className="dash-review-avatar">{(n.name || '?')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="dash-review-name">{n.name}</div>
                      <div className="dash-review-company">{n.company}</div>
                    </div>
                    <div className="dash-review-right">
                      <span className="dash-review-time">{timeAgo(n.updatedAt)}</span>
                      <span className="dash-review-badge">Replied</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Meetings */}
      <div className="dash-meetings">
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7, color: '#6b7280' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Meetings Booked
            </div>
          </div>
          <div className="dash-card-body">
            {loading ? (
              <table className="dash-table">
                <tbody><SkeletonTableRows rows={3} cols={3} /></tbody>
              </table>
            ) : meetings.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon"><IconCalendar /></div>
                <div className="dash-empty-title">No meetings yet</div>
                <div className="dash-empty-desc">Meetings booked by your AI agents will appear here</div>
              </div>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Prospect</th>
                    <th>Booked</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map(m => (
                    <tr key={m.id}>
                      <td><span className="dash-campaign-name">{m.prospect_name || 'Unknown'}</span></td>
                      <td><span style={{ color: '#6b7280', fontSize: 12 }}>{formatDate(m.booked_at)}</span></td>
                      <td><span style={{ color: '#9ca3af', fontSize: 12 }}>{m.notes || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
