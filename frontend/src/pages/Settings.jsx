import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { companyProfiles, workspace as workspaceApi } from '../lib/api'
import { getActiveWorkspaceId, onActiveWorkspaceChange } from '../lib/workspaceState'
import './Settings.css'

export default function Settings() {
  return (
    <div className="settings-layout page animate-fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Settings</h1>
      </div>
      <CompanyProfileSection />
    </div>
  )
}

// ── Company Profile ──────────────────────────────────────────────────────────

function CompanyProfileSection() {
  const { toast } = useToast()
  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId())
  const [workspaceName, setWorkspaceName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({
    company_name: '', website_url: '', company_description: '',
    value_proposition: '', services_offered_text: '',
    tone_preference: '', calendar_link: '', social_proof_text: '',
  })

  async function load(wsId) {
    setLoading(true)
    setError('')
    try {
      if (!wsId) { setProfiles([]); setSelectedId(null); resetForm(); return }
      const res = await companyProfiles.list(wsId)
      const list = res?.profiles || []
      setProfiles(list)
      const active = list[0] || null
      setSelectedId(active?.id || null)
      if (!active) { resetForm(); return }
      populateForm(active)
    } catch (e) {
      setError(e?.message || 'Failed to load company profile')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm({ company_name: '', website_url: '', company_description: '', value_proposition: '', services_offered_text: '', tone_preference: '', calendar_link: '', social_proof_text: '' })
  }

  function populateForm(p) {
    setForm({
      company_name: p.company_name || '',
      website_url: p.website_url || '',
      company_description: p.company_description || '',
      value_proposition: p.value_proposition || '',
      services_offered_text: Array.isArray(p.services_offered) ? p.services_offered.join('\n') : '',
      tone_preference: p.tone_preference || '',
      calendar_link: p.calendar_link || '',
      social_proof_text: Array.isArray(p.social_proof) ? p.social_proof.join('\n') : '',
    })
  }

  useEffect(() => { load(workspaceId) }, [workspaceId])
  useEffect(() => { const unsub = onActiveWorkspaceChange(id => setWorkspaceId(id)); return () => unsub?.() }, [])
  useEffect(() => {
    if (!workspaceId) { setWorkspaceName(''); return }
    workspaceApi.get().then(res => setWorkspaceName(res?.workspace?.name || '')).catch(() => {})
  }, [workspaceId])

  function parseLines(text) {
    return String(text || '').split(/\r?\n|,/g).map(s => s.trim()).filter(Boolean)
  }

  function toneVariants(value) {
    const raw = String(value || '').trim()
    if (!raw) return []
    const lower = raw.toLowerCase()
    const toSnake = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const toKebab = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const compact = lower.replace(/[^a-z0-9]+/g, '').trim()
    const upperSnake = toSnake ? toSnake.toUpperCase() : ''
    const capWord = w => w ? w[0].toUpperCase() + w.slice(1) : ''
    const titleCaseKebab = toKebab ? toKebab.split('-').filter(Boolean).map(capWord).join('-') : ''
    const titleCaseSnake = toSnake ? toSnake.split('_').filter(Boolean).map(capWord).join('_') : ''
    const spacedTitle = toKebab ? toKebab.split('-').filter(Boolean).map(capWord).join(' ') : ''
    return Array.from(new Set([raw, lower, toSnake, toKebab, compact, upperSnake, titleCaseKebab, titleCaseSnake, spacedTitle].filter(Boolean)))
  }

  function isToneConstraintError(message) {
    const msg = String(message || '').toLowerCase()
    return msg.includes('tone_preference') && (msg.includes('check constraint') || msg.includes('violates'))
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const wsId = workspaceId
      if (!wsId) throw new Error('Select an active workspace first (Workspaces page).')
      if (!form.company_name.trim()) throw new Error('Company Name is required.')
      const basePayload = {
        workspace_id: wsId,
        company_name: form.company_name.trim(),
        website_url: form.website_url.trim() || null,
        company_description: form.company_description.trim() || null,
        value_proposition: form.value_proposition.trim() || null,
        services_offered: parseLines(form.services_offered_text),
        calendar_link: form.calendar_link.trim() || null,
        social_proof: parseLines(form.social_proof_text),
      }
      const tone = String(form.tone_preference || '').trim()
      const variants = tone ? toneVariants(tone) : [null]
      let result = null, lastErr = null
      for (const v of (variants.length ? variants : [null])) {
        try {
          const payload = { ...basePayload, tone_preference: v || null }
          result = selectedId ? await companyProfiles.update(selectedId, payload) : await companyProfiles.create(payload)
          lastErr = null; break
        } catch (e) { lastErr = e; if (!isToneConstraintError(e?.message)) break }
      }
      if (lastErr) throw lastErr
      toast?.(selectedId ? 'Company profile saved' : 'Company profile created', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to save company profile')
      toast?.(e?.message || 'Could not save company profile', 'danger')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!window.confirm('Delete this company profile? This cannot be undone.')) return
    try {
      await companyProfiles.delete(selectedId)
      toast?.('Company profile deleted', 'success')
      await load(workspaceId)
    } catch (e) {
      setError(e?.message || 'Failed to delete company profile')
      toast?.(e?.message || 'Could not delete company profile', 'danger')
    }
  }

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Company Profile</h2>
          <p className="settings-section-desc">Used by all AI Agents and Campaigns to generate personalised outreach.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {profiles.length > 1 && (
            <select
              className="input"
              style={{ minWidth: 180, height: 36, padding: '6px 10px' }}
              value={selectedId || ''}
              disabled={loading}
              onChange={e => {
                const id = e.target.value || null
                setSelectedId(id)
                const p = profiles.find(x => String(x.id) === String(id))
                if (p) populateForm(p); else resetForm()
              }}
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{(p.company_name || 'Untitled').slice(0, 36)}</option>)}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedId(null); resetForm() }} disabled={loading || saving}>
            + New profile
          </button>
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      {loading ? (
        <div className="settings-empty">Loading company profile…</div>
      ) : !workspaceId ? (
        <div className="settings-empty">
          No active workspace selected.{' '}
          <Link to="/workspaces">Go to workspaces →</Link>
        </div>
      ) : (
        <div className="settings-form-grid">
          <div className="settings-card">
            <div className="settings-card-title">Basic info</div>
            <div className="input-group">
              <label className="input-label">Company Name <span className="required">*</span></label>
              <input className="input" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Inc." />
            </div>
            <div className="input-group">
              <label className="input-label">Website</label>
              <input className="input" value={form.website_url} onChange={e => set('website_url', e.target.value)} placeholder="https://acme.com" type="url" />
            </div>
            <div className="input-group">
              <label className="input-label">Calendar Link</label>
              <input className="input" value={form.calendar_link} onChange={e => set('calendar_link', e.target.value)} placeholder="https://calendly.com/your-link" type="url" />
            </div>
            <div className="input-group">
              <label className="input-label">Default AI Tone</label>
              <select className="input" value={form.tone_preference || ''} onChange={e => set('tone_preference', e.target.value)}>
                {form.tone_preference && !['', 'professional_friendly', 'casual', 'formal'].includes(form.tone_preference) && (
                  <option value={form.tone_preference}>{form.tone_preference}</option>
                )}
                <option value="">Not set</option>
                <option value="professional_friendly">Professional-Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">AI context</div>
            <div className="input-group">
              <label className="input-label">Company Description</label>
              <textarea className="input" rows={3} value={form.company_description} onChange={e => set('company_description', e.target.value)} placeholder="What does your company do?" />
            </div>
            <div className="input-group">
              <label className="input-label">Value Proposition</label>
              <textarea className="input" rows={3} value={form.value_proposition} onChange={e => set('value_proposition', e.target.value)} placeholder="Why should customers choose you?" />
            </div>
            <div className="input-group">
              <label className="input-label">Services Offered <span className="input-hint">one per line</span></label>
              <textarea className="input" rows={3} value={form.services_offered_text} onChange={e => set('services_offered_text', e.target.value)} placeholder={"Web design\nGoogle Ads\nSEO"} />
            </div>
            <div className="input-group">
              <label className="input-label">Social Proof / Results <span className="input-hint">one per line</span></label>
              <textarea className="input" rows={3} value={form.social_proof_text} onChange={e => set('social_proof_text', e.target.value)} placeholder={"Helped X achieve Y\nCase study: ..."} />
            </div>
          </div>

          <div className="settings-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : selectedId ? 'Save Profile' : 'Create Profile'}
            </button>
            {selectedId && (
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete} disabled={saving || loading}>
                Delete profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

