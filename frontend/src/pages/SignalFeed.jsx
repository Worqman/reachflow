import { useEffect, useMemo, useState } from 'react'
import { agents as agentsApi, campaigns as campaignsApi, leads as leadsApi } from '../lib/api'
import Modal from '../components/Modal'

const CLASSIFICATION_COLORS = { high_intent: 'badge-signal', warm: 'badge-warning', low_intent: 'badge-muted' }
const CLASSIFICATION_LABELS = { high_intent: 'High intent', warm: 'Warm', low_intent: 'Low intent' }
const SIGNAL_TYPE_LABELS = {
  job_change: 'Job Change', funding_round: 'Funding Round', company_growth: 'Company Growth',
  competitor_follow: 'Competitor Follow', keyword_post: 'Keyword Post', post_activity: 'Post Activity',
}
const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]
const DISMISSED_STATUSES = ['dismissed', 'not_relevant']

// Most recent contributing-signal date for a score row — used for the
// date filter/sort and the per-row "date detected" display.
function mostRecentSignalDate(score) {
  const signals = score.breakdown?.signals || []
  if (!signals.length) return score.lastEvaluatedAt
  return signals.reduce((latest, s) =>
    !latest || new Date(s.createdAt) > new Date(latest) ? s.createdAt : latest, null)
}

function topSignal(score) {
  const signals = score.breakdown?.signals || []
  if (!signals.length) return null
  return [...signals].sort((a, b) => (b.decayedPoints || 0) - (a.decayedPoints || 0))[0]
}

