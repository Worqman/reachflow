import { useEffect, useMemo, useState } from 'react'
import { leads as leadsApi, leadLists as listsApi } from '../lib/api'
import { SkeletonTableRows } from '../components/Skeleton'
import Modal from '../components/Modal'
import './MyLeads.css'

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

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
    if (activeListId) return list.filter(l => l.listId === activeListId)
    return list
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
    e?.preventDefault()
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

  const SortArrow = ({ col }) => {
    if (sortBy !== col) return null
    return sortDir === 'asc'
      ? <svg style={{ width: 10, height: 10, marginLeft: 3 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
      : <svg style={{ width: 10, height: 10, marginLeft: 3 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
  }

  return (
    <div className="my-leads-page animate-fade-in">

      {/* Header */}
      <div className="leads-header">
        <div>
          <div className="leads-title">My Leads</div>
          <div className="leads-subtitle">
            {loading ? 'Loading…' : `${list.length} saved lead${list.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button className="leads-btn-new-list" onClick={() => setCreateModalOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New List
        </button>
      </div>

      {/* List tabs */}
      {leadLists.length > 0 && (
        <div className="leads-list-tabs">
          <button
            className={`leads-list-tab${activeListId === null ? ' active' : ''}`}
            onClick={() => setActiveListId(null)}
          >
            All Leads
            <span className="leads-tab-count">{list.length}</span>
          </button>

          {leadLists.map(ll => (
            renamingId === ll.id ? (
              <input
                key={ll.id}
                autoFocus
                className="leads-tab-rename"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => handleRenameList(ll.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameList(ll.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
              />
            ) : (
              <button
                key={ll.id}
                className={`leads-list-tab${activeListId === ll.id ? ' active' : ''}`}
                onClick={() => setActiveListId(ll.id)}
                onDoubleClick={() => { setRenamingId(ll.id); setRenameValue(ll.name) }}
                title="Double-click to rename"
              >
                {ll.name}
                <span className="leads-tab-count">{listCounts[ll.id] || 0}</span>
                {activeListId === ll.id && (
                  <span
                    className="leads-tab-del"
                    role="button"
                    onClick={e => { e.stopPropagation(); handleDeleteList(ll.id) }}
                    title="Delete list"
                  >
                    ×
                  </span>
                )}
              </button>
            )
          ))}
        </div>
      )}

      {/* Table card */}
      <div className="leads-table-card">

        {/* Toolbar */}
        <div className="leads-toolbar">
          <span className="leads-toolbar-count">
            {loading ? '…' : (
              visibleList.length !== baseFiltered.length
                ? `${visibleList.length} / ${baseFiltered.length}`
                : `${visibleList.length} lead${visibleList.length !== 1 ? 's' : ''}`
            )}
          </span>
          <div className="leads-toolbar-spacer" />
          {list.length > 0 && (
            <>
              <div className="leads-search-wrap">
                <span className="leads-search-icon"><IconSearch /></span>
                <input
                  className="leads-toolbar-search"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
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

        {error && <div className="leads-error">{error}</div>}

        {/* Table */}
        <div className="animate-fade-in">
          {loading ? (
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}></th>
                  <th>Name</th>
                  <th>Title & Company</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody><SkeletonTableRows rows={8} cols={6} /></tbody>
            </table>
          ) : visibleList.length === 0 ? (
            <div className="leads-empty">
              <div className="leads-empty-icon"><IconUsers /></div>
              {activeListId ? (
                <>
                  <div className="leads-empty-title">No leads in this list</div>
                  <div className="leads-empty-desc">Use Lead Finder to search LinkedIn and save leads to "{activeListName}".</div>
                </>
              ) : (
                <>
                  <div className="leads-empty-title">No saved leads yet</div>
                  <div className="leads-empty-desc">Use Lead Finder to discover LinkedIn profiles and save them here.</div>
                </>
              )}
            </div>
          ) : (
            <table className="leads-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}></th>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'title', label: 'Title & Company' },
                    { key: 'location', label: 'Location' },
                  ].map(({ key, label }) => (
                    <th key={key} className="sortable" onClick={() => handleSort(key)}>
                      {label}<SortArrow col={key} />
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
                        <img src={lead.profilePictureUrl} alt={lead.name} className="lead-avatar" />
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
                      <div className="lead-name" style={{ fontWeight: 500 }}>{lead.title || '—'}</div>
                      {lead.company && <div className="lead-meta">{lead.company}</div>}
                    </td>
                    <td>
                      <span className="lead-meta">{lead.location || '—'}</span>
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
                          <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="lead-linkedin-btn">
                            <IconLinkedIn />
                            LinkedIn
                          </a>
                        )}
                        <button
                          className="lead-remove-btn"
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

      {/* Create List Modal */}
      <Modal open={createModalOpen} onClose={() => { setCreateModalOpen(false); setNewListName('') }} title="New List">
        <div className="input-group">
          <label className="input-label">List name</label>
          <input
            className="input"
            placeholder="e.g. Hot Prospects, Tech CEOs…"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && newListName.trim() && handleCreateList()}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => { setCreateModalOpen(false); setNewListName('') }}>Cancel</button>
          <button className="btn btn-primary" disabled={creatingList || !newListName.trim()} onClick={handleCreateList}>
            {creatingList ? 'Creating…' : 'Create List'}
          </button>
        </div>
      </Modal>

    </div>
  )
}
