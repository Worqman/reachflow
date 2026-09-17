import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { entitlements as entitlementsApi } from '../lib/api'
import { useToast } from '../components/Toast'
import './Login.css'
import './Billing.css'

const LIFETIME_FEATURES = [
  '3,000 credits included',
  '3 LinkedIn accounts',
  'Up to 5 team members',
  'AI agents & message generation',
  'Full analytics & reporting',
]

const POLL_INTERVAL_MS = 1500
const POLL_ATTEMPTS = 8 // ~12s — webhooks land fast, but aren't synchronous with the redirect

export default function LifetimeAccess() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const [status, setStatus] = useState('idle') // idle | starting | confirming | timeout
  const [error, setError] = useState('')
  const pollCountRef = useRef(0)

  useEffect(() => {
    const checkout = searchParams.get('checkout')

    if (checkout === 'cancelled') {
      toast?.('Checkout cancelled — no payment was made', 'info')
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('checkout')
        next.delete('session_id')
        return next
      }, { replace: true })
      return
    }

    if (checkout === 'success') {
      setStatus('confirming')
      pollCountRef.current = 0
      pollForEntitlement()
      return
    }

    // Direct visit (no checkout in progress) — if this account already has
    // lifetime access (e.g. they navigated back here manually), skip ahead.
    entitlementsApi.getMine().then((res) => {
      if (res?.entitlement) navigate('/', { replace: true })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pollForEntitlement() {
    try {
      const res = await entitlementsApi.getMine()
      if (res?.entitlement) {
        toast?.('Lifetime access confirmed', 'success')
        navigate('/', { replace: true })
        return
      }
    } catch {
      // keep polling — a transient failure shouldn't drop into "timeout" early
    }
    pollCountRef.current += 1
    if (pollCountRef.current >= POLL_ATTEMPTS) {
      setStatus('timeout')
      return
    }
    setTimeout(pollForEntitlement, POLL_INTERVAL_MS)
  }

  async function handleBuy() {
    setError('')
    setStatus('starting')
    try {
      const res = await entitlementsApi.checkout()
      if (!res?.url) throw new Error('No checkout URL returned')
      window.location.href = res.url
    } catch (err) {
      setError(err?.message || 'Could not start checkout')
      setStatus('idle')
    }
  }

  async function handleSignOut() {
    try { await supabase.auth.signOut() } catch {}
    navigate('/login', { replace: true })
  }

  if (status === 'confirming') {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 440, textAlign: 'center' }}>
          <span className="auth-spinner" style={{ borderTopColor: '#6366f1', borderColor: 'rgba(99,102,241,0.2)', margin: '0 auto 16px' }} />
          <h1 className="auth-heading">Confirming your payment…</h1>
          <p className="auth-sub" style={{ marginBottom: 0 }}>This usually takes just a few seconds.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-logo">
          <img src="/logo.png" alt="eya" className="auth-logo-img" />
        </div>

        <h1 className="auth-heading">Get Lifetime Access</h1>
        <p className="auth-sub">
          {status === 'timeout'
            ? "Still confirming your payment — this can take a moment. If you've already paid, it'll unlock automatically; feel free to check again."
            : 'One payment, no subscription — full access to Eya, forever.'}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="billing-tier-price" style={{ marginBottom: 16 }}>
          <span className="billing-tier-amount">£149</span>
          <span className="billing-tier-period"> one-time</span>
        </div>

        <ul className="billing-tier-features" style={{ marginBottom: 24 }}>
          {LIFETIME_FEATURES.map((f) => (
            <li key={f}><span className="billing-check">✓</span>{f}</li>
          ))}
        </ul>

        <button className="auth-submit" onClick={handleBuy} disabled={status === 'starting'}>
          {status === 'starting' ? <><span className="auth-spinner" />Redirecting to Stripe…</> : 'Get Lifetime Access'}
        </button>

        {status === 'timeout' && (
          <button
            type="button"
            className="auth-submit"
            style={{ background: 'transparent', color: '#6366f1', border: '1px solid #e5e7eb', marginTop: 10 }}
            onClick={() => { setStatus('confirming'); pollCountRef.current = 0; pollForEntitlement() }}
          >
            Check again
          </button>
        )}

        <p className="auth-switch" style={{ marginTop: 20 }}>
          <button type="button" onClick={handleSignOut} className="auth-switch-link" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
