import { useEffect, useState } from 'react'
import { campaigns as campaignsApi, unipile } from '../lib/api'

function normaliseProfile(raw) {
  const base = raw?.user || raw?.author || raw
  const id =
    base?.provider_id || base?.id || base?.public_identifier || Math.random().toString(36).slice(2)
  const name =
    base?.name ||
    [base?.first_name, base?.last_name].filter(Boolean).join(' ') ||
    'Unknown'
  const title = base?.headline || base?.job_title || base?.title || ''
  const company =
    base?.company ||
    base?.current_company ||
    base?.organization_name ||
    ''
  const location = base?.location || base?.region || ''
  const linkedinUrl =
    base?.url ||
    base?.linkedin_url ||
    (base?.public_identifier ? `https://www.linkedin.com/in/${base.public_identifier}` : '')
  return { id, name, title, company, location, linkedinUrl, providerId: id }
}

export default function LeadFinderModal({ open, onClose, onImport, campaignId }) {
  const [tab, setTab] = useState('url')
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')

  // URL mode
  const [profileUrl, setProfileUrl] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileResult, setProfileResult] = useState(null)
  const [profileError, setProfileError] = useState('')

  // Engagers mode
  const [postUrl, setPostUrl] = useState('')
  const [engagerType, setEngagerType] = useState('likers')
  const [engagersResults, setEngagersResults] = useState([])
  const [engagersLoading, setEngagersLoading] = useState(false)
  const [engagersError, setEngagersError] = useState('')

  // Selection + import
  const [selected, setSelected] = useState(new Set())
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open) return
    unipile.getAccounts()
      .then(data => {
        const items = data?.items || []
        setAccounts(items)
        if (items.length > 0) setAccountId(items[0].id)
      })
      .catch(() => {})
  }, [open])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTab('url')
      setProfileUrl('')
      setProfileResult(null)
      setProfileError('')
      setPostUrl('')
      setEngagersResults([])
      setEngagersError('')
      setSelected(new Set())
    }
  }, [open])

  async function handleProfileSearch() {
    if (!profileUrl.trim() || !accountId) return
    setProfileLoading(true)
    setProfileError('')
    setProfileResult(null)
    setSelected(new Set())
    try {
      const data = await unipile.getLinkedInProfile(accountId, profileUrl.trim())
      const profile = normaliseProfile(data)
      setProfileResult(profile)
    } catch (err) {
      setProfileError(err.message || 'Profile not found')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleEngagersSearch() {
    if (!postUrl.trim() || !accountId) return
    setEngagersLoading(true)
    setEngagersError('')
    setEngagersResults([])
    setSelected(new Set())
    try {
      const data = await unipile.getPostEngagers(accountId, postUrl.trim(), engagerType)
      const items = data?.items || data?.objects || data?.reactions || data?.comments || data?.users || []
      setEngagersResults(items.map(normaliseProfile))
    } catch (err) {
      setEngagersError(err.message || 'Could not fetch post engagers')
    } finally {
      setEngagersLoading(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(results) {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map(r => r.id)))
    }
  }

  async function handleImport() {
    const allResults = tab === 'url' && profileResult
      ? [profileResult]
      : engagersResults
    const leadsToAdd = [...selected].map(id => allResults.find(r => r.id === id)).filter(Boolean)
    if (!leadsToAdd.length) return
    setImporting(true)
    try {
      await campaignsApi.importLeads(campaignId, { leads: leadsToAdd })
      onImport()
      onClose()
    } catch (err) {
      // keep modal open so user can retry
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  const allResults = tab === 'url' && profileResult ? [profileResult] : engagersResults
  const selectedCount = selected.size

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box animate-fade-in" style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Lead Finder</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Account selector */}
        {accounts.length > 0 && (
          <div style={{ padding: '0 24px 12px', borderBottom: '1px solid var(--border)' }}>
            <select
              className="input"
              style={{ fontSize: 13, padding: '6px 10px', height: 'auto' }}
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>
              ))}
            </select>
          </div>
        )}

        {accounts.length === 0 && (
          <div style={{ padding: '12px 24px', fontSize: 13, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            No LinkedIn accounts connected. Connect one in Settings → Workspace.
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'url', label: 'Profile URL' },
            { id: 'engagers', label: 'Post Engagers' },
          ].map(t => (
            <button
              key={t.id}
              className={`filter-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => { setTab(t.id); setSelected(new Set()) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'url' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  className="input"
                  placeholder="https://www.linkedin.com/in/username"
                  value={profileUrl}
                  onChange={e => setProfileUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProfileSearch()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!profileUrl.trim() || !accountId || profileLoading}
                  onClick={handleProfileSearch}
                >
                  {profileLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              {profileError && (
                <div style={{ color: 'var(--danger, #e55)', fontSize: 13, marginBottom: 12 }}>{profileError}</div>
              )}

              {profileResult && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'var(--surface)',
                    border: `1px solid ${selected.has(profileResult.id) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSelect(profileResult.id)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(profileResult.id)}
                    onChange={() => toggleSelect(profileResult.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0 }}
                  />
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'var(--accent-subtle)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14, flexShrink: 0,
                    }}
                  >
                    {profileResult.name?.[0] || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{profileResult.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {profileResult.title}{profileResult.company ? ` · ${profileResult.company}` : ''}
                    </div>
                    {profileResult.location && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profileResult.location}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'engagers' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  className="input"
                  placeholder="https://www.linkedin.com/posts/…"
                  value={postUrl}
                  onChange={e => setPostUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEngagersSearch()}
                  style={{ flex: 1 }}
                />
                <select
                  className="input"
                  style={{ width: 130, fontSize: 13, padding: '6px 10px', height: 'auto' }}
                  value={engagerType}
                  onChange={e => setEngagerType(e.target.value)}
                >
                  <option value="likers">Likers</option>
                  <option value="comments">Commenters</option>
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!postUrl.trim() || !accountId || engagersLoading}
                  onClick={handleEngagersSearch}
                >
                  {engagersLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              {engagersError && (
                <div style={{ color: 'var(--danger, #e55)', fontSize: 13, marginBottom: 12 }}>{engagersError}</div>
              )}

              {engagersResults.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{engagersResults.length} people found</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(engagersResults)}>
                      {selected.size === engagersResults.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {engagersResults.map(r => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px',
                          background: 'var(--surface)',
                          border: `1px solid ${selected.has(r.id) ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius)',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleSelect(r.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <div
                          style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: 'var(--accent-subtle)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 12, flexShrink: 0,
                          }}
                        >
                          {r.name?.[0] || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.title}{r.company ? ` · ${r.company}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={selectedCount === 0 || importing || !accountId}
            onClick={handleImport}
          >
            {importing ? 'Importing…' : `Add ${selectedCount > 0 ? selectedCount : ''} to Campaign →`}
          </button>
        </div>
      </div>
    </div>
  )
}
