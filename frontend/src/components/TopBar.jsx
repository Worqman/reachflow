import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'

const ROUTE_MAP = {
  '/':                  'Dashboard',
  '/inbox':             'Inbox',
  '/campaigns':         'Campaigns',
  '/leads':             'Lead Extractor',
  '/my-leads':          'Lead Database',
  '/agents':            'AI Agents',
  '/settings':          'Settings',
  '/linkedin-accounts': 'LinkedIn Accounts',
  '/workspaces':        'Workspaces',
  '/members':           'Members',
}

export default function TopBar() {
  const location = useLocation()

  const pageName = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/campaigns/')) return 'Campaign'
    return ROUTE_MAP[path] || ''
  }, [location.pathname])

  const isDashboard = location.pathname === '/'

  return (
    <header className="topbar">
      <div className="topbar-left">
        <nav className="topbar-breadcrumb">
          {isDashboard ? (
            <span className="topbar-breadcrumb-current">Dashboard</span>
          ) : (
            <>
              <Link to="/" className="topbar-breadcrumb-home">Dashboard</Link>
              <span className="topbar-breadcrumb-sep">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
              <span className="topbar-breadcrumb-current">{pageName}</span>
            </>
          )}
        </nav>
      </div>

      <div className="topbar-right" />
    </header>
  )
}