export default function SignalFeed() {
  const [agentsList, setAgentsList] = useState([])
  const [agentId, setAgentId] = useState('')
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [campaignList, setCampaignList] = useState([])

  const [tab, setTab] = useState('opportunities') // opportunities | raw
  const [showDismissed, setShowDismissed] = useState(false)
  const [typeFilter, setTypeFilter] = useState([])
  const [minScore, setMinScore] = useState(0)
  const [dateRange, setDateRange] = useState('all')
  const [sortBy, setSortBy] = useState('score') // score | date
  const [sortDir, setSortDir] = useState('desc')

  const [actioningId, setActioningId] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [heldInfo, setHeldInfo] = useState(null)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    agentsApi.list()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setAgentsList(list)
        setAgentId((prev) => prev || list[0]?.id || '')
      })
      .catch(() => {})
    campaignsApi.list().then((data) => setCampaignList(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!agentId) { setScores([]); setLoading(false); return }
    setLoading(true)
    agentsApi.listScores(agentId)
      .then((data) => setScores(Array.isArray(data) ? data : []))
      .catch(() => setScores([]))
      .finally(() => setLoading(false))
  }, [agentId])

  const allTypes = useMemo(() => {
    const set = new Set()
    scores.forEach((s) => (s.breakdown?.signals || []).forEach((sig) => set.add(sig.type)))
    return [...set]
  }, [scores])

  function toggleType(t) {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const filtered = useMemo(() => {
    let rows = scores.filter((s) =>
      tab === 'opportunities'
        ? ['warm', 'high_intent'].includes(s.classification)
        : s.classification === 'low_intent'
    )
    if (!showDismissed) rows = rows.filter((s) => !DISMISSED_STATUSES.includes(s.status))
    if (typeFilter.length) {
      rows = rows.filter((s) => (s.breakdown?.signals || []).some((sig) => typeFilter.includes(sig.type)))
    }
    if (minScore > 0) rows = rows.filter((s) => s.score >= minScore)
    if (dateRange !== 'all') {
      const cutoff = Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000
      rows = rows.filter((s) => {
        const d = mostRecentSignalDate(s)
        return d && new Date(d).getTime() >= cutoff
      })
    }
    return [...rows].sort((a, b) => {
      if (sortBy === 'score') return sortDir === 'desc' ? b.score - a.score : a.score - b.score
      const ad = new Date(mostRecentSignalDate(a) || 0).getTime()
      const bd = new Date(mostRecentSignalDate(b) || 0).getTime()
      return sortDir === 'desc' ? bd - ad : ad - bd
    })
  }, [scores, tab, showDismissed, typeFilter, minScore, dateRange, sortBy, sortDir])

  async function setStatus(score, status) {
    setActioningId(score.providerId)
    try {
      await agentsApi.updateScoreStatus(agentId, score.providerId, status)
      setScores((prev) => prev.map((s) =>
        s.providerId === score.providerId ? { ...s, status, statusUpdatedAt: new Date().toISOString() } : s
      ))
    } catch { /* leave row as-is on failure */ }
    setActioningId(null)
  }

  async function handleSaveLead(score) {
    setActioningId(score.providerId)
    try {
      await leadsApi.create({
        name: score.leadName, title: score.title, company: score.company, location: score.location,
        linkedinUrl: score.linkedinUrl, profilePictureUrl: score.profilePictureUrl, providerId: score.providerId,
      })
      await setStatus(score, 'saved')
    } catch { /* ignore — user can retry */ }
    setActioningId(null)
  }

  function openCampaignPicker(score) {
    setPickerFor(score)
    setHeldInfo(null)
    setAddError('')
  }

  function closeCampaignPicker() {
    setPickerFor(null)
    setHeldInfo(null)
    setAddError('')
  }

  async function addToCampaign(campaignId, force = false) {
    const score = heldInfo?.score || pickerFor
    if (!score) return
    setActioningId(score.providerId)
    setAddError('')
    try {
      const res = await campaignsApi.importLeads(campaignId, {
        leads: [{
          name: score.leadName, title: score.title, company: score.company, location: score.location,
          linkedinUrl: score.linkedinUrl, providerId: score.providerId, force,
        }],
      })
      if (res?.held?.length && !force) {
        setHeldInfo({ score, campaignId, held: res.held[0] })
      } else {
        closeCampaignPicker()
        await setStatus(score, 'added_to_campaign')
      }
    } catch (err) {
      setAddError(err.message || 'Could not add lead to campaign') // leave picker open — user can retry
    }
    setActioningId(null)
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200 }} className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Signal Feed</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            Leads worth reviewing before they enter outreach — why this person, why now, what to do next.
          </div>
        </div>
        {agentsList.length > 0 && (
          <select className="input" style={{ minWidth: 220 }} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agentsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {agentsList.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Create an AI agent first — intent scores are computed against an agent's ICP.
        </div>
      ) : (
        <>
          {/* Tabs — deliberately two separate lists, not one table with a color hint,
              so raw signals and qualified opportunities read as genuinely different things. */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            {[{ v: 'opportunities', label: 'Opportunities' }, { v: 'raw', label: 'Raw Signals' }].map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                  color: tab === t.v ? 'var(--signal)' : 'var(--text-muted)',
                  borderBottom: tab === t.v ? '2px solid var(--signal)' : '2px solid transparent', marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
            {allTypes.map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`badge ${typeFilter.includes(t) ? 'badge-signal' : 'badge-muted'}`}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {SIGNAL_TYPE_LABELS[t] || t}
              </button>
            ))}
            <select className="input" style={{ fontSize: 12, padding: '5px 8px', height: 'auto', width: 140 }} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
              {DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Min score</span>
              <input
                type="number" min={0} max={100} className="input" style={{ width: 60, fontSize: 12, padding: '5px 6px', height: 'auto' }}
                value={minScore} onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              />
            </div>
            <select
              className="input" style={{ fontSize: 12, padding: '5px 8px', height: 'auto', width: 140 }}
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => { const [b, d] = e.target.value.split(':'); setSortBy(b); setSortDir(d) }}
            >
              <option value="score:desc">Score: high → low</option>
              <option value="score:asc">Score: low → high</option>
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
              Show dismissed
            </label>
          </div>

          {/* Feed */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              {tab === 'opportunities'
                ? 'No qualified opportunities yet — mark post engagers as signals (from a campaign\'s Post Engagers tool) to start scoring leads.'
                : 'No raw signals in this range.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((score) => {
                const top = topSignal(score)
                const dismissed = DISMISSED_STATUSES.includes(score.status)
                const busy = actioningId === score.providerId
                return (
                  <div key={score.id} className="card" style={{ padding: 18, opacity: dismissed ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {score.profilePictureUrl ? (
                          <img src={score.profilePictureUrl} alt={score.leadName} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--signal-subtle)', color: 'var(--signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                            {score.leadName?.[0] || '?'}
                          </div>
                        )}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{score.leadName || score.providerId}</span>
                            <span className={`badge ${CLASSIFICATION_COLORS[score.classification] || 'badge-muted'}`}>
                              {CLASSIFICATION_LABELS[score.classification] || score.classification} · {score.score}
                            </span>
                            {dismissed && (
                              <span className="badge badge-muted">{score.status === 'dismissed' ? 'Dismissed' : 'Not relevant'}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {[score.title, score.company].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        Confidence {score.confidence}%
                        <div>{score.signalCount} signal{score.signalCount !== 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10 }}>{score.reason}</div>

                    {top && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{SIGNAL_TYPE_LABELS[top.type] || top.type}</span>
                        <span>· {top.createdAt ? new Date(top.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                        {(top.metadata?.postUrl || score.linkedinUrl) && (
                          <a href={top.metadata?.postUrl || score.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--signal)' }}>
                            View source ↗
                          </a>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-primary btn-sm" disabled={busy}
                        onClick={() => score.recommendedAction?.action === 'add_to_campaign' ? openCampaignPicker(score) : handleSaveLead(score)}
                      >
                        {score.recommendedAction?.label || 'Save lead'}
                      </button>
                      {score.recommendedAction?.action !== 'add_to_campaign' && (
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openCampaignPicker(score)}>
                          Add to campaign
                        </button>
                      )}
                      {score.recommendedAction?.action !== 'save_lead' && score.status !== 'saved' && (
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleSaveLead(score)}>
                          Save lead
                        </button>
                      )}
                      {dismissed ? (
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(score, 'new')}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(score, 'dismissed')}>
                            Dismiss
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(score, 'not_relevant')}>
                            Not relevant
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!pickerFor} onClose={closeCampaignPicker} title={heldInfo ? 'Held — below intent threshold' : 'Add to Campaign'} width={440}>
        {addError && (
          <div style={{ color: 'var(--danger, #e55)', fontSize: 13, marginBottom: 14 }}>{addError}</div>
        )}
        {heldInfo ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
              {heldInfo.score.leadName} scored {heldInfo.held.score}/100 for this campaign — below the {heldInfo.held.threshold} required to auto-add.
            </p>
            {heldInfo.held.reason && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{heldInfo.held.reason}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={actioningId === heldInfo.score.providerId} onClick={() => addToCampaign(heldInfo.campaignId, true)}>
              Add anyway
            </button>
          </>
        ) : campaignList.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No campaigns found. Create one first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {campaignList.map((c) => (
              <button
                key={c.id}
                disabled={actioningId === pickerFor?.providerId}
                onClick={() => addToCampaign(c.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.status === 'active' ? '● Active' : 'Paused'}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
