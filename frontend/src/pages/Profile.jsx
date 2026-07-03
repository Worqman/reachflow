import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import './Profile.css'

export default function Profile() {
  const { toast } = useToast()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)

  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null
      setUser(u)
      setName(u?.user_metadata?.full_name || u?.email?.split('@')[0] || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleSaveInfo(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSavingInfo(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
      if (error) throw error
      toast('Profile updated', 'success')
    } catch (err) {
      toast(err?.message || 'Could not update profile', 'danger')
    } finally {
      setSavingInfo(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPw.length < 8) { toast('Password must be at least 8 characters', 'danger'); return }
    if (newPw !== confirmPw) { toast('Passwords do not match', 'danger'); return }
    setSavingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      toast('Password updated successfully', 'success')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      toast(err?.message || 'Could not update password', 'danger')
    } finally {
      setSavingPw(false)
    }
  }

  const initials = name
    ? name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
    : (user?.email?.[0]?.toUpperCase() || '?')

  const pwMismatch = newPw && confirmPw && newPw !== confirmPw

  if (loading) {
    return (
      <div className="profile-page animate-fade-in">
        <div className="profile-loading">Loading…</div>
      </div>
    )
  }

  return (
    <div className="profile-page animate-fade-in">

      <div className="profile-header">
        <div>
          <div className="profile-title">My Profile</div>
          <div className="profile-subtitle">Manage your personal account details</div>
        </div>
      </div>

      <div className="profile-body">

        {/* Personal info */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <div className="profile-card-title">Personal info</div>
              <div className="profile-card-desc">Your name and email address</div>
            </div>
          </div>

          <div className="profile-avatar-row">
            <div className="profile-avatar-circle">{initials}</div>
            <div>
              <div className="profile-avatar-name">{name || user?.email}</div>
              <div className="profile-avatar-email">{user?.email}</div>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleSaveInfo}>
            <div className="profile-field">
              <label className="profile-label">Full name</label>
              <input
                className="profile-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="profile-field">
              <label className="profile-label">Email address</label>
              <input
                className="profile-input profile-input-readonly"
                value={user?.email || ''}
                readOnly
              />
              <span className="profile-field-hint">Contact support to change your email</span>
            </div>
            <div className="profile-form-footer">
              <button
                type="submit"
                className="profile-btn-primary"
                disabled={savingInfo || !name.trim()}
              >
                {savingInfo ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change password */}
        <div className="profile-card">
          <div className="profile-card-head">
            <div className="profile-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <div className="profile-card-title">Change password</div>
              <div className="profile-card-desc">Choose a strong password of at least 8 characters</div>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleChangePassword}>
            <div className="profile-field">
              <label className="profile-label">New password</label>
              <div className="profile-pw-wrap">
                <input
                  className="profile-input"
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
                <button type="button" className="profile-pw-eye" onClick={() => setShowNew(v => !v)}>
                  {showNew ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="profile-field">
              <label className="profile-label">Confirm new password</label>
              <div className="profile-pw-wrap">
                <input
                  className={`profile-input${pwMismatch ? ' profile-input-error' : ''}`}
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
                <button type="button" className="profile-pw-eye" onClick={() => setShowConfirm(v => !v)}>
                  {showConfirm ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              {pwMismatch && <span className="profile-field-error">Passwords don't match</span>}
            </div>
            <div className="profile-form-footer">
              <button
                type="submit"
                className="profile-btn-primary"
                disabled={savingPw || !newPw || !confirmPw || pwMismatch}
              >
                {savingPw ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
