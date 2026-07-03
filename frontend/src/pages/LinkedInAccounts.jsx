import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { unipile } from '../lib/api'
import { useToast } from '../components/Toast'
import { SkeletonTableRows } from '../components/Skeleton'

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function UsageBar({ used = 0, limit = 25 }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--signal)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{used}/{limit}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function LinkedInAccounts() {
  const location = useLocation()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)   // acc.id of open menu
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  async function load() {
    setLoading(true)
    try {
      const data = await unipile.getAccounts()
      const items = data?.items || data?.accounts || (Array.isArray(data) ? data : [])
      setAccounts(items)
    } catch {
      toast('Could not load LinkedIn accounts', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Handle redirect back from Unipile hosted-auth
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('unipile') === 'connected') {
      setSyncing(true)
      unipile.syncAccounts()
        .then(() => load())
        .catch(() => {})
        .finally(() => setSyncing(false))
      // Clean URL
      window.history.replaceState({}, '', '/linkedin-accounts')
    }
    if (params.get('unipile') === 'failed') {
      toast('LinkedIn connection failed. Please try again.', 'danger')
      window.history.replaceState({}, '', '/linkedin-accounts')
    }
  }, [location.search])

  async function handleConnect() {
    setConnecting(true)
    try {
      const data = await unipile.connectAccount({ returnTo: '/linkedin-accounts' })
      const url = data?.url || data?.hosted_auth_url
      if (!url) throw new Error('No auth URL returned')
      window.location.href = url
    } catch (err) {
      toast(err.message || 'Could not start LinkedIn connection', 'danger')
      setConnecting(false)
    }
  }

  async function handleDisconnect(accountId) {
    if (!window.confirm('Disconnect this LinkedIn account? Active campaigns using it will stop.')) return
    try {
      await unipile.disconnectAccount(accountId)
      setAccounts(prev => prev.filter(a => a.id !== accountId))
      toast('Account disconnected', 'success')
    } catch (err) {
      toast(err.message || 'Could not disconnect account', 'danger')
    }
  }

  async function handleReconnect(acc) {
    setConnecting(true)
    try {
      const data = await unipile.connectAccount({ returnTo: '/linkedin-accounts' })
      const url = data?.url || data?.hosted_auth_url
      if (!url) throw new Error('No auth URL returned')
      window.location.href = url
    } catch (err) {
      toast(err.message || 'Could not reconnect account', 'danger')
      setConnecting(false)
    }
  }

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = () => setOpenMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenu])

  function getStatus(acc) {
    const s = (acc.connection_status || acc.status || '').toLowerCase()
    if (s === 'ok' || s === 'connected' || s === 'active' || !s) return 'active'
    if (s === 'error' || s === 'disconnected' || s === 'invalid') return 'error'
    return 'active'
  }

  function getConnectionType(acc) {
    const t = (acc.connection_type || acc.auth_type || '').toLowerCase()
    if (t.includes('oauth')) return 'OAuth'
    return 'Credentials'
  }

  function getType(acc) {
    const t = (acc.type || acc.plan || acc.subscription || '').toLowerCase()
    if (t.includes('premium') || t.includes('sales')) return 'Premium'
    return 'Free'
  }

  function hasSalesNav(acc) {
    const t = (acc.type || acc.plan || '').toLowerCase()
    return t.includes('sales') || t.includes('navigator')
  }

  return (
    <div className="page animate-fade-in" style={{ padding: '32px 40px' }}>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Connected Accounts</h1>
          <p className="page-subtitle">Manage your LinkedIn account connections</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={connecting || syncing}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {connecting ? 'Redirecting…' : syncing ? 'Syncing…' : 'Add LinkedIn Account'}
        </button>
      </div>

      {loading ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th><th>Status</th><th>Type</th><th>Sales Navigator</th>
                <th>Connection Type</th><th>Daily Requests Usage</th>
                <th>Daily Messages Usage</th><th>Last Sync</th><th>Actions</th>
              </tr>
            </thead>
            <tbody><SkeletonTableRows rows={3} cols={9} /></tbody>
          </table>
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto', opacity: 0.35, display: 'block' }}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No LinkedIn accounts connected</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Connect a LinkedIn account to start running campaigns and outreach.</div>
          <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Redirecting…' : '+ Add LinkedIn Account'}
          </button>
        </div>
      ) : (
        <div className="table-wrap data-loaded">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th>Type</th>
                <th>Sales Navigator</th>
                <th>Connection Type</th>
                <th>Daily Requests Usage</th>
                <th>Daily Messages Usage</th>
                <th>Last Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => {
                const status = getStatus(acc)
                const connType = getConnectionType(acc)
                const acctType = getType(acc)
                const salesNav = hasSalesNav(acc)
                const dailyReqUsed = acc.daily_requests_used ?? acc.invites_today ?? 0
                const dailyReqLimit = acc.daily_requests_limit ?? 25
                const dailyMsgUsed = acc.daily_messages_used ?? acc.messages_today ?? 0
                const dailyMsgLimit = acc.daily_messages_limit ?? 80
                const lastSync = acc.last_sync_at || acc.updated_at || acc.created_at

                return (
                  <tr key={acc.id}>
                    {/* Account */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #0a66c2, #0077b5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {(acc.name || acc.username || 'L')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{acc.name || acc.username || acc.id}</div>
                          {(acc.username || acc.profile_url) && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              @{acc.username || acc.id}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`badge ${status === 'active' ? 'badge-signal' : 'badge-danger'}`}>
                        {status === 'active' ? 'Active' : 'Error'}
                      </span>
                    </td>

                    {/* Type */}
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{acctType}</td>

                    {/* Sales Navigator */}
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{salesNav ? 'Yes' : 'No'}</td>

                    {/* Connection Type */}
                    <td>
                      <span className="badge badge-info">{connType}</span>
                    </td>

                    {/* Daily Requests */}
                    <td><UsageBar used={dailyReqUsed} limit={dailyReqLimit} /></td>

                    {/* Daily Messages */}
                    <td><UsageBar used={dailyMsgUsed} limit={dailyMsgLimit} /></td>

                    {/* Last Sync */}
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {timeAgo(lastSync)}
                    </td>

                    {/* Actions */}
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="btn btn-icon btn-ghost"
                        style={{ fontSize: 16, letterSpacing: 1 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (openMenu === acc.id) { setOpenMenu(null); return }
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                          setOpenMenu(acc.id)
                        }}
                        title="Account actions"
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Fixed dropdown — escapes table overflow clipping */}
      {openMenu && (
        <div
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: 160, padding: '6px 0' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, fontSize: 13, gap: 8 }}
            onClick={() => { const id = openMenu; setOpenMenu(null); handleReconnect(accounts.find(a => a.id === id)) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Reconnect
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 14px', borderRadius: 0, fontSize: 13, color: 'var(--danger)', gap: 8 }}
            onClick={() => { const id = openMenu; setOpenMenu(null); handleDisconnect(id) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
