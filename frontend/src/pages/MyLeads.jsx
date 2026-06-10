import { useEffect, useMemo, useState } from 'react'
import { leads as leadsApi } from '../lib/api'
import { SkeletonTableRows } from '../components/Skeleton'

export default function MyLeads() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

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

  const uniqueStatuses = useMemo(() => [...new Set(list.map(l => l.status || 'Not contacted'))], [list])

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const visibleList = useMemo(() => {
    let filtered = list
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter) {
      filtered = filtered.filter(l => (l.status || 'Not contacted') === statusFilter)
    }
    return [...filtered].sort((a, b) => {
      const av = (a[sortBy] || '').toLowerCase()
      const bv = (b[sortBy] || '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [list, search, statusFilter, sortBy, sortDir])

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
          {!loading && (visibleList.length !== list.length ? `${visibleList.length} of ${list.length}` : `${list.length} saved`)}
        </span>
      </div>

      {list.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ fontSize: 12, padding: '6px 10px', height: 'auto', flex: '1 1 200px', maxWidth: 280 }}
            placeholder="Search by name, company, title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            style={{ fontSize: 12, padding: '6px 10px', height: 'auto', flex: '0 0 auto' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="badge badge-danger" style={{ marginBottom: 12 }}>{error}</div>
      )}

      {loading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th/><th>Name</th><th>Job Title</th><th>Company</th><th>Location</th><th>Status</th><th>LinkedIn</th><th/></tr></thead>
            <tbody><SkeletonTableRows rows={6} cols={8} /></tbody>
          </table>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <h3>No saved leads yet</h3>
          <p>Use the Lead Finder to search LinkedIn and save leads here.</p>
        </div>
      ) : (
        <div className="table-wrap data-loaded">
          <table>
            <thead>
              <tr>
                <th></th>
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'title', label: 'Job Title' },
                  { key: 'company', label: 'Company' },
                  { key: 'location', label: 'Location' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => handleSort(key)}
                  >
                    {label}{' '}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {sortBy === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                ))}
                <th>Status</th>
                <th>LinkedIn</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleList.map(lead => (
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
