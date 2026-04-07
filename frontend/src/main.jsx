import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import { supabase } from './lib/supabase'
import { companyProfiles } from './lib/api'
import { getActiveWorkspaceId, setActiveWorkspaceId } from './lib/workspaceState'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import Inbox from './pages/Inbox'
import LeadFinder from './pages/LeadFinder'
import MyLeads from './pages/MyLeads'
import Agents from './pages/Agents'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { Workspaces, Members, Billing } from './pages/StubPages'
import './styles/design-system.css'
import './styles/layout.css'

const ONBOARDING_ALLOWLIST = ['/login', '/register', '/forgot-password', '/reset-password', '/onboarding', '/workspaces']

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

      let wsId = getActiveWorkspaceId()
      if (!wsId) {
        // No workspace in localStorage — look up if the user owns any
        try {
          const { data: ownedWs } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (ownedWs?.id) {
            // Auto-select their workspace and continue to profile check below
            setActiveWorkspaceId(ownedWs.id)
            wsId = ownedWs.id
          } else {
            // No workspace at all — first-time user, send to onboarding
            if (!alive) return
            setShouldOnboard(true)
            setCheckingSetup(false)
            return
          }
        } catch {
          // Can't check — don't block access
          if (!alive) return
          setShouldOnboard(false)
          setCheckingSetup(false)
          return
        }
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
  }, [user?.id, location.pathname])

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
  const navigate = useNavigate()
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname)

  // Global PASSWORD_RECOVERY handler — Supabase may land on any page after
  // the email link click, so we always redirect to /reset-password here.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  const routes = (
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/campaigns"     element={<Campaigns />} />
      <Route path="/campaigns/:id" element={<CampaignDetail />} />
      <Route path="/inbox"         element={<Inbox />} />
      <Route path="/leads"         element={<LeadFinder />} />
      <Route path="/my-leads"      element={<MyLeads />} />
      <Route path="/agents"        element={<Agents />} />
      <Route path="/workspaces"    element={<Workspaces />} />
      <Route path="/members"       element={<Members />} />
      <Route path="/invite"        element={<Navigate to={`/members${location.search || ''}`} replace />} />
      <Route path="/billing"       element={<Billing />} />
      <Route path="/settings"      element={<Settings />} />
      <Route path="/onboarding"    element={<Onboarding />} />
      <Route path="/login"            element={<Login />} />
      <Route path="/register"         element={<Register />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="/reset-password"   element={<ResetPassword />} />
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
