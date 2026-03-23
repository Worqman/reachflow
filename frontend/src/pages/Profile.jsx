import { useEffect, useMemo, useState } from 'react'
import { profiles as profilesApi } from '../lib/api'
import './Profile.css'

function initials(name) {
  const safe = (name || '').trim()
  if (!safe) return '?'
  const parts = safe.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase()).join('')
}

export default function Profile() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await profilesApi.list()
        if (!alive) return
        setProfiles(res.profiles || [])
      } catch (e) {
        if (!alive) return
        setError(e?.message || 'Failed to load profiles')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const countLabel = useMemo(() => {
    const n = profiles.length
    return `${n} profile${n === 1 ? '' : 's'}`
  }, [profiles.length])

  return (
    <div className="page animate-fade-in">
      <div className="page-header profile-page-header">
        <div>
          <h1 className="page-title">Profiles</h1>
          <div className="profile-subtitle">{countLabel}</div>
        </div>
      </div>

      {error && (
        <div className="card profile-error">
          <div className="badge badge-danger">Error</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {error}
          </div>
        </div>
      )}

      <div className="card profile-card">
        {loading ? (
          <div className="profile-loading">Loading profiles…</div>
        ) : profiles.length === 0 ? (
          <div className="profile-empty">
            <div style={{ fontSize: 28, marginBottom: 10, color: 'var(--text-muted)' }}>◉</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No profiles found</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Create an account (Register) to insert a row into the <code>profiles</code> table.
            </div>
          </div>
        ) : (
          <div className="profile-grid">
            {profiles.map((p) => (
              <div key={p.id} className="profile-item">
                <div className="profile-avatar">{initials(p.full_name || p.company_name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="profile-name">
                    {p.full_name || 'Unnamed user'}
                  </div>
                  <div className="profile-meta">
                    <span>{p.company_name || 'No company'}</span>
                    <span className="profile-dot">•</span>
                    <span className="profile-id">ID: {String(p.id).slice(0, 8)}…</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

