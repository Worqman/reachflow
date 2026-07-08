import { useEffect, useState } from 'react'
import { dashboard as dashboardApi, unipile } from '../lib/api'
import { useToast } from '../components/Toast'
import { Sk } from '../components/Skeleton'
import Modal from '../components/Modal'
import './Billing.css'

const TRIAL_START = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
const TRIAL_DAYS = 7
const TRIAL_END = new Date(TRIAL_START.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
const DAYS_LEFT = Math.max(0, Math.ceil((TRIAL_END - Date.now()) / (1000 * 60 * 60 * 24)))

const TRIAL_FEATURES = [
  '1 LinkedIn account',
  'Unlimited connection requests during trial',
  '1 active campaign',
  'AI agents & message generation',
  'Full analytics access',
]

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    tagline: 'For solo founders testing outreach',
    features: [
      '1 LinkedIn account',
      '3 active campaigns',
      'AI agents & message generation',
      'Standard analytics',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 129,
    tagline: 'For teams scaling pipeline',
    popular: true,
    features: [
      '3 LinkedIn accounts',
      'Unlimited campaigns',
      'AI agents & message generation',
      'Full analytics & reporting',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 299,
    tagline: 'For agencies running at volume',
    features: [
      '10 LinkedIn accounts',
      'Unlimited campaigns',
      'AI agents & message generation',
      'Full analytics & reporting',
      'Dedicated success manager',
    ],
  },
]

function IconAccounts() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 8h20" />
    </svg>
  )
}

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconCard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function IconInvoice() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function detectBrand(digits) {
  if (/^4/.test(digits)) return 'Visa'
  if (/^5[1-5]/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^6(?:011|5)/.test(digits)) return 'Discover'
  return 'Card'
}

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export default function Billing() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({})
  const [accountCount, setAccountCount] = useState(null)

  const [currentPlanId, setCurrentPlanId] = useState('trial')
  const [pendingPlan, setPendingPlan] = useState(null)
  const [card, setCard] = useState(null)
  const [invoices, setInvoices] = useState([])

  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [cardForm, setCardForm] = useState({ name: '', number: '', expiry: '', cvc: '' })
  const [savingCard, setSavingCard] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.allSettled([dashboardApi.get(), unipile.getAccounts()]).then(([dashRes, accRes]) => {
      if (!mounted) return
      if (dashRes.status === 'fulfilled') setStats(dashRes.value?.stats || {})
      if (accRes.status === 'fulfilled') {
        const data = accRes.value
        const items = data?.items || data?.accounts || (Array.isArray(data) ? data : [])
        setAccountCount(items.length)
      }
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  const currentPlan = PLANS.find(p => p.id === currentPlanId) || null

  function openCardModal(forPlan = null) {
    setPendingPlan(forPlan)
    setCardForm({ name: '', number: '', expiry: '', cvc: '' })
    setCardModalOpen(true)
  }

  function submitCard(e) {
    e.preventDefault()
    const digits = cardForm.number.replace(/\D/g, '')
    if (!cardForm.name.trim() || digits.length < 12 || !/^\d{2}\/\d{2}$/.test(cardForm.expiry) || cardForm.cvc.length < 3) {
      toast('Check your card details and try again', 'warning')
      return
    }
    setSavingCard(true)
    setTimeout(() => {
      setCard({
        brand: detectBrand(digits),
        last4: digits.slice(-4),
        expiry: cardForm.expiry,
        name: cardForm.name.trim(),
      })
      setSavingCard(false)
      setCardModalOpen(false)
      toast('Payment method added', 'success')
      if (pendingPlan) {
        confirmUpgrade(pendingPlan)
        setPendingPlan(null)
      }
    }, 500)
  }

  function handleUpgradeClick(plan) {
    if (plan.id === currentPlanId) return
    if (!card) {
      openCardModal(plan)
      return
    }
    confirmUpgrade(plan)
  }

  function confirmUpgrade(plan) {
    setCurrentPlanId(plan.id)
    setInvoices(prev => [
      {
        id: `INV-${Date.now().toString().slice(-6)}`,
        date: new Date(),
        plan: plan.name,
        amount: plan.price,
        status: 'Paid',
      },
      ...prev,
    ])
    toast(`You're now on the ${plan.name} plan`, 'success')
  }

  function handleCancelPlan() {
    setCurrentPlanId('trial')
    toast('Subscription canceled — you\'re back on the free trial', 'info')
  }

  function removeCard() {
    setCard(null)
    setRemoveConfirmOpen(false)
    toast('Payment method removed', 'info')
  }

  const usageCards = [
    { label: 'LinkedIn Accounts', value: loading ? null : String(accountCount ?? 0), limit: '1 included', icon: <IconAccounts /> },
    { label: 'Active Campaigns', value: loading ? null : String(stats.activeCampaigns ?? 0), limit: '1 included', icon: <IconZap /> },
    { label: 'Invites Sent This Week', value: loading ? null : String(stats.invitesSentThisWeek ?? 0), limit: 'Unlimited in trial', icon: <IconSend /> },
  ]

  return (
    <div className="billing-tab">

      {/* Current plan */}
      <div className="billing-plan-card">
        <div className="billing-plan-badge">Active Plan</div>

        {currentPlan ? (
          <>
            <div className="billing-plan-top">
              <div>
                <div className="billing-plan-name">{currentPlan.name}</div>
                <div className="billing-plan-desc">${currentPlan.price}/month — {currentPlan.tagline.toLowerCase()}.</div>
              </div>
            </div>

            <ul className="billing-plan-features">
              {currentPlan.features.map(f => (
                <li key={f}><span className="billing-check">✓</span>{f}</li>
              ))}
            </ul>

            <div className="billing-plan-actions">
              <a className="btn btn-secondary btn-sm" href="#plans">Change plan</a>
              <button className="btn btn-ghost btn-sm" onClick={handleCancelPlan}>Cancel subscription</button>
            </div>
          </>
        ) : (
          <>
            <div className="billing-plan-top">
              <div>
                <div className="billing-plan-name">Free Trial</div>
                <div className="billing-plan-desc">Full access for {TRIAL_DAYS} days — no credit card required.</div>
              </div>
              <div className="billing-plan-days">
                <div className="billing-plan-days-value">{DAYS_LEFT}</div>
                <div className="billing-plan-days-label">days left</div>
              </div>
            </div>

            <div className="billing-plan-progress">
              <div className="billing-plan-progress-row">
                <span>Trial started {TRIAL_START.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                <span>Ends {TRIAL_END.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="billing-progress-track">
                <div
                  className="billing-progress-fill"
                  style={{
                    width: `${Math.round(((TRIAL_DAYS - DAYS_LEFT) / TRIAL_DAYS) * 100)}%`,
                    background: DAYS_LEFT <= 2 ? 'var(--danger)' : 'var(--signal)',
                  }}
                />
              </div>
            </div>

            <ul className="billing-plan-features">
              {TRIAL_FEATURES.map(f => (
                <li key={f}><span className="billing-check">✓</span>{f}</li>
              ))}
            </ul>

            <div className="billing-plan-actions">
              <a className="btn btn-primary btn-sm" href="#plans">Upgrade Plan</a>
              <a className="btn btn-ghost btn-sm" href="#plans">View all plans</a>
            </div>
          </>
        )}
      </div>

      {/* Usage */}
      <div className="billing-section-label">Usage this cycle</div>
      <div className="billing-usage-grid">
        {usageCards.map(u => (
          <div key={u.label} className="billing-usage-card">
            <div className="billing-usage-icon">{u.icon}</div>
            <div className="billing-usage-body">
              {u.value === null
                ? <Sk w="40px" h={22} r={6} style={{ marginBottom: 4 }} />
                : <div className="billing-usage-value">{u.value}</div>
              }
              <div className="billing-usage-label">{u.label}</div>
            </div>
            <div className="billing-usage-limit">{u.limit}</div>
          </div>
        ))}
      </div>

      {/* Plans */}
      <div id="plans" className="billing-section-label">Available plans</div>
      <div className="billing-plans-grid">
        {PLANS.map(p => {
          const isCurrent = p.id === currentPlanId
          return (
            <div key={p.id} className={`billing-tier-card${p.popular ? ' popular' : ''}${isCurrent ? ' current' : ''}`}>
              {p.popular && !isCurrent && <div className="billing-tier-popular">Most Popular</div>}
              {isCurrent && <div className="billing-tier-popular current">Current Plan</div>}
              <div className="billing-tier-name">{p.name}</div>
              <div className="billing-tier-tagline">{p.tagline}</div>
              <div className="billing-tier-price">
                <span className="billing-tier-amount">${p.price}</span>
                <span className="billing-tier-period">/month</span>
              </div>
              <ul className="billing-tier-features">
                {p.features.map(f => (
                  <li key={f}><span className="billing-check">✓</span>{f}</li>
                ))}
              </ul>
              <button
                className={`btn btn-sm ${isCurrent ? 'btn-secondary' : p.popular ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={isCurrent}
                onClick={() => handleUpgradeClick(p)}
              >
                {isCurrent ? 'Current plan' : `Upgrade to ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>

      {/* Payment method + invoices */}
      <div className="billing-bottom-grid">
        <div className="billing-card">
          <div className="billing-card-header">
            <div className="billing-card-title">
              <span className="billing-card-title-icon"><IconCard /></span>
              Payment Method
            </div>
            {card && (
              <button className="billing-card-link" onClick={() => openCardModal(null)}>Replace</button>
            )}
          </div>
          <div className="billing-card-body">
            {card ? (
              <div className="billing-card-on-file">
                <div className="billing-card-visual">
                  <div className="billing-card-visual-top">
                    <span className="billing-card-brand">{card.brand}</span>
                    <IconCard />
                  </div>
                  <div className="billing-card-visual-number">•••• •••• •••• {card.last4}</div>
                  <div className="billing-card-visual-bottom">
                    <span>{card.name}</span>
                    <span>{card.expiry}</span>
                  </div>
                </div>
                <button className="billing-remove-card-btn" onClick={() => setRemoveConfirmOpen(true)} title="Remove card">
                  <IconTrash />
                </button>
              </div>
            ) : (
              <div className="billing-empty">
                <div className="billing-empty-icon"><IconCard /></div>
                <div className="billing-empty-title">No payment method on file</div>
                <div className="billing-empty-desc">Add a card before your trial ends to avoid interruption</div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => openCardModal(null)}>
                  Add payment method
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="billing-card">
          <div className="billing-card-header">
            <div className="billing-card-title">
              <span className="billing-card-title-icon"><IconInvoice /></span>
              Billing History
            </div>
            {invoices.length > 0 && <span className="billing-count-badge">{invoices.length}</span>}
          </div>
          <div className="billing-card-body">
            {invoices.length === 0 ? (
              <div className="billing-empty">
                <div className="billing-empty-icon"><IconInvoice /></div>
                <div className="billing-empty-title">No invoices yet</div>
                <div className="billing-empty-desc">Invoices will appear here once you're on a paid plan</div>
              </div>
            ) : (
              <div className="billing-invoice-list">
                {invoices.map(inv => (
                  <div key={inv.id} className="billing-invoice-row">
                    <div className="billing-invoice-info">
                      <div className="billing-invoice-id">{inv.id}</div>
                      <div className="billing-invoice-meta">
                        {inv.plan} plan · {inv.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <span className="billing-invoice-status">{inv.status}</span>
                    <div className="billing-invoice-amount">${inv.amount.toFixed(2)}</div>
                    <button
                      className="billing-invoice-download"
                      onClick={() => toast(`Downloading ${inv.id}…`, 'info')}
                      title="Download invoice"
                    >
                      <IconDownload />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / replace card modal */}
      <Modal open={cardModalOpen} onClose={() => !savingCard && setCardModalOpen(false)} title="Add payment method">
        <form onSubmit={submitCard}>
          <div className="input-group">
            <label className="input-label">Name on card</label>
            <input
              className="input"
              value={cardForm.name}
              onChange={(e) => setCardForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Doe"
              autoFocus
            />
          </div>
          <div className="input-group">
            <label className="input-label">Card number</label>
            <input
              className="input"
              value={cardForm.number}
              onChange={(e) => setCardForm(f => ({ ...f, number: formatCardNumber(e.target.value) }))}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Expiry</label>
              <input
                className="input"
                value={cardForm.expiry}
                onChange={(e) => setCardForm(f => ({ ...f, expiry: formatExpiry(e.target.value) }))}
                placeholder="MM/YY"
                inputMode="numeric"
              />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">CVC</label>
              <input
                className="input"
                value={cardForm.cvc}
                onChange={(e) => setCardForm(f => ({ ...f, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder="123"
                inputMode="numeric"
              />
            </div>
          </div>
          {pendingPlan && (
            <div className="billing-modal-note">
              You'll be upgraded to the <strong>{pendingPlan.name}</strong> plan (${pendingPlan.price}/mo) once your card is saved.
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setCardModalOpen(false)} disabled={savingCard}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingCard}>
              {savingCard ? 'Saving…' : 'Save card'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Remove card confirm */}
      <Modal open={removeConfirmOpen} onClose={() => setRemoveConfirmOpen(false)} title="Remove payment method">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Remove the card ending in {card?.last4}? You'll need to add a new card to stay on a paid plan.
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setRemoveConfirmOpen(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={removeCard}>Remove card</button>
        </div>
      </Modal>

    </div>
  )
}
