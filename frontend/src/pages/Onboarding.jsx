import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { companyProfiles, settings as settingsApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { getActiveWorkspaceId, onActiveWorkspaceChange, setActiveWorkspaceId } from '../lib/workspaceState'
import './Onboarding.css'

function parseList(text) {
  return String(text || '')
    .split(/\r?\n|,/g)
    .map(s => s.trim())
    .filter(Boolean)
}

function toneVariants(value) {
  const raw = String(value || '').trim()
  if (!raw) return []
  const lower = raw.toLowerCase()
  const toSnake = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const toKebab = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const compact = lower.replace(/[^a-z0-9]+/g, '').trim()
  const upperSnake = toSnake ? toSnake.toUpperCase() : ''

  const capWord = (w) => (w ? w[0].toUpperCase() + w.slice(1) : '')
  const titleCaseKebab = toKebab
    ? toKebab.split('-').filter(Boolean).map(capWord).join('-')
    : ''
  const titleCaseSnake = toSnake
    ? toSnake.split('_').filter(Boolean).map(capWord).join('_')
    : ''
  const spacedTitle = toKebab
    ? toKebab.split('-').filter(Boolean).map(capWord).join(' ')
    : ''

  const out = [
    raw,
    lower,
    toSnake,
    toKebab,
    compact,
    upperSnake,
    titleCaseKebab,
    titleCaseSnake,
    spacedTitle,
  ].filter(Boolean)
  return Array.from(new Set(out))
}

function isToneConstraintError(message) {
  const msg = String(message || '').toLowerCase()
  return msg.includes('tone_preference') && (msg.includes('check constraint') || msg.includes('violates'))
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId())
  const [profileId, setProfileId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  // Workspace selection / creation (so it stays in one place)
  const [wsLoading, setWsLoading] = useState(true)
  const [wsError, setWsError] = useState('')
  const [user, setUser] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [pickerCreating, setPickerCreating] = useState(false)
  const [pickerModalOpen, setPickerModalOpen] = useState(false)
  const [pickerName, setPickerName] = useState('')

  const [integrations, setIntegrations] = useState(null)

  const [form, setForm] = useState({
    company_name: '',
    website_url: '',
    company_description: '',
    value_proposition: '',
    services_offered_text: '',
    social_proof_text: '',
    tone_preference: '',
    calendar_link: '',
  })

  const STEPS = useMemo(() => ([
    { n: 1, title: 'Company Details', desc: 'Company name and website URL.' },
    { n: 2, title: 'Company Copy', desc: 'Description, value proposition, and services.' },
    { n: 3, title: 'Social Proof', desc: 'Results, testimonials, and proof points.' },
    { n: 4, title: 'Tone Preference', desc: 'Choose a writing tone for your outreach.' },
    { n: 5, title: 'Calendar Link', desc: 'Booking URL for calls (Calendly / Cal.com).' },
    { n: 6, title: 'LinkedIn Account', desc: 'Connect via Unipile (when configured).' },
  ]), [])

  useEffect(() => {
    const unsub = onActiveWorkspaceChange((id) => setWorkspaceId(id))
    return () => unsub?.()
  }, [])

  async function loadWorkspaces() {
    setWsLoading(true)
    setWsError('')
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
      const list = data || []
      setWorkspaces(list)

      const stored = getActiveWorkspaceId()
      const storedIsValid = !!stored && list.some((w) => String(w.id) === String(stored))
      const nextActive = storedIsValid ? stored : (list[0]?.id || null)

      // If localStorage points to a workspace that no longer exists, correct it.
      if (!storedIsValid) setActiveWorkspaceId(nextActive)
    } catch (e) {
      setWsError(e?.message || 'Failed to load workspaces')
      setWorkspaces([])
    } finally {
      setWsLoading(false)
    }
  }

  useEffect(() => {
    // Load workspaces only once; onboarding will react to changes via setActiveWorkspaceId().
    loadWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!workspaceId) {
        setProfileId(null)
        setForm({
          company_name: '',
          website_url: '',
          company_description: '',
          value_proposition: '',
          services_offered_text: '',
          social_proof_text: '',
          tone_preference: '',
          calendar_link: '',
        })
        return
      }

      const res = await companyProfiles.list(workspaceId)
      const p = res?.profiles?.[0] || null
      setProfileId(p?.id || null)

      setForm({
        company_name: p?.company_name || '',
        website_url: p?.website_url || '',
        company_description: p?.company_description || '',
        value_proposition: p?.value_proposition || '',
        services_offered_text: Array.isArray(p?.services_offered)
          ? p.services_offered.join('\n')
          : '',
        social_proof_text: Array.isArray(p?.social_proof)
          ? p.social_proof.join('\n')
          : '',
        tone_preference: p?.tone_preference || '',
        calendar_link: p?.calendar_link || '',
      })

      // If already complete, jump to finish screen (step 6) so users can review.
      // Guard logic will also prevent re-showing onboarding for completed profiles.
      setStep(1)
    } catch (e) {
      setError(e?.message || 'Failed to load onboarding data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    let alive = true
    async function loadIntegrations() {
      try {
        const res = await settingsApi.getIntegrations()
        if (!alive) return
        setIntegrations(res)
      } catch {
        // ignore
      }
    }
    loadIntegrations()
    return () => { alive = false }
  }, [])

  function basePayload() {
    return {
      workspace_id: workspaceId,
      company_name: form.company_name.trim(),
      website_url: form.website_url.trim() || null,
      company_description: form.company_description.trim() || null,
      value_proposition: form.value_proposition.trim() || null,
      services_offered: parseList(form.services_offered_text),
      calendar_link: form.calendar_link.trim() || null,
      social_proof: parseList(form.social_proof_text),
    }
  }

  async function saveProfile({ toneValue }) {
    if (!workspaceId) throw new Error('Select an active workspace first.')
    if (!form.company_name.trim()) throw new Error('Company Name is required.')

    const bp = basePayload()
    const tone = String(toneValue || '').trim()
    const variants = tone ? toneVariants(tone) : [null]

    async function attemptSave(t) {
      const payload = { ...bp, tone_preference: t || null }
      if (profileId) return await companyProfiles.update(profileId, payload)
      const created = await companyProfiles.create(payload)
      return created?.profile || null
    }

    let lastErr = null
    let result = null
    for (const v of variants) {
      try {
        result = await attemptSave(v)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        if (!isToneConstraintError(e?.message)) break
      }
    }
    if (lastErr) throw lastErr

    // For update() the API returns { profile }, for create() we forced profile extraction above.
    const createdOrUpdated = result?.id ? result : null
    if (createdOrUpdated) setProfileId(createdOrUpdated.id)
    return createdOrUpdated
  }

  async function handleNext() {
    setError('')
    setSaving(true)
    try {
      // Step 1 validation
      if (step === 1) {
        if (!form.company_name.trim()) throw new Error('Company Name is required.')
        if (!form.website_url.trim()) throw new Error('Website URL is required.')
      }

      if (step === 2) {
        if (!form.company_description.trim()) throw new Error('Company Description is required.')
        if (!form.value_proposition.trim()) throw new Error('Value Proposition is required.')
        const services = parseList(form.services_offered_text)
        if (services.length === 0) throw new Error('Services Offered is required.')
      }

      if (step === 3) {
        const social = parseList(form.social_proof_text)
        if (social.length === 0) throw new Error('Social Proof is required.')
      }

      // Step 4 validation (tone must be set to satisfy check constraint and onboarding completion)
      if (step === 4) {
        if (!String(form.tone_preference || '').trim()) throw new Error('Default Tone is required.')
      }

      if (step === 5) {
        if (!form.calendar_link.trim()) throw new Error('Calendar Link is required.')
      }

      if (step === 6) {
        // Finish validation: ensure key fields exist
        const services = parseList(form.services_offered_text)
        const social = parseList(form.social_proof_text)
        if (!form.company_name.trim()) throw new Error('Company Name is required.')
        if (!form.website_url.trim()) throw new Error('Website URL is required.')
        if (!String(form.tone_preference || '').trim()) throw new Error('Default Tone is required.')
        if (!form.calendar_link.trim()) throw new Error('Calendar Link is required.')
        if (!form.company_description.trim()) throw new Error('Company Description is required.')
        if (!form.value_proposition.trim()) throw new Error('Value Proposition is required.')
        if (services.length === 0) throw new Error('Services Offered is required.')
        if (social.length === 0) throw new Error('Social Proof is required.')
      }

      // Only persist to DB once we reach tone step (DB may validate tone_preference).
      if (step < 4) {
        setStep(s => Math.min(6, s + 1))
        return
      }

      await saveProfile({ toneValue: form.tone_preference })

      setStep(s => Math.min(6, s + 1))
      if (step === 6) {
        localStorage.setItem(`rf_onboarding_complete_${String(workspaceId)}`, '1')
        toast?.('Onboarding complete', 'success')
        navigate('/')
      }
    } catch (e) {
      setError(e?.message || 'Could not save onboarding progress')
      toast?.(e?.message || 'Could not save onboarding progress', 'danger')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    setError('')
    setStep(s => Math.max(1, s - 1))
  }

  if (!workspaceId) {
    return (
      <div className="page animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Onboarding</h1>
        </div>

        <div className="card" style={{ maxWidth: 640, padding: 20 }}>
          {wsError && (
            <div className="badge badge-danger" style={{ marginBottom: 12 }}>
              {wsError}
            </div>
          )}

          {wsLoading ? (
            <div style={{ padding: 6, color: 'var(--text-muted)', fontSize: 13 }}>Loading workspaces…</div>
          ) : (
            <>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Step 0: Choose (or create) a workspace</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                Your company profile is stored per workspace. Create one if you haven’t yet.
              </div>

              {workspaces.length === 0 ? (
                <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                  No workspaces yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  {workspaces.map((ws) => {
                    const isActive = false
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        className="btn btn-secondary"
                        style={{
                          justifyContent: 'space-between',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          background: isActive ? 'var(--signal-subtle)' : 'var(--surface-2)',
                        }}
                        onClick={() => setActiveWorkspaceId(ws.id)}
                      >
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{ws.name || 'Untitled workspace'}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setPickerName('')
                    setPickerModalOpen(true)
                  }}
                  disabled={pickerCreating}
                >
                  {pickerCreating ? 'Creating…' : '+ Create workspace'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => navigate('/')}
                >
                  Go to dashboard
                </button>
              </div>
            </>
          )}
        </div>

        <Modal
          open={pickerModalOpen}
          onClose={() => !pickerCreating && setPickerModalOpen(false)}
          title="Create workspace"
          width={520}
        >
          <div className="input-group">
            <label className="input-label">Workspace name</label>
            <input
              className="input"
              value={pickerName}
              onChange={(e) => setPickerName(e.target.value)}
              placeholder="Creative Deer"
              autoFocus
            />
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setPickerModalOpen(false)} disabled={pickerCreating}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={pickerCreating}
              onClick={async () => {
                setPickerCreating(true)
                setWsError('')
                try {
                  if (!supabase) throw new Error('Supabase is not configured.')
                  const currentUser = user?.id ? user : (await supabase.auth.getUser()).data?.user
                  if (!currentUser?.id) throw new Error('You must be signed in to create a workspace.')
                  if (!pickerName.trim()) throw new Error('Workspace name is required.')

                  const { data, error: insertErr } = await supabase
                    .from('workspaces')
                    .insert({ name: pickerName.trim(), owner_id: currentUser.id })
                    .select()
                    .single()

                  if (insertErr) throw insertErr
                  setPickerModalOpen(false)
                  setPickerName('')
                  if (data?.id) setActiveWorkspaceId(data.id)
                  await loadWorkspaces()
                } catch (e) {
                  setWsError(e?.message || 'Failed to create workspace')
                } finally {
                  setPickerCreating(false)
                }
              }}
            >
              {pickerCreating ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <div className="page animate-fade-in onboarding-page">
      <div className="page-header">
        <h1 className="page-title">Onboarding</h1>
      </div>

      <div className="card onboarding-stepper-card">
        <div className="onboarding-stepper-header">
          <div className="onboarding-stepper-title">Setup Progress</div>
          <div className="onboarding-stepper-count">Step {step} of 6</div>
        </div>
        <div className="onboarding-stepper-track">
          {STEPS.map((s, idx) => {
            const state = s.n === step ? 'active' : s.n < step ? 'done' : 'todo'
            return (
              <div key={s.n} className="onboarding-stepper-item-wrap">
                <button
                  type="button"
                  className={`onboarding-step-dot ${state}`}
                  onClick={() => {
                    if (s.n <= step) setStep(s.n)
                  }}
                  title={`${s.n}. ${s.title}`}
                >
                  {state === 'done' ? '✓' : state === 'active' ? '•' : ''}
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`onboarding-step-connector ${s.n < step ? 'done' : ''}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card onboarding-main-card">
          <div className="onboarding-current-step-meta">
            <div className="onboarding-current-step-title">
              {step}. {STEPS[step - 1]?.title}
            </div>
            <div className="onboarding-current-step-desc">
              {STEPS[step - 1]?.desc}
            </div>
          </div>

          {error && (
            <div className="badge badge-danger" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: 6, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {step === 1 && (
                <>
                  <div className="input-group">
                    <label className="input-label">Company Name</label>
                    <input className="input" value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Website</label>
                    <input className="input" value={form.website_url} onChange={(e) => setForm(f => ({ ...f, website_url: e.target.value }))} type="url" />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                    Fill in your company description, value proposition, and services (manual).
                  </div>

                  <div className="input-group">
                    <label className="input-label">Company Description</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={form.company_description}
                      onChange={(e) => setForm(f => ({ ...f, company_description: e.target.value }))}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Value Proposition</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={form.value_proposition}
                      onChange={(e) => setForm(f => ({ ...f, value_proposition: e.target.value }))}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Services (one per line)</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={form.services_offered_text}
                      onChange={(e) => setForm(f => ({ ...f, services_offered_text: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="input-group">
                    <label className="input-label">Social Proof / Results (one per line)</label>
                    <textarea
                      className="input"
                      rows={4}
                      value={form.social_proof_text}
                      onChange={(e) => setForm(f => ({ ...f, social_proof_text: e.target.value }))}
                      placeholder="e.g. Helped a 10-person accounting firm generate 40 qualified leads in 30 days…"
                    />
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="input-group">
                    <label className="input-label">Default Tone</label>
                    <select
                      className="input"
                      value={form.tone_preference}
                      onChange={(e) => setForm(f => ({ ...f, tone_preference: e.target.value }))}
                    >
                      <option value="">Not set</option>
                      <option value="professional_friendly">Professional-Friendly</option>
                      <option value="casual">Casual</option>
                      <option value="formal">Formal</option>
                    </select>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <div className="input-group">
                    <label className="input-label">Default Calendar Link</label>
                    <input className="input" value={form.calendar_link} onChange={(e) => setForm(f => ({ ...f, calendar_link: e.target.value }))} type="url" placeholder="https://calendly.com/your-link" />
                  </div>
                </>
              )}

              {step === 6 && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Connect your LinkedIn account via Unipile (when configured for this environment).
                  </div>
                  <div className="card" style={{ padding: 14, background: 'var(--surface-2)', boxShadow: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>Unipile</div>
                      <div className={`badge ${integrations?.unipile?.connected ? 'badge-signal' : 'badge-muted'}`}>
                        {integrations ? (integrations.unipile.connected ? 'Connected' : 'Not Connected') : 'Checking…'}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                      {integrations?.unipile?.connected
                        ? 'You can start running outreach campaigns.'
                        : 'Set `UNIPILE_API_KEY` on the backend to enable Unipile.'
                      }
                    </div>
                  </div>
                </>
              )}

              <div className="onboarding-actions">
                <button className="btn btn-ghost" onClick={handleBack} disabled={saving || step === 1}>
                  Back
                </button>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {step < 6 && (
                    <button className="btn btn-primary" onClick={handleNext} disabled={saving}>
                      {saving ? 'Saving…' : 'Continue'}
                    </button>
                  )}
                  {step === 6 && (
                    <button className="btn btn-primary" onClick={handleNext} disabled={saving}>
                      {saving ? 'Finishing…' : 'Finish Setup'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  )
}

