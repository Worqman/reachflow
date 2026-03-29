import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { getActiveWorkspaceId, onActiveWorkspaceChange, setActiveWorkspaceId } from '../lib/workspaceState'
import { members as membersApi } from '../lib/api'
import { useToast } from '../components/Toast'

export function Workspaces() {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [activeId, setActiveId] = useState(getActiveWorkspaceId())
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editingWs, setEditingWs] = useState(null)
  const [editName, setEditName] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!supabase) throw new Error('Supabase is not configured.')

      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const currentUser = userRes?.user || null
      setUser(currentUser)

      if (!currentUser) {
        setWorkspaces([])
        return
      }

      const { data, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false })

      if (wsErr) throw wsErr
      const owned = data || []

      const { data: memberRows, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', currentUser.id)

      // Silently ignore: table may not exist yet (500) or RLS recursion
      const safeMemberRows = memberErr ? [] : (memberRows || [])
      const memberIds = [...new Set(safeMemberRows.map((r) => r.workspace_id).filter(Boolean))]
      let memberWorkspaces = []
      if (memberIds.length) {
        const { data: joinedWs, error: joinedErr } = await supabase
          .from('workspaces')
          .select('*')
          .in('id', memberIds)
        if (joinedErr) throw joinedErr
        memberWorkspaces = joinedWs || []
      }

      const seen = new Set()
      const list = [...owned, ...memberWorkspaces].filter((ws) => {
        const id = String(ws?.id || '')
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      setWorkspaces(list)

      const stored = getActiveWorkspaceId()
      const nextActive = stored && list.some(w => String(w.id) === String(stored)) ? stored : (list[0]?.id || null)
      setActiveId(nextActive)
      if (!stored && nextActive) setActiveWorkspaceId(nextActive)
    } catch (e) {
      setError(e?.message || 'Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const unsub = onActiveWorkspaceChange((id) => setActiveId(id))
    return () => unsub?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreateModal() {
    setError('')
    setName('')
    setModalOpen(true)
  }

  function openEditModal(ws) {
    setError('')
    setEditingWs(ws)
    setEditName(ws?.name || '')
    setEditOpen(true)
  }

  async function createWorkspace() {
    setCreating(true)
    setError('')
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!user?.id) throw new Error('You must be signed in to create a workspace.')
      if (!name.trim()) throw new Error('Workspace name is required.')

      const { error: insertErr } = await supabase
        .from('workspaces')
        .insert({ name: name.trim(), owner_id: user.id })

      if (insertErr) throw insertErr
      await load()
      setModalOpen(false)
      setName('')
    } catch (e) {
      setError(e?.message || 'Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  async function saveWorkspaceEdits() {
    setEditing(true)
    setError('')
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!user?.id) throw new Error('You must be signed in to edit a workspace.')
      if (!editingWs?.id) throw new Error('Workspace not found.')
      if (!editName.trim()) throw new Error('Workspace name is required.')

      const { error: updateErr } = await supabase
        .from('workspaces')
        .update({ name: editName.trim() })
        .eq('id', editingWs.id)
        .eq('owner_id', user.id)

      if (updateErr) throw updateErr
      await load()
      setEditOpen(false)
      setEditingWs(null)
    } catch (e) {
      setError(e?.message || 'Failed to update workspace')
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="page animate-fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="page-title">Workspaces</h1>
        {user && !loading && (
          <button className="btn btn-secondary" onClick={openCreateModal}>
            + New workspace
          </button>
        )}
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 6, color: 'var(--text-muted)', fontSize: 13 }}>
            Loading workspaces…
          </div>
        ) : !user ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              You’re not signed in. Sign in to view your workspaces.
            </div>
            <Link className="btn btn-secondary" to="/login">Go to login</Link>
          </div>
        ) : workspaces.length === 0 ? (
          <div style={{ padding: 6 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Create your first workspace</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              You don’t have any workspaces yet. Create one to continue.
            </div>
            <button className="btn btn-primary" onClick={openCreateModal}>
              Create workspace
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className="card"
                style={{
                  padding: 16,
                  textAlign: 'left',
                  background: 'var(--surface-1)',
                  border: `1px solid ${String(ws.id) === String(activeId) ? 'rgba(57,255,135,0.25)' : 'var(--border)'}`,
                  boxShadow: String(ws.id) === String(activeId) ? 'var(--shadow-signal)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setActiveWorkspaceId(ws.id)
                  setActiveId(ws.id)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--text-primary)' }}>
                      {ws.name || 'Untitled workspace'}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      Workspace ID: {String(ws.id).slice(0, 8)}…
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(ws)
                      }}
                    >
                      Edit
                    </button>
                    <span className={`badge ${String(ws.id) === String(activeId) ? 'badge-signal' : 'badge-muted'}`}>
                      {String(ws.id) === String(activeId) ? 'Active' : 'Select'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        title="Create workspace"
        width={520}
      >
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Workspace name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Creative Deer"
            autoFocus
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={creating}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={createWorkspace} disabled={creating}>
            {creating ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => !editing && setEditOpen(false)}
        title="Edit workspace"
        width={520}
      >
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Workspace name</label>
          <input
            className="input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Workspace name"
            autoFocus
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={editing}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={saveWorkspaceEdits} disabled={editing}>
            {editing ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

export function Members() {
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [accepting, setAccepting] = useState(false)
  const [data, setData] = useState({ members: [], invites: [] })

  async function load(wsId = workspaceId) {
    if (!wsId) {
      setData({ members: [], invites: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await membersApi.list(wsId)
      setData({
        members: Array.isArray(res?.members) ? res.members : [],
        invites: Array.isArray(res?.invites) ? res.invites : [],
      })
    } catch (e) {
      setError(e?.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(workspaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    const unsub = onActiveWorkspaceChange((id) => setWorkspaceId(id))
    return () => unsub?.()
  }, [])

  useEffect(() => {
    let mounted = true
    const token = searchParams.get('token')
    if (!token || accepting) return

    async function acceptInviteFromUrl() {
      setAccepting(true)
      setBusy('accept')
      setError('')
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const currentUser = userRes?.user || null
        const acceptRes = await membersApi.accept({ token, user_id: currentUser?.id || null })
        if (!mounted) return
        const acceptedWorkspaceId = acceptRes?.workspace_id || null
        if (acceptedWorkspaceId) {
          setActiveWorkspaceId(acceptedWorkspaceId)
          setWorkspaceId(acceptedWorkspaceId)
        }
        toast('Invite accepted. You are now a member.', 'success')
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('token')
          return next
        }, { replace: true })
        await load(acceptedWorkspaceId || workspaceId)
      } catch (e) {
        if (!mounted) return
        setError(e?.message || 'Could not accept invite')
      } finally {
        if (!mounted) return
        setBusy('')
        setAccepting(false)
      }
    }

    acceptInviteFromUrl()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaceId])

  async function sendInvite(e) {
    e.preventDefault()
    if (!workspaceId) return
    setBusy('invite')
    setError('')
    try {
      await membersApi.invite({
        workspace_id: workspaceId,
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      setInviteEmail('')
      setInviteRole('member')
      toast('Invite sent', 'success')
      await load(workspaceId)
    } catch (err) {
      setError(err?.message || 'Failed to send invite')
    } finally {
      setBusy('')
    }
  }

  async function changeRole(memberId, role) {
    setBusy(`role:${memberId}`)
    setError('')
    try {
      await membersApi.updateRole(memberId, role)
      toast('Role updated', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to update role')
    } finally {
      setBusy('')
    }
  }

  async function removeMember(memberId) {
    setBusy(`remove:${memberId}`)
    setError('')
    try {
      await membersApi.remove(memberId)
      toast('Member removed', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to remove member')
    } finally {
      setBusy('')
    }
  }

  async function cancelInvite(inviteId) {
    setBusy(`cancel:${inviteId}`)
    setError('')
    try {
      await membersApi.cancelInvite(inviteId)
      toast('Invite cancelled', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to cancel invite')
    } finally {
      setBusy('')
    }
  }

  async function resendInvite(inviteId) {
    setBusy(`resend:${inviteId}`)
    setError('')
    try {
      await membersApi.resendInvite(inviteId)
      toast('Invite resent', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to resend invite')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Members</h1>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!workspaceId ? (
        <div className="card" style={{ maxWidth: 640 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No active workspace</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Select a workspace before inviting or managing members.
          </div>
          <Link className="btn btn-secondary" to="/workspaces">Go to workspaces</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, maxWidth: 960 }}>
          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Invite member</div>
            <form onSubmit={sendInvite} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8 }}>
              <input
                className="input"
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <select
                className="input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={busy === 'invite'}>
                {busy === 'invite' ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Pending invites</div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
            ) : data.invites.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pending invites.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.invites.map((inv) => (
                  <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{inv.email}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inv.role}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy === `resend:${inv.id}`}
                      onClick={() => resendInvite(inv.id)}
                    >
                      {busy === `resend:${inv.id}` ? 'Resending…' : 'Resend'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy === `cancel:${inv.id}`}
                      onClick={() => cancelInvite(inv.id)}
                    >
                      {busy === `cancel:${inv.id}` ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Confirmed members</div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
            ) : data.members.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No members yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.members.map((m) => {
                  const userEmail = m?.user?.email || 'Unknown email'
                  const roleLocked = m.role === 'owner'
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{userEmail}</div>
                      </div>
                      <select
                        className="input"
                        value={m.role}
                        disabled={roleLocked || busy === `role:${m.id}`}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={roleLocked || busy === `remove:${m.id}`}
                        onClick={() => removeMember(m.id)}
                      >
                        {busy === `remove:${m.id}` ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {accepting && (
        <div className="card" style={{ marginTop: 12, maxWidth: 600 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Accepting invite…
          </div>
        </div>
      )}
    </div>
  )
}

export function Billing() {
  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Billing</h1>
      </div>
      <div
        className="card"
        style={{ maxWidth: 480, padding: 40, textAlign: "center" }}
      >
        <div style={{ fontSize: 40, marginBottom: 16, color: "var(--signal)" }}>
          ◇
        </div>
        <h3 style={{ fontWeight: 700, marginBottom: 8 }}>
          Stripe Billing — Phase 8
        </h3>
        <p
          style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}
        >
          Subscription management via Stripe is implemented in Phase 8 when
          ReachFlow launches as a white-label SaaS product.
        </p>
      </div>
    </div>
  )
}
