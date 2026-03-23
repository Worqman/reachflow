import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import { supabase } from './lib/supabase'
import { companyProfiles } from './lib/api'
import { getActiveWorkspaceId } from './lib/workspaceState'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import Inbox from './pages/Inbox'
import LeadFinder from './pages/LeadFinder'
import Agents from './pages/Agents'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Register from './pages/Register'
import { Workspaces, Members, Billing } from './pages/StubPages'
import './styles/design-system.css'
import './styles/layout.css'

const ONBOARDING_ALLOWLIST = ['/login', '/register', '/onboarding', '/workspaces']

function RequireAuth({ children }) {
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState(null)
  const [checkingSetup, setCheckingSetup] = useState(false)
  const [shouldOnboard, setShouldOnboard] = useState(false)

  useEffect(() => {
    let alive = true

    async function check() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!alive) return
        if (error) throw error
        setUser(data?.user || null)
      } catch {
        if (!alive) return
        setUser(null)
      } finally {
        if (!alive) return
        setChecking(false)
      }
    }

    check()

    let sub = null
    try {
      sub = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null)
        setChecking(false)
      })
    } catch {
      // If Supabase isn't initialized, treat as logged out.
      setUser(null)
      setChecking(false)
    }

    return () => {
      alive = false
      sub?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let alive = true

    async function checkSetup() {
      // Don't block auth routes (we won't wrap them anyway), and allow workspaces onboarding.
      if (!user) return

      const path = location.pathname
      const hasInviteToken =
        (path === '/members' || path === '/invite') &&
        new URLSearchParams(location.search).has('token')

      if (hasInviteToken) {
        setShouldOnboard(false)
        setCheckingSetup(false)
        return
      }

      if (ONBOARDING_ALLOWLIST.includes(path)) {
        setShouldOnboard(false)
        setCheckingSetup(false)
        return
      }

      const wsId = getActiveWorkspaceId()
      if (!wsId) {
        // Invited members often won't have an owner workspace selected locally.
        // Avoid forcing onboarding when no active workspace is available.
        setShouldOnboard(false)
        setCheckingSetup(false)
        return
      }

      // Only workspace owners should be blocked by onboarding completion.
      try {
        const { data: ownerWorkspace, error: ownerCheckErr } = await supabase
          .from('workspaces')
          .select('id')
          .eq('id', wsId)
          .eq('owner_id', user.id)
          .maybeSingle()

        if (!alive) return
        if (ownerCheckErr || !ownerWorkspace) {
          setShouldOnboard(false)
          setCheckingSetup(false)
          return
        }
      } catch {
        if (!alive) return
        setShouldOnboard(false)
        setCheckingSetup(false)
        return
      }

      setCheckingSetup(true)
      try {
        const res = await companyProfiles.list(wsId)
        const p = res?.profiles?.[0] || null

        const servicesOk = Array.isArray(p?.services_offered) && p.services_offered.length > 0
        const socialOk = Array.isArray(p?.social_proof) && p.social_proof.length > 0
        const toneOk = !!p?.tone_preference
        const profileOk = !!p
          && !!p.company_name
          && !!p.website_url
          && !!p.company_description
          && !!p.value_proposition
          && servicesOk
          && socialOk
          && toneOk
          && !!p.calendar_link

        const doneKey = `rf_onboarding_complete_${String(wsId)}`
        const doneFlag = localStorage.getItem(doneKey) === '1'
        const complete = profileOk || doneFlag
        if (!alive) return
        setShouldOnboard(!complete)
      } catch {
        if (!alive) return
        // If check fails, don't block access.
        setShouldOnboard(false)
      } finally {
        if (!alive) return
        setCheckingSetup(false)
      }
    }

    checkSetup()
    return () => { alive = false }
  }, [user, location.pathname])

  if (checking) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (checkingSetup) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (shouldOnboard && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

function AppLayout({ children }) {
  const location = useLocation()
  const hideSidebar = location.pathname === '/onboarding'
  return (
    <div className="app-layout">
      {!hideSidebar && <Sidebar />}
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}

function AppRoutes() {
  const location = useLocation()
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register'

  const routes = (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/campaigns"     element={<Campaigns />} />
      <Route path="/campaigns/:id" element={<CampaignDetail />} />
      <Route path="/inbox"         element={<Inbox />} />
      <Route path="/leads"         element={<LeadFinder />} />
      <Route path="/agents"        element={<Agents />} />
      <Route path="/workspaces"    element={<Workspaces />} />
      <Route path="/members"       element={<Members />} />
      <Route path="/invite"        element={<Navigate to={`/members${location.search || ''}`} replace />} />
      <Route path="/billing"       element={<Billing />} />
      <Route path="/settings"      element={<Settings />} />
      <Route path="/onboarding"    element={<Onboarding />} />
      <Route path="/login"         element={<Login />} />
      <Route path="/register"      element={<Register />} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )

  if (isAuthRoute) {
    return routes
  }

  return (
    <AppLayout>
      <RequireAuth>{routes}</RequireAuth>
    </AppLayout>
  )
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
