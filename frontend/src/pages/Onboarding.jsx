import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { companyProfiles, settings as settingsApi, unipile } from '../lib/api'
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

  const out = [raw, lower, toSnake, toKebab, compact, upperSnake, titleCaseKebab, titleCaseSnake, spacedTitle].filter(Boolean)
  return Array.from(new Set(out))
}

function isToneConstraintError(message) {
  const msg = String(message || '').toLowerCase()
  return msg.includes('tone_preference') && (msg.includes('check constraint') || msg.includes('violates'))
}

function Logo() {
  return (
    <div className="ob-logo">
      <div className="ob-logo-mark">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="#fff"/>
        </svg>
      </div>
      <span className="ob-logo-text">ReachFlow</span>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId())
  const [profileId, setProfileId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const [wsLoading, setWsLoading] = useState(true)
  const [wsError, setWsError] = useState('')
  const [user, setUser] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [pickerCreating, setPickerCreating] = useState(false)
  const [pickerModalOpen, setPickerModalOpen] = useState(false)
  const [pickerName, setPickerName] = useState('')

  const [linkedinAccounts, setLinkedinAccounts] = useState([])
  const [linkedinLoading, setLinkedinLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)

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
    { n: 1, title: 'Company Details', desc: 'Your company name and website.' },
    { n: 2, title: 'Company Copy', desc: 'Description, value prop, and services.' },
    { n: 3, title: 'Social Proof', desc: 'Results and testimonials.' },
    { n: 4, title: 'Tone Preference', desc: 'Writing style for outreach.' },
    { n: 5, title: 'Calendar Link', desc: 'Booking link for calls.' },
    { n: 6, title: 'LinkedIn Account', desc: 'Connect your LinkedIn via Unipile.' },
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
      if (!currentUser) { setWorkspaces([]); return }

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
      if (!storedIsValid) setActiveWorkspaceId(nextActive)
    } catch (e) {
      setWsError(e?.message || 'Failed to load workspaces')
      setWorkspaces([])
    } finally {
      setWsLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (!workspaceId) {
        setProfileId(null)
        setForm({ company_name: '', website_url: '', company_description: '', value_proposition: '', services_offered_text: '', social_proof_text: '', tone_preference: '', calendar_link: '' })
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
        services_offered_text: Array.isArray(p?.services_offered) ? p.services_offered.join('\n') : '',
        social_proof_text: Array.isArray(p?.social_proof) ? p.social_proof.join('\n') : '',
        tone_preference: p?.tone_preference || '',
        calendar_link: p?.calendar_link || '',
      })

      const doneKey = `rf_onboarding_complete_${String(workspaceId)}`
      const alreadyDone = localStorage.getItem(doneKey) === '1'
      const profileComplete = !!p?.company_name && !!p?.website_url && !!p?.company_description
        && !!p?.value_proposition && !!p?.tone_preference && !!p?.calendar_link
        && Array.isArray(p?.services_offered) && p.services_offered.length > 0
        && Array.isArray(p?.social_proof) && p.social_proof.length > 0

      if (alreadyDone || profileComplete) { navigate('/'); return }
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
      try { await settingsApi.getIntegrations() } catch { /* ignore */ }
    }
    if (alive) loadIntegrations()
    return () => { alive = false }
  }, [])

  async function loadLinkedinAccounts() {
    setLinkedinLoading(true)
    try {
      const data = await unipile.getAccounts()
      setLinkedinAccounts(data?.items || [])
    } catch { /* ignore */ } finally {
      setLinkedinLoading(false)
    }
  }

  useEffect(() => {
    if (step === 6) loadLinkedinAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('unipile')
    if (!status) return
    if (status === 'connected') {
      setStep(6)
      unipile.syncAccounts()
        .then(() => loadLinkedinAccounts())
        .then(() => toast?.('LinkedIn account connected!', 'success'))
        .catch(() => loadLinkedinAccounts())
    } else if (status === 'failed') {
      setStep(6)
      toast?.('LinkedIn connection failed. Please try again.', 'danger')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  async function handleLinkedinConnect() {
    setConnecting(true)
    try {
      const data = await unipile.connectAccount({ returnTo: '/onboarding' })
      const url = data?.url || data?.hosted_auth_url
      if (!url) throw new Error('No auth URL returned from Unipile')
      window.location.href = url
    } catch (err) {
      toast?.(err.message || 'Could not start LinkedIn connection', 'danger')
      setConnecting(false)
    }
  }

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
      try { result = await attemptSave(v); lastErr = null; break }
      catch (e) { lastErr = e; if (!isToneConstraintError(e?.message)) break }
    }
    if (lastErr) throw lastErr

    const saved = result?.id ? result : null
    if (saved) setProfileId(saved.id)
    return saved
  }

  async function handleNext() {
    setError('')
    setSaving(true)
    try {
      if (step === 1) {
        if (!form.company_name.trim()) throw new Error('Company Name is required.')
        if (!form.website_url.trim()) throw new Error('Website URL is required.')
      }
      if (step === 2) {
        if (!form.company_description.trim()) throw new Error('Company Description is required.')
        if (!form.value_proposition.trim()) throw new Error('Value Proposition is required.')
        if (parseList(form.services_offered_text).length === 0) throw new Error('Services Offered is required.')
      }
      if (step === 3) {
        if (parseList(form.social_proof_text).length === 0) throw new Error('Social Proof is required.')
      }
      if (step === 4) {
        if (!String(form.tone_preference || '').trim()) throw new Error('Tone Preference is required.')
      }
      if (step === 5) {
        if (!form.calendar_link.trim()) throw new Error('Calendar Link is required.')
      }
      if (step === 6) {
        const services = parseList(form.services_offered_text)
        const social = parseList(form.social_proof_text)
        if (!form.company_name.trim()) throw new Error('Company Name is required.')
        if (!form.website_url.trim()) throw new Error('Website URL is required.')
        if (!String(form.tone_preference || '').trim()) throw new Error('Tone Preference is required.')
        if (!form.calendar_link.trim()) throw new Error('Calendar Link is required.')
        if (!form.company_description.trim()) throw new Error('Company Description is required.')
        if (!form.value_proposition.trim()) throw new Error('Value Proposition is required.')
        if (services.length === 0) throw new Error('Services Offered is required.')
        if (social.length === 0) throw new Error('Social Proof is required.')
      }

      if (step < 4) { setStep(s => Math.min(6, s + 1)); return }

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

  /* ── No workspace ── */
  if (!workspaceId) {
    return (
      <div className="ob-shell">
        <div className="ob-card">
          <Logo />

          <div className="ob-step-head">
            <div className="ob-step-label">Setup — Step 0</div>
            <div className="ob-step-title">Choose a workspace</div>
            <div className="ob-step-desc">Your company profile is stored per workspace. Create one to get started.</div>
          </div>

          {wsError && (
            <div className="ob-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {wsError}
            </div>
          )}

          {wsLoading ? (
            <div className="ob-loading">Loading workspaces…</div>
          ) : (
            <>
              {workspaces.length > 0 && (
                <div className="ob-ws-list">
                  {workspaces.map((ws) => (
                    <button key={ws.id} type="button" className="ob-ws-btn" onClick={() => setActiveWorkspaceId(ws.id)}>
                      <span className="ob-ws-btn-name">{ws.name || 'Untitled workspace'}</span>
                      <span className="ob-ws-btn-action">Select →</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="ob-btn-next" type="button" onClick={() => { setPickerName(''); setPickerModalOpen(true) }} disabled={pickerCreating}>
                  {pickerCreating ? <><span className="ob-spinner" />Creating…</> : '+ Create workspace'}
                </button>
                <button className="ob-btn-back" type="button" onClick={() => navigate('/')}>
                  Skip for now
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
            <button className="btn btn-ghost" onClick={() => setPickerModalOpen(false)} disabled={pickerCreating}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={pickerCreating}
              onClick={async () => {
                setPickerCreating(true)
                setWsError('')
                try {
                  if (!supabase) throw new Error('Supabase is not configured.')
                  const currentUser = user?.id ? user : (await supabase.auth.getUser()).data?.user
                  if (!currentUser?.id) throw new Error('You must be signed in.')
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

  /* ── Main wizard ── */
  return (
    <div className="ob-shell">
      <div className="ob-card">
        <Logo />

        {/* Step dots */}
        <div className="ob-stepper">
          {STEPS.map((s, idx) => {
            const state = s.n === step ? 'active' : s.n < step ? 'done' : 'todo'
            return (
              <div key={s.n} className="ob-stepper-item">
                <button
                  type="button"
                  className={`ob-step-dot ${state}`}
                  onClick={() => { if (s.n <= step) setStep(s.n) }}
                  title={`${s.n}. ${s.title}`}
                >
                  {state === 'done' ? <CheckIcon /> : s.n}
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`ob-step-connector ${s.n < step ? 'done' : ''}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step heading */}
        <div className="ob-step-head">
          <div className="ob-step-label">Step {step} of {STEPS.length}</div>
          <div className="ob-step-title">{STEPS[step - 1]?.title}</div>
          <div className="ob-step-desc">{STEPS[step - 1]?.desc}</div>
        </div>

        {error && (
          <div className="ob-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="ob-loading">Loading…</div>
        ) : (
          <>
            {/* Step 1 */}
            {step === 1 && (
              <>
                <div className="ob-field">
                  <label className="ob-label">Company Name</label>
                  <input className="ob-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Acme Inc." autoFocus />
                </div>
                <div className="ob-field">
                  <label className="ob-label">Website URL</label>
                  <input className="ob-input" type="url" value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://yourcompany.com" />
                </div>
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <div className="ob-field">
                  <label className="ob-label">Company Description</label>
                  <textarea className="ob-textarea" rows={3} value={form.company_description} onChange={e => setForm(f => ({ ...f, company_description: e.target.value }))} placeholder="What does your company do?" />
                </div>
                <div className="ob-field">
                  <label className="ob-label">Value Proposition</label>
                  <textarea className="ob-textarea" rows={3} value={form.value_proposition} onChange={e => setForm(f => ({ ...f, value_proposition: e.target.value }))} placeholder="What sets you apart from competitors?" />
                </div>
                <div className="ob-field">
                  <label className="ob-label">Services Offered</label>
                  <textarea className="ob-textarea" rows={3} value={form.services_offered_text} onChange={e => setForm(f => ({ ...f, services_offered_text: e.target.value }))} placeholder="One service per line" />
                  <span className="ob-hint">Enter one service per line (or comma-separated)</span>
                </div>
              </>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="ob-field">
                <label className="ob-label">Social Proof &amp; Results</label>
                <textarea className="ob-textarea" rows={5} value={form.social_proof_text} onChange={e => setForm(f => ({ ...f, social_proof_text: e.target.value }))} placeholder="e.g. Helped a 10-person firm generate 40 qualified leads in 30 days…" />
                <span className="ob-hint">One proof point per line — testimonials, results, case studies</span>
              </div>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <div className="ob-field">
                <label className="ob-label">Default Tone</label>
                <select className="ob-select" value={form.tone_preference} onChange={e => setForm(f => ({ ...f, tone_preference: e.target.value }))}>
                  <option value="">Select a tone…</option>
                  <option value="professional_friendly">Professional-Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
                <span className="ob-hint">This sets the default writing style for AI-generated outreach messages</span>
              </div>
            )}

            {/* Step 5 */}
            {step === 5 && (
              <div className="ob-field">
                <label className="ob-label">Calendar Link</label>
                <input className="ob-input" type="url" value={form.calendar_link} onChange={e => setForm(f => ({ ...f, calendar_link: e.target.value }))} placeholder="https://calendly.com/your-link" />
                <span className="ob-hint">Calendly, Cal.com, or any booking page URL</span>
              </div>
            )}

            {/* Step 6 */}
            {step === 6 && (
              <>
                <div className="ob-info-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Connect the LinkedIn account you want to use for outreach. You can also do this later from the LinkedIn Accounts page.
                </div>

                {linkedinLoading ? (
                  <div className="ob-loading">Loading accounts…</div>
                ) : linkedinAccounts.length > 0 ? (
                  <div className="ob-account-list">
                    {linkedinAccounts.map((acc) => (
                      <div key={acc.id} className="ob-account-pill">
                        <div className="ob-account-avatar">{(acc.name || 'L')[0].toUpperCase()}</div>
                        <div>
                          <div className="ob-account-name">{acc.name || acc.username || acc.id}</div>
                          <div className="ob-account-status">
                            <CheckIcon /> Connected
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button className="ob-btn-secondary" onClick={handleLinkedinConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'ob-spin 0.7s linear infinite' }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Redirecting…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                      </svg>
                      Connect LinkedIn Account
                    </>
                  )}
                </button>

                {linkedinAccounts.length > 0 && (
                  <p className="ob-skip-note">Account connected. You can add more later in LinkedIn Accounts.</p>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="ob-actions">
              <button className="ob-btn-back" onClick={handleBack} disabled={saving || step === 1}>
                Back
              </button>
              <button className="ob-btn-next" onClick={handleNext} disabled={saving}>
                {saving
                  ? <><span className="ob-spinner" />{step === 6 ? 'Finishing…' : 'Saving…'}</>
                  : step === 6 ? 'Finish Setup' : 'Continue →'
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
