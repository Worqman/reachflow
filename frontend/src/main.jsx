import React, { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { supabase } from './lib/supabase'
import { companyProfiles, entitlements as entitlementsApi } from './lib/api'
import { getActiveWorkspaceId, setActiveWorkspaceId } from './lib/workspaceState'
import './styles/design-system.css'
import './styles/layout.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const CampaignDetail = lazy(() => import('./pages/CampaignDetail'))
const Inbox = lazy(() => import('./pages/Inbox'))
const LeadFinder = lazy(() => import('./pages/LeadFinder'))
const MyLeads = lazy(() => import('./pages/MyLeads'))
const Agents = lazy(() => import('./pages/Agents'))
const SignalFeed = lazy(() => import('./pages/SignalFeed'))
const Settings = lazy(() => import('./pages/Settings'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const LinkedInAccounts = lazy(() => import('./pages/LinkedInAccounts'))
const Workspaces = lazy(() => import('./pages/StubPages').then(m => ({ default: m.Workspaces })))
const Members = lazy(() => import('./pages/StubPages').then(m => ({ default: m.Members })))
const LifetimeAccess = lazy(() => import('./pages/LifetimeAccess'))

const PageLoader = () => (
  <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
)

const ONBOARDING_ALLOWLIST = ['/login', '/register', '/forgot-password', '/reset-password', '/onboarding', '/workspaces', '/lifetime-access']

function RequireAuth({ children }) {
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState(null)
  const [checkingSetup, setCheckingSetup] = useState(false)
  const [shouldOnboard, setShouldOnboard] = useState(false)
  const [checkingEntitlement, setCheckingEntitlement] = useState(true)
  const [hasEntitlement, setHasEntitlement] = useState(false)
  // Tracks whether we've already confirmed setup is complete this session
  // so we don't re-run expensive DB queries on every navigation
  const setupDoneRef = useRef(false)

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

  // Once per login: checks lifetime access (and, as a side effect, links
  // any purchase made under this verified email before the account
  // existed — see routes/entitlements.js). Deliberately not called on
  // every API request. This is the frontend half of the paywall gate —
  // the backend enforces the same thing independently on protected routes
  // (server.js requireEntitlement), so this is UX, not the real boundary.
  useEffect(() => {
    if (!user?.id) { setCheckingEntitlement(false); return }
    let alive = true
    setCheckingEntitlement(true)
    entitlementsApi.getMine()
      .then((res) => { if (alive) setHasEntitlement(!!res?.entitlement) })
      .catch(() => { if (alive) setHasEntitlement(false) })
      .finally(() => { if (alive) setCheckingEntitlement(false) })
    return () => { alive = false }
  }, [user?.id])

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

      // Already confirmed setup in this session — skip all DB queries
      if (setupDoneRef.current) return

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

      // SHORT-CIRCUIT: already marked complete in localStorage — skip all DB queries
      const doneKey = `rf_onboarding_complete_${String(wsId)}`
      if (localStorage.getItem(doneKey) === '1') {
        if (!alive) return
        setShouldOnboard(false)
        setCheckingSetup(false)
        setupDoneRef.current = true
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
          setupDoneRef.current = true
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

        const complete = profileOk || (localStorage.getItem(doneKey) === '1')
        if (!alive) return
        setShouldOnboard(!complete)
        if (complete) setupDoneRef.current = true
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

  if (checkingEntitlement) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  // Accepting a team invite doesn't require lifetime access of your own
  // yet (see server.js — /api/members is exempt from requireEntitlement
  // for the same reason); everything else in the app does.
  const hasInviteToken =
    (location.pathname === '/members' || location.pathname === '/invite') &&
    new URLSearchParams(location.search).has('token')

  if (!hasEntitlement && !hasInviteToken && location.pathname !== '/lifetime-access') {
    return <Navigate to="/lifetime-access" replace />
  }
  if (hasEntitlement && location.pathname === '/lifetime-access') {
    return <Navigate to="/" replace />
  }

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
  const hideSidebar = location.pathname === '/onboarding' || location.pathname === '/lifetime-access'
  const [workspaceName, setWorkspaceName] = useState('')

  useEffect(() => {
    if (!supabase || hideSidebar) return
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id
      if (!uid) return
      const { data: ws } = await supabase
        .from('workspaces')
        .select('name')
        .eq('owner_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ws?.name) setWorkspaceName(ws.name)
    }).catch(() => {})
  }, [hideSidebar])

  return (
    <div className="app-layout">
      {!hideSidebar && <Sidebar />}
      <div className="app-main-wrap">
        {!hideSidebar && <TopBar workspaceName={workspaceName} />}
        <main className="app-main">
          {children}
        </main>
      </div>
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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"              element={<Dashboard />} />
        <Route path="/campaigns"     element={<Campaigns />} />
        <Route path="/linkedin-accounts" element={<LinkedInAccounts />} />
        <Route path="/campaigns/:id" element={<CampaignDetail />} />
        <Route path="/inbox"         element={<Inbox />} />
        <Route path="/leads"         element={<LeadFinder />} />
        <Route path="/my-leads"      element={<MyLeads />} />
        <Route path="/agents"        element={<Agents />} />
        <Route path="/signals"       element={<SignalFeed />} />
        <Route path="/workspaces"    element={<Workspaces />} />
        <Route path="/members"       element={<Members />} />
        <Route path="/invite"        element={<Navigate to={`/members${location.search || ''}`} replace />} />
        <Route path="/billing"       element={<Navigate to="/settings?tab=billing" replace />} />
        <Route path="/settings"      element={<Settings />} />
        <Route path="/profile"       element={<Navigate to="/settings?tab=profile" replace />} />
        <Route path="/onboarding"    element={<Onboarding />} />
        <Route path="/lifetime-access" element={<LifetimeAccess />} />
        <Route path="/login"            element={<Login />} />
        <Route path="/register"         element={<Register />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/reset-password"   element={<ResetPassword />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
