import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { getActiveWorkspaceId, onActiveWorkspaceChange, setActiveWorkspaceId } from '../lib/workspaceState'
import { getInboxUnreadCount, onInboxUnreadChange } from '../lib/inboxState'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⬡', exact: true },
  { section: 'OUTREACH' },
  { to: '/campaigns', label: 'Campaigns', icon: '◈' },
  { to: '/inbox', label: 'Inbox', icon: '✉', badge: 'inbox' },
  { to: '/leads', label: 'Lead Finder', icon: '◎' },
  { to: '/my-leads', label: 'My Leads', icon: '◉' },
  { section: 'AGENTS' },
  { to: '/agents', label: 'AI Agents', icon: '◆' },
  { section: 'TEAM' },
  { to: '/workspaces', label: 'Workspaces', icon: '⬕' },
  { to: '/members', label: 'Members', icon: '◉' },
  { to: '/billing', label: 'Billing', icon: '◇' },
]

const BOTTOM_NAV = [
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [workspaceState, setWorkspaceState] = useState({
    loading: true,
    signedIn: false,
    workspaces: [],
    activeId: getActiveWorkspaceId(),
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [inboxUnread, setInboxUnread] = useState(getInboxUnreadCount())

  useEffect(() => {
    return onInboxUnreadChange(setInboxUnread)
  }, [])

  const initials = useMemo(() => {
    const active = workspaceState.workspaces.find(w => String(w.id) === String(workspaceState.activeId))
    const name = active?.name?.trim()
    if (!name) return '—'
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase())
      .join('')
  }, [workspaceState.activeId, workspaceState.workspaces])

  const activeWorkspace = useMemo(() => (
    workspaceState.workspaces.find(w => String(w.id) === String(workspaceState.activeId)) || null
  ), [workspaceState.activeId, workspaceState.workspaces])

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        if (!supabase) {
          if (!alive) return
          setWorkspaceState({ loading: false, signedIn: false, workspaces: [], activeId: getActiveWorkspaceId() })
          return
        }

        const { data: userRes, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const user = userRes?.user || null
        if (!user) {
          if (!alive) return
          setWorkspaceState({ loading: false, signedIn: false, workspaces: [], activeId: getActiveWorkspaceId() })
          return
        }

        const { data, error: wsErr } = await supabase
          .from('workspaces')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })

        if (wsErr) throw wsErr
        const owned = data || []

        const { data: memberRows, error: memberErr } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)

        // Silently ignore: table may not exist yet (500) or RLS recursion — treat as no memberships
        const safeMemberRows = memberErr ? [] : (memberRows || [])
        const memberIds = [...new Set(safeMemberRows.map((r) => r.workspace_id).filter(Boolean))]
        let memberWorkspaces = []
        if (memberIds.length) {
          const { data: joinedWs, error: joinedErr } = await supabase
            .from('workspaces')
            .select('*')
            .in('id', memberIds)
          if (joinedErr) throw joinedErr
          memberWorkspaces = joinedWs || []
        }

        const seen = new Set()
        const list = [...owned, ...memberWorkspaces].filter((ws) => {
          const id = String(ws?.id || '')
          if (!id || seen.has(id)) return false
          seen.add(id)
          return true
        })
        const stored = getActiveWorkspaceId()
        const activeId = stored && list.some(w => String(w.id) === String(stored)) ? stored : (list[0]?.id || null)
        if (!stored && activeId) setActiveWorkspaceId(activeId)

        if (!alive) return
        setWorkspaceState({ loading: false, signedIn: true, workspaces: list, activeId })
      } catch {
        if (!alive) return
        setWorkspaceState({ loading: false, signedIn: false, workspaces: [], activeId: getActiveWorkspaceId() })
      }
    }

    load()
    const unsubscribe = onActiveWorkspaceChange((id) => {
      if (!alive) return
      setWorkspaceState(s => ({ ...s, activeId: id }))
    })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 14px 0' }}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="#080C14"/>
            </svg>
          </div>
          <span className="logo-text">ReachFlow</span>
        </div>
      </div>

      {/* Workspace */}
      <button
        type="button"
        className="sidebar-workspace"
        style={{ textDecoration: 'none', background: 'transparent', border: 'none', width: '100%' }}
        onClick={() => {
          if (!workspaceState.signedIn) return
          setPickerOpen(true)
        }}
      >
        <div className="workspace-avatar">{workspaceState.loading ? '…' : initials}</div>
        <div className="workspace-info">
          <div className="workspace-name">
            {workspaceState.loading
              ? 'Loading…'
              : activeWorkspace?.name
                ? activeWorkspace.name
                : workspaceState.signedIn
                  ? 'No workspace yet'
                  : 'Not signed in'}
          </div>
          <div className="workspace-account">
            {workspaceState.loading
              ? ' '
              : activeWorkspace
                ? 'Click to switch'
                : workspaceState.signedIn
                  ? 'Create one to continue'
                  : 'Click to sign in'}
          </div>
        </div>
        <span className="workspace-chevron">⌄</span>
      </button>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.section) {
            return <div key={i} className="nav-section-label">{item.section}</div>
          }
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && (() => {
                const count = item.badge === 'inbox' ? inboxUnread : item.badge
                return count > 0 ? <span className="nav-badge">{count}</span> : null
              })()}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        {BOTTOM_NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div
          className="nav-item"
          style={{ color: 'var(--danger)', opacity: 0.7 }}
          onClick={async () => {
            try {
              setWorkspaceState(s => ({ ...s, loading: true, signedIn: false, workspaces: [], activeId: null }))
              await supabase?.auth?.signOut?.()
              setActiveWorkspaceId(null)
              setPickerOpen(false)
              navigate('/login')
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e)
              alert('Could not sign out. Please try again.')
            }
          }}
        >
          <span className="nav-icon">↪</span>
          <span>Sign Out</span>
        </div>
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select workspace"
        width={520}
      >
        {!workspaceState.signedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sign in to manage workspaces.</div>
            <Link className="btn btn-secondary" to="/login" onClick={() => setPickerOpen(false)}>Go to login</Link>
          </div>
        ) : workspaceState.workspaces.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No workspaces yet.</div>
            <Link className="btn btn-primary" to="/workspaces" onClick={() => setPickerOpen(false)}>Create workspace</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workspaceState.workspaces.map((ws) => {
              const isActive = String(ws.id) === String(workspaceState.activeId)
              return (
                <button
                  key={ws.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    justifyContent: 'space-between',
                    background: isActive ? 'var(--signal-subtle)' : 'var(--surface-2)',
                    borderColor: isActive ? 'rgba(57,255,135,0.25)' : 'var(--border)',
                  }}
                  onClick={() => {
                    setActiveWorkspaceId(ws.id)
                    setWorkspaceState(s => ({ ...s, activeId: ws.id }))
                    setPickerOpen(false)
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>
                    {ws.name || 'Untitled workspace'}
                  </span>
                  <span className={`badge ${isActive ? 'badge-signal' : 'badge-muted'}`}>
                    {isActive ? 'Active' : 'Select'}
                  </span>
                </button>
              )
            })}

            <div className="modal-footer" style={{ marginTop: 8 }}>
              <Link className="btn btn-ghost" to="/workspaces" onClick={() => setPickerOpen(false)}>
                Manage workspaces
              </Link>
              <Link className="btn btn-primary" to="/workspaces" onClick={() => setPickerOpen(false)}>
                + New workspace
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </aside>
  )
}
