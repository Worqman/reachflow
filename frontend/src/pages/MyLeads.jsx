import { useEffect, useMemo, useState } from 'react'
import { leads as leadsApi, leadLists as listsApi } from '../lib/api'
import { SkeletonTableRows } from '../components/Skeleton'
import './MyLeads.css'

function statusClass(status) {
  if (!status || status === 'Not contacted') return 'not-contacted'
  const s = status.toLowerCase()
  if (s === 'connected') return 'connected'
  if (s === 'replied') return 'replied'
  if (s === 'invited') return 'invited'
  if (s === 'booked') return 'booked'
  return 'not-contacted'
}

export default function MyLeads() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // Lists sidebar
  const [leadLists, setLeadLists] = useState([])
  const [activeListId, setActiveListId] = useState(null)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingListId, setDeletingListId] = useState(null)

  async function loadLeads() {
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

  async function loadLists() {
    try {
      const data = await listsApi.list()
      setLeadLists(Array.isArray(data) ? data : [])
    } catch {}
  }

  useEffect(() => {
    loadLeads()
    loadLists()
  }, [])

  const listCounts = useMemo(() => {
    const counts = {}
    list.forEach(l => {
      if (l.listId) counts[l.listId] = (counts[l.listId] || 0) + 1
    })
    return counts
  }, [list])

  const uniqueStatuses = useMemo(() => [...new Set(list.map(l => l.status || 'Not contacted'))], [list])

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const baseFiltered = useMemo(() => {
    let filtered = list
    if (activeListId) filtered = filtered.filter(l => l.listId === activeListId)
    return filtered
  }, [list, activeListId])

  const visibleList = useMemo(() => {
    let filtered = baseFiltered
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
  }, [baseFiltered, search, statusFilter, sortBy, sortDir])

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await leadsApi.delete(id)
      setList(prev => prev.filter(l => l.id !== id))
    } catch {}
    setDeletingId(null)
  }

  async function handleCreateList(e) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    setCreatingList(true)
    try {
      const created = await listsApi.create(name)
      setLeadLists(prev => [...prev, created])
      setNewListName('')
      setCreateModalOpen(false)
      setActiveListId(created.id)
    } catch {}
    setCreatingList(false)
  }

  async function handleRenameList(id) {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }
    try {
      const updated = await listsApi.update(id, name)
      setLeadLists(prev => prev.map(l => l.id === id ? { ...l, name: updated.name } : l))
    } catch {}
    setRenamingId(null)
  }

  async function handleDeleteList(id) {
    setDeletingListId(id)
    try {
      await listsApi.delete(id)
      setLeadLists(prev => prev.filter(l => l.id !== id))
      setList(prev => prev.map(l => l.listId === id ? { ...l, listId: null } : l))
      if (activeListId === id) setActiveListId(null)
    } catch {}
    setDeletingListId(null)
  }

  const activeListName = activeListId
    ? leadLists.find(l => l.id === activeListId)?.name || 'List'
    : 'All Leads'

  const sortArrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="my-leads-layout">

      {/* ── Sidebar ── */}
      <aside className="leads-sidebar">
        <div className="leads-sidebar-header">
          <div className="leads-sidebar-title">Leads</div>
          <div className="leads-sidebar-subtitle">My Leads</div>
        </div>

        <nav className="leads-sidebar-nav">
          {/* All Leads */}
          <button
            className={`leads-nav-item${activeListId === null ? ' active' : ''}`}
            onClick={() => setActiveListId(null)}
          >
            <span className="leads-nav-icon">◉</span>
            <span className="leads-nav-label">All Leads</span>
            <span className="leads-nav-count">{list.length}</span>
          </button>

          {leadLists.length > 0 && <div className="leads-sidebar-divider" />}

          {leadLists.map(ll => (
            <div key={ll.id} className="leads-list-row">
              {renamingId === ll.id ? (
                <input
                  autoFocus
                  className="leads-rename-input"
                  style={{ margin: '3px 4px' }}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameList(ll.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameList(ll.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <>
                  <button
                    className={`leads-nav-item${activeListId === ll.id ? ' active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setActiveListId(ll.id)}
                  >
                    <span className="leads-nav-icon">≡</span>
                    <span className="leads-nav-label">{ll.name}</span>
                    <span className="leads-nav-count">{listCounts[ll.id] || 0}</span>
                  </button>
                  <div className="leads-list-actions">
                    <button
                      className="leads-list-action-btn"
                      title="Rename"
                      onClick={() => { setRenamingId(ll.id); setRenameValue(ll.name) }}
                    >
                      ✎
                    </button>
                    <button
                      className="leads-list-action-btn danger"
                      title="Delete list"
                      disabled={deletingListId === ll.id}
                      onClick={() => handleDeleteList(ll.id)}
                    >
                      {deletingListId === ll.id ? '…' : '✕'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="leads-sidebar-footer">
          <button
            className="leads-new-list-btn"
            onClick={() => setCreateModalOpen(true)}
          >
            <span className="leads-new-list-plus">+</span>
            New List
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="leads-main">

        {/* Toolbar */}
        <div className="leads-toolbar">
          <span className="leads-toolbar-title">{activeListName}</span>
          {!loading && (
            <span className="leads-toolbar-count">
              {visibleList.length !== baseFiltered.length
                ? `${visibleList.length} / ${baseFiltered.length}`
                : visibleList.length}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {list.length > 0 && (
            <>
              <input
                className="leads-toolbar-search"
                placeholder="Search name, company, title…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select
                className="leads-toolbar-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {uniqueStatuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {error && (
          <div style={{ padding: '12px 24px' }}>
            <div className="badge badge-danger">{error}</div>
          </div>
        )}

        {/* Table */}
        <div className="leads-table-wrap animate-fade-in">
          {loading ? (
            <table className="leads-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>LinkedIn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody><SkeletonTableRows rows={8} cols={7} /></tbody>
            </table>
          ) : visibleList.length === 0 ? (
            <div className="leads-empty">
              <div className="leads-empty-icon">◉</div>
              {activeListId ? (
                <>
                  <h3>No leads in this list</h3>
                  <p>Use Lead Finder to search LinkedIn and save leads to "{activeListName}".</p>
                </>
              ) : (
                <>
                  <h3>No saved leads yet</h3>
                  <p>Use Lead Finder to discover LinkedIn profiles and save them here.</p>
                </>
              )}
            </div>
          ) : (
            <table className="leads-table data-loaded">
              <thead>
                <tr>
                  <th style={{ width: 48 }}></th>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'title', label: 'Title & Company' },
                    { key: 'location', label: 'Location' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      className="sortable"
                      onClick={() => handleSort(key)}
                    >
                      {label}{sortArrow(key)}
                    </th>
                  ))}
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleList.map(lead => (
                  <tr key={lead.id}>
                    <td style={{ width: 48, paddingRight: 0 }}>
                      {lead.profilePictureUrl ? (
                        <img
                          src={lead.profilePictureUrl}
                          alt={lead.name}
                          className="lead-avatar"
                        />
                      ) : (
                        <div className="lead-avatar-placeholder">
                          {lead.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="lead-name">{lead.name || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{lead.title || '—'}</div>
                      {lead.company && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {lead.company}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {lead.location || '—'}
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass(lead.status)}`}>
                        <span className="status-dot" />
                        {lead.status || 'Not contacted'}
                      </span>
                    </td>
                    <td>
                      <div className="lead-row-actions">
                        {lead.linkedinUrl && (
                          <a
                            href={lead.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="lead-linkedin-btn"
                          >
                            in ↗
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', fontSize: 11, padding: '3px 8px' }}
                          disabled={deletingId === lead.id}
                          onClick={() => handleDelete(lead.id)}
                        >
                          {deletingId === lead.id ? '…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Create List Modal ── */}
      {createModalOpen && (
        <div
          className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setCreateModalOpen(false)}
        >
          <form
            onSubmit={handleCreateList}
            className="animate-fade-in"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.04)',
              width: '100%',
              maxWidth: 320,
              padding: '28px 24px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  Create a list
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Organise your saved leads into groups
                </div>
              </div>
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                style={{ flexShrink: 0, marginTop: -2 }}
                onClick={() => { setCreateModalOpen(false); setNewListName('') }}
              >
                ✕
              </button>
            </div>

            {/* Input */}
            <input
              autoFocus
              className="input"
              style={{ fontSize: 14 }}
              placeholder="e.g. Hot Prospects, Tech CEOs…"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setCreateModalOpen(false)}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setCreateModalOpen(false); setNewListName('') }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={creatingList || !newListName.trim()}
              >
                {creatingList ? 'Creating…' : 'Create List'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
