import './Dashboard.css'

const STATS = [
  { label: 'Connections This Week', value: '142', delta: '+18%', icon: '◈', positive: true },
  { label: 'Acceptance Rate',       value: '34%', delta: '+4%',  icon: '◎', positive: true },
  { label: 'Active Conversations',  value: '28',  delta: '-2',   icon: '✉', positive: false },
  { label: 'Meetings This Month',   value: '7',   delta: '+3',   icon: '◆', positive: true },
]

const RECENT_CAMPAIGNS = [
  { name: 'UK Accountants — MTD',      status: 'active',  sent: 84,  accepted: 28, replied: 12 },
  { name: 'SaaS Founders — Web Design', status: 'active',  sent: 56,  accepted: 19, replied: 8  },
  { name: 'Property Firms Q1',          status: 'paused',  sent: 120, accepted: 41, replied: 17 },
]

const NEEDS_REVIEW = [
  { name: 'James McKenzie',  company: 'McKenzie & Co Accountants', time: '12m ago' },
  { name: 'Sarah Patel',     company: 'SP Financial Services',     time: '34m ago' },
  { name: 'Oliver Thornton', company: 'Thornton Advisory',         time: '1h ago' },
]

const SIGNAL_FEED = [
  { type: 'job_change',    name: 'David Harrison',  detail: 'Started as MD at Pinnacle Accounting', time: '2m ago' },
  { type: 'keyword',       name: 'Emma Clarke',     detail: 'Posted about Making Tax Digital',      time: '8m ago' },
  { type: 'competitor',    name: 'Tom Whitfield',   detail: 'Started following Xero UK',            time: '15m ago' },
  { type: 'job_change',    name: 'Rachel Ahmed',    detail: 'Promoted to Finance Director',         time: '22m ago' },
]

const SIGNAL_ICONS = {
  job_change: '⬆',
  keyword:    '◎',
  competitor: '◈',
}

export default function Dashboard() {
  return (
    <div className="page dashboard-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Friday, 13 March 2026 — Your outreach at a glance</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm">Export</button>
          <button className="btn btn-primary btn-sm">+ New Campaign</button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {STATS.map(s => (
          <div key={s.label} className="stat-card card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-delta ${s.positive ? 'positive' : 'negative'}`}>{s.delta} vs last week</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Active Campaigns */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">Active Campaigns</h2>
            <a href="/campaigns" className="card-link">View all →</a>
          </div>
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
                {RECENT_CAMPAIGNS.map(c => (
                  <tr key={c.name}>
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
        </div>

        {/* Needs Review */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">Needs Your Review</h2>
            <a href="/inbox" className="card-link">Open inbox →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NEEDS_REVIEW.map(n => (
              <div key={n.name} className="review-item">
                <div className="review-avatar">{n.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{n.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }} className="truncate">{n.company}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-disabled)', flexShrink: 0 }}>{n.time}</div>
                <span className="badge badge-warning" style={{ flexShrink: 0 }}>Review</span>
              </div>
            ))}
          </div>
        </div>

        {/* Signal Feed */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">
              Signal Feed
              <div className="signal-dot" style={{ marginLeft: 8, display: 'inline-block' }} />
            </h2>
            <a href="/agents" className="card-link">Manage agents →</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SIGNAL_FEED.map((s, i) => (
              <div key={i} className="signal-item">
                <div className="signal-type-icon">{SIGNAL_ICONS[s.type]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.detail}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-disabled)', flexShrink: 0 }}>{s.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="card dashboard-card">
          <div className="card-header">
            <h2 className="card-title">Upcoming Meetings</h2>
          </div>
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-icon">◆</div>
            <h3>No meetings yet</h3>
            <p>Meetings booked by AI Assistants will appear here</p>
          </div>
        </div>
      </div>
    </div>
  )
}
