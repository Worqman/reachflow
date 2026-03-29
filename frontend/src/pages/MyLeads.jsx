import { useEffect, useState } from 'react'
import { leads as leadsApi } from '../lib/api'

export default function MyLeads() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await leadsApi.list()
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await leadsApi.delete(id)
      setList(prev => prev.filter(l => l.id !== id))
    } catch {}
    setDeletingId(null)
  }

  return (
    <div className="page animate-fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">My Leads</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {!loading && `${list.length} saved`}
        </span>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ marginBottom: 12 }}>{error}</div>
      )}

      {loading ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>↻</div>
          <p style={{ color: 'var(--text-muted)' }}>Loading leads…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <h3>No saved leads yet</h3>
          <p>Use the Lead Finder to search LinkedIn and save leads here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Job Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
                <th>LinkedIn</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(lead => (
                <tr key={lead.id}>
                  <td style={{ width: 36 }}>
                    {lead.profilePictureUrl ? (
                      <img
                        src={lead.profilePictureUrl}
                        alt={lead.name}
                        style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--signal-subtle)', color: 'var(--signal)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 12,
                        }}
                      >
                        {lead.name?.[0] || '?'}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{lead.name || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{lead.title || '—'}</td>
                  <td>{lead.company || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lead.location || '—'}</td>
                  <td>
                    <span className="badge badge-muted">{lead.status || 'Not contacted'}</span>
                  </td>
                  <td>
                    {lead.linkedinUrl ? (
                      <a
                        href={lead.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--signal)' }}
                      >
                        View ↗
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--text-muted)', fontSize: 11 }}
                      disabled={deletingId === lead.id}
                      onClick={() => handleDelete(lead.id)}
                    >
                      {deletingId === lead.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
