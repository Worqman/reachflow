import { useEffect, useState } from 'react'
import { credits as creditsApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { Sk } from '../components/Skeleton'
import './Credits.css'

const REASON_LABELS = {
  connection_request: 'Connection request',
  message: 'Message',
  inmail: 'InMail',
  comment_post: 'Comment',
  manual_grant: 'Credits added',
  trial_grant: 'Trial credits',
  debit: 'Usage',
}

function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function CreditsTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await creditsApi.get()
      setBalance(res?.balance ?? 0)
      setTransactions(res?.transactions || [])
    } catch (e) {
      setError(e?.message || 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const low = balance != null && balance <= 20

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Credits</h2>
          <p className="settings-section-desc">Connection requests, messages, InMails and comments each use credits from your workspace balance.</p>
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      <div className="credits-balance-card">
        <div className="credits-balance-label">Current balance</div>
        {loading ? (
          <Sk w={140} h={40} />
        ) : (
          <div className={`credits-balance-value${low ? ' low' : ''}`}>{balance?.toLocaleString() ?? '—'}</div>
        )}
        {low && !loading && (
          <div className="credits-balance-warning">Running low — campaigns will pause sends once this hits 0.</div>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Usage history</div>
        {loading ? (
          <div className="credits-history-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="credits-tx-row"><Sk w="40%" h={13} /><Sk w={50} h={13} /></div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="settings-empty">No credit activity yet.</div>
        ) : (
          <div className="credits-tx-list">
            {transactions.map(tx => (
              <div key={tx.id} className="credits-tx-row">
                <div>
                  <div className="credits-tx-reason">{reasonLabel(tx.reason)}</div>
                  <div className="credits-tx-date">{formatDate(tx.created_at)}</div>
                </div>
                <div className={`credits-tx-amount${tx.amount < 0 ? ' negative' : ' positive'}`}>
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
