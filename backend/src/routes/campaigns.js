import { Router } from 'express'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase.js'
import { linkedin, chats as unipileChats, relations as unipileRelations } from '../services/unipile.js'
import { isWithinSchedule } from '../services/limits.js'
import { logSend, getDailyUsage, withinDailyLimit } from '../services/usageLog.js'
import { checkAccountAvailable, checkAccountSendAllowed, getAccountSafety, getEffectiveLimits } from '../services/accountSafety.js'
import { logLeadActivity, getLeadActivity } from '../services/leadActivity.js'
import { getScoresForProviderIds, loadScoringConfig, getScore, buildSignalVars } from '../services/signalScoring.js'
import { canAiTakeOver, isProspectMessage } from '../services/replyTakeover.js'
import { withAccountLock } from '../services/accountLock.js'
import { enqueueSendBatch, isSendBatchRunning, enqueueResumePendingStep, getCampaignQueueStatus } from '../services/campaignQueue.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const router = Router()

// workspace_id comes from the auth middleware via req.workspaceId
function wsId(req) { return req.workspaceId || 'ws_default' }

// Fetch workspace company profile from Supabase
async function getWorkspaceProfile(workspaceId) {
  if (!supabase || !workspaceId || workspaceId === 'ws_default') return null
  try {
    const { data } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      companyName:  data.company_name,
      website:      data.website_url,
      valueProp:    data.value_proposition,
      services:     Array.isArray(data.services_offered) ? data.services_offered.join(', ') : (data.services_offered || ''),
      socialProof:  Array.isArray(data.social_proof) ? data.social_proof.join('. ') : (data.social_proof || ''),
      tone:         data.tone_preference,
      calendarLink: data.calendar_link,
    }
  } catch {
    return null
  }
}

// Fetch a prospect's LinkedIn profile via Unipile and use Claude to generate a
// concise "prospect brief" — stored in campaign_leads.profile_summary for reuse.
export async function fetchAndSummarizeProfile(providerUserId, accountId, campaignId, workspaceId) {
  try {
    // Return cached summary if already fetched for this lead
    if (supabase) {
      const { data: existing } = await supabase
        .from('campaign_leads')
        .select('profile_summary')
        .eq('provider_id', providerUserId)
        .eq('campaign_id', campaignId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (existing?.profile_summary) return existing.profile_summary
    }

    // Fetch full profile (visitProfile includes account_id for authenticated request)
    const profileData = await linkedin.visitProfile(accountId, providerUserId)

    // Extract key fields — handle both Unipile naming conventions
    const headline = profileData?.headline || ''
    const about = profileData?.summary || profileData?.description || ''
    const experience = (profileData?.experience || profileData?.work_experience || [])
      .slice(0, 3)
      .map(e => [e.title || e.job_title, e.company_name || e.company].filter(Boolean).join(' at '))
      .filter(Boolean)
      .join('; ')

    const rawText = [headline, about, experience].filter(Boolean).join('\n')
    if (!rawText.trim()) return null

    // Ask Claude to generate a concise prospect brief
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Summarize this LinkedIn profile in 3-4 sentences to help a salesperson personalise their outreach. Focus on the person's current role, what their company does, their background, and any context that could make outreach feel relevant.\n\n${rawText}\n\nReturn only the summary. No labels, no preamble.`,
      }],
    })

    const summary = msg.content[0].text.trim()
    if (!summary) return null

    console.log(`[profile] Summarised profile for ${providerUserId}: "${summary.slice(0, 80)}…"`)

    // Cache on the campaign lead so we don't re-fetch on every message
    if (supabase) {
      await supabase
        .from('campaign_leads')
        .update({ profile_summary: summary })
        .eq('provider_id', providerUserId)
        .eq('campaign_id', campaignId)
        .catch(() => {}) // ignore if column not yet migrated
    }

    return summary
  } catch (err) {
    console.error('[profile] Failed to fetch/summarise:', err.message)
    return null // graceful degradation — AI still works without profile context
  }
}

// Interpolate message variables with lead + workspace profile data.
// profile is explicitly `null` (not just undefined) whenever a workspace
// has no company profile filled in yet — the default param alone doesn't
// catch that, so normalize it here.
function interpolateVars(text, lead, profile, signalVars) {
  if (!text) return text
  profile = profile || {}
  signalVars = signalVars || {}
  const nameParts = (lead.name || '').trim().split(/\s+/)
  const firstName = nameParts[0] || ''
  const lastName  = nameParts.slice(1).join(' ') || ''
  return text
    .replace(/\{firstName\}/g,     firstName)
    .replace(/\{lastName\}/g,      lastName)
    .replace(/\{fullName\}/g,      lead.name || '')
    .replace(/\{jobTitle\}/g,      lead.title || '')
    .replace(/\{company\}/g,       lead.company || '')
    .replace(/\{location\}/g,      lead.location || '')
    .replace(/\{calendarLink\}/g,  profile.calendarLink || '')
    .replace(/\{senderCompany\}/g, profile.companyName || '')
    .replace(/\{senderWebsite\}/g, profile.website || '')
    // Signal-based vars — always blank-substitute rather than fail if a
    // lead has no signal history (the common case). See buildSignalVars().
    .replace(/\{signalType\}/g,          signalVars.signalType || '')
    .replace(/\{signalSummary\}/g,       signalVars.signalSummary || '')
    .replace(/\{triggerReason\}/g,       signalVars.triggerReason || '')
    .replace(/\{recentPostTopic\}/g,     signalVars.recentPostTopic || '')
    .replace(/\{painPoint\}/g,           signalVars.painPoint || '')
    .replace(/\{companySignal\}/g,       signalVars.companySignal || '')
    .replace(/\{sourceUrl\}/g,           signalVars.sourceUrl || '')
}

// ── helpers ────────────────────────────────────────────────────

function dbToApi(row) {
  if (!row) return null
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    name:        row.name,
    status:      row.status,
    sequence:    row.sequence,
    settings:    row.settings,
    analytics:   row.analytics,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function leadDbToApi(row) {
  if (!row) return null
  return {
    id:          row.id,
    campaignId:  row.campaign_id,
    workspaceId: row.workspace_id,
    name:        row.name,
    title:       row.title,
    company:     row.company,
    location:    row.location,
    linkedinUrl: row.linkedin_url,
    providerId:  row.provider_id,
    status:         row.status,
    leadStatus:     row.lead_status || 'lead',
    source:         row.source,
    addedAt:        row.added_at,
    profileSummary: row.profile_summary || null,
    lastError:      row.last_error || null,
  }
}

// ── GET /api/campaigns ─────────────────────────────────────────
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('workspace_id', wsId(req))
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ message: error.message })

  // Fetch live lead counts for all campaigns in one query
  const campaignIds = data.map(c => c.id)
  let leadCounts = {}
  if (campaignIds.length) {
    const { data: leads } = await supabase
      .from('campaign_leads')
      .select('campaign_id, status')
      .in('campaign_id', campaignIds)

    for (const lead of leads || []) {
      if (!leadCounts[lead.campaign_id]) leadCounts[lead.campaign_id] = { sent: 0, accepted: 0, replied: 0 }
      const c = leadCounts[lead.campaign_id]
      if (['invited','connected','replied','booked','rejected'].includes(lead.status)) c.sent++
      if (['connected','replied','booked'].includes(lead.status)) c.accepted++
      if (['replied','booked'].includes(lead.status)) c.replied++
    }
  }

  res.json(data.map(row => ({
    ...dbToApi(row),
    analytics: leadCounts[row.id] || { sent: 0, accepted: 0, replied: 0 },
  })))
})

// ── POST /api/campaigns ────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ message: 'name required' })

  const row = {
    id:           `camp_${randomUUID().slice(0, 8)}`,
    workspace_id: wsId(req),
    name,
    status:       'paused',
    sequence:     { nodes: [] },
    settings: {
      dailyConnectionLimit: 20,
      dailyMessageLimit:    30,
      timezone:             'Europe/London',
      activeHoursStart:     '09:00',
      activeHoursEnd:       '18:00',
    },
    analytics: { sent: 0, accepted: 0, replied: 0 },
  }

  const { data, error } = await supabase.from('campaigns').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(dbToApi(data))
})

// ── GET /api/campaigns/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))
    .single()

  if (error || !data) return res.status(404).json({ message: 'Campaign not found' })
  res.json(dbToApi(data))
})

// ── PUT /api/campaigns/:id ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  // Map camelCase fields to snake_case for Supabase
  const body = req.body
  const patch = {}
  if (body.name     !== undefined) patch.name     = body.name
  if (body.status   !== undefined) patch.status   = body.status
  if (body.sequence !== undefined) patch.sequence = body.sequence
  if (body.analytics!== undefined) patch.analytics= body.analytics
  if (body.settings !== undefined) {
    // Merge with existing settings
    const { data: existing } = await supabase
      .from('campaigns').select('settings').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()
    patch.settings = { ...(existing?.settings || {}), ...body.settings }
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))
    .select()
    .single()

  if (error || !data) return res.status(404).json({ message: error?.message || 'Campaign not found' })
  res.json(dbToApi(data))
})

// ── DELETE /api/campaigns/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))

  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

// ── GET /api/campaigns/:id/leads ───────────────────────────────
router.get('/:id/leads', async (req, res) => {
  // Verify campaign belongs to this workspace
  const { data: camp } = await supabase.from('campaigns').select('id, settings').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })

  const { data, error } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', req.params.id)
    .order('added_at', { ascending: false })

  if (error) return res.status(500).json({ message: error.message })

  // Attach the computed intent score (if any) per lead, so the leads table
  // can show it without a separate round-trip per row.
  const agentId = camp.settings?.agentId
  let scoreByProviderId = {}
  if (agentId) {
    const providerIds = [...new Set(data.map(l => l.provider_id).filter(Boolean))]
    if (providerIds.length) scoreByProviderId = await getScoresForProviderIds(agentId, providerIds)
  }

  res.json(data.map(row => {
    const api = leadDbToApi(row)
    const scoreRow = row.provider_id ? scoreByProviderId[row.provider_id] : null
    return scoreRow
      ? { ...api, score: scoreRow.score, classification: scoreRow.classification, scoreReason: scoreRow.reason }
      : api
  }))
})

// ── POST /api/campaigns/:id/leads ──────────────────────────────
// Leads with a computed intent score below the campaign's agent's
// configured threshold are held out of campaign_leads rather than
// auto-added — see `held` in the response. A lead is only ever held if it
// actually has a computed score below threshold; leads with no provider_id
// or no signal history (the common case) are added exactly as before.
router.post('/:id/leads', async (req, res) => {
  try {
    const { leads, source } = req.body
    if (!Array.isArray(leads)) return res.status(400).json({ message: 'leads array required' })
    if (!supabase) return res.status(503).json({ message: 'Database not configured' })

    // Every lead needs something we can actually send an invite to: either a
    // LinkedIn URL (resolved to a provider_id at send time) or an already-
    // known provider_id (e.g. leads sourced live from a Unipile search).
    // Without one, the send silently fails later with "Cannot resolve
    // provider_id for lead" — reject the whole import up front instead, the
    // same way the CSV import UI blocks on missing linkedin_url.
    const missingLinkedin = leads.filter(l => {
      const hasUrl = !!(l.linkedinUrl || l.linkedin_url)
      const hasProviderId = isValidLinkedInUrn(l.providerId || l.provider_id)
      return !hasUrl && !hasProviderId
    })
    if (missingLinkedin.length) {
      const names = missingLinkedin.slice(0, 3).map(l => l.name || 'unnamed lead').join(', ')
      return res.status(400).json({
        message: `LinkedIn URL is required for leads. ${missingLinkedin.length} of ${leads.length} lead(s) are missing one (e.g. ${names}${missingLinkedin.length > 3 ? ', …' : ''}).`,
      })
    }

    const { data: camp } = await supabase.from('campaigns').select('id, settings').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
    if (!camp) return res.status(404).json({ message: 'Campaign not found' })

    // Dedupe against leads already in this campaign, and against duplicates
    // within the incoming batch itself, before scoring/inserting.
    const incomingProviderIds = [...new Set(leads.map(l => l.providerId || l.provider_id).filter(Boolean))]
    const incomingUrls = [...new Set(leads.map(l => l.linkedinUrl || l.linkedin_url).filter(Boolean))]

    const [existingByProvider, existingByUrl] = await Promise.all([
      incomingProviderIds.length
        ? supabase.from('campaign_leads').select('provider_id').eq('campaign_id', req.params.id).in('provider_id', incomingProviderIds)
        : Promise.resolve({ data: [] }),
      incomingUrls.length
        ? supabase.from('campaign_leads').select('linkedin_url').eq('campaign_id', req.params.id).in('linkedin_url', incomingUrls)
        : Promise.resolve({ data: [] }),
    ])

    const existingProviderIds = new Set((existingByProvider.data || []).map(r => r.provider_id))
    const existingUrls = new Set((existingByUrl.data || []).map(r => r.linkedin_url))
    const seenProviderIds = new Set()
    const seenUrls = new Set()
    let duplicateCount = 0

    const uniqueLeads = []
    for (const l of leads) {
      const providerId = l.providerId || l.provider_id || null
      const linkedinUrl = l.linkedinUrl || l.linkedin_url || null
      const isDuplicate =
        (providerId && (existingProviderIds.has(providerId) || seenProviderIds.has(providerId))) ||
        (linkedinUrl && (existingUrls.has(linkedinUrl) || seenUrls.has(linkedinUrl)))

      if (isDuplicate) { duplicateCount++; continue }
      if (providerId) seenProviderIds.add(providerId)
      if (linkedinUrl) seenUrls.add(linkedinUrl)
      uniqueLeads.push(l)
    }

    const agentId = camp.settings?.agentId
    const toInsert = []
    const held = []

    if (agentId) {
      const providerIds = [...new Set(uniqueLeads.map(l => l.providerId || l.provider_id).filter(Boolean))]
      const [scoreByProviderId, config] = await Promise.all([
        getScoresForProviderIds(agentId, providerIds),
        loadScoringConfig(wsId(req)),
      ])
      const threshold = Number.isFinite(req.body.threshold) ? req.body.threshold : config.campaignGateThreshold

      for (const l of uniqueLeads) {
        const providerId = l.providerId || l.provider_id || null
        const scoreRow = providerId ? scoreByProviderId[providerId] : null
        if (scoreRow && scoreRow.score < threshold && !l.force) {
          held.push({ ...l, providerId, score: scoreRow.score, classification: scoreRow.classification, reason: scoreRow.reason, threshold })
        } else {
          toInsert.push(l)
        }
      }
    } else {
      toInsert.push(...uniqueLeads)
    }

    if (!toInsert.length) {
      return res.status(201).json({ added: [], count: 0, held, heldCount: held.length, duplicateCount })
    }

    const rows = toInsert.map(l => ({
      id:           `lead_${randomUUID()}`,
      campaign_id:  req.params.id,
      workspace_id: wsId(req),
      name:         l.name || null,
      title:        l.title || null,
      company:      l.company || null,
      location:     l.location || null,
      linkedin_url: l.linkedinUrl || l.linkedin_url || null,
      provider_id:  l.providerId || l.provider_id || null,
      status:       'pending',
      source:       source || l.source || null,
    }))

    const { data, error } = await supabase.from('campaign_leads').insert(rows).select()
    if (error) return res.status(500).json({ message: error.message })
    for (const row of data) logLeadActivity(req.params.id, row.id, 'added', source || null)
    res.status(201).json({ added: data.map(leadDbToApi), count: data.length, held, heldCount: held.length, duplicateCount })
  } catch (err) {
    console.error('[import-leads]', err)
    res.status(500).json({ message: err.message || 'Failed to import leads' })
  }
})

// ── DELETE /api/campaigns/:id/leads/:leadId ────────────────────
router.delete('/:id/leads/:leadId', async (req, res) => {
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })
  const { error } = await supabase
    .from('campaign_leads').delete().eq('id', req.params.leadId).eq('campaign_id', req.params.id)
  if (error) return res.status(500).json({ message: error.message })
  res.json({ ok: true })
})

// ── POST /api/campaigns/:id/leads/:leadId/status ───────────────
router.post('/:id/leads/:leadId/status', async (req, res) => {
  const { status } = req.body
  if (!status) return res.status(400).json({ message: 'status required' })
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })
  // Clear last_error on manual status changes (e.g. retrying a failed lead);
  // fall back to status-only if the column doesn't exist yet.
  let { data, error } = await supabase
    .from('campaign_leads').update({ status, last_error: null }).eq('id', req.params.leadId).select().single()
  if (error) {
    ({ data, error } = await supabase
      .from('campaign_leads').update({ status }).eq('id', req.params.leadId).select().single())
  }
  if (error || !data) return res.status(500).json({ message: error?.message || 'Update failed' })
  res.json(leadDbToApi(data))
})

// ── PUT /api/campaigns/:id/leads/:leadId ────────────────────────
// Edits lead fields (e.g. fixing a missing/bad LinkedIn URL after a
// "Cannot resolve provider_id" failure). Changing linkedin_url clears the
// stored provider_id so the next send re-resolves it, and clears last_error
// + resets a failed lead back to pending so it's picked up by the next run.
router.put('/:id/leads/:leadId', async (req, res) => {
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })

  const { data: existing } = await supabase.from('campaign_leads').select('status, linkedin_url').eq('id', req.params.leadId).eq('campaign_id', req.params.id).maybeSingle()
  if (!existing) return res.status(404).json({ message: 'Lead not found' })

  const update = {}
  if (req.body.name !== undefined) update.name = req.body.name
  if (req.body.title !== undefined) update.title = req.body.title
  if (req.body.company !== undefined) update.company = req.body.company
  if (req.body.location !== undefined) update.location = req.body.location
  if (req.body.linkedinUrl !== undefined) {
    const urlChanged = req.body.linkedinUrl !== existing.linkedin_url
    update.linkedin_url = req.body.linkedinUrl || null
    if (urlChanged) {
      update.provider_id = null
      update.last_error = null
      if (existing.status === 'failed') update.status = 'pending'
    }
  }

  const { data, error } = await supabase
    .from('campaign_leads').update(update).eq('id', req.params.leadId).select().single()
  if (error || !data) return res.status(500).json({ message: error?.message || 'Update failed' })
  res.json(leadDbToApi(data))
})

// Manual, user-set qualification status — separate from the automated
// pipeline `status` column above (pending/invited/connected/replied/...).
const LEAD_STATUS_VALUES = [
  'lead', 'interested', 'meeting_booked', 'meeting_complete',
  'closed', 'wrong_person', 'not_interested', 'no_response',
]

// ── POST /api/campaigns/:id/leads/:leadId/lead-status ──────────
router.post('/:id/leads/:leadId/lead-status', async (req, res) => {
  const { leadStatus } = req.body
  if (!LEAD_STATUS_VALUES.includes(leadStatus)) {
    return res.status(400).json({ message: `leadStatus must be one of: ${LEAD_STATUS_VALUES.join(', ')}` })
  }
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })

  const { data: before } = await supabase
    .from('campaign_leads').select('lead_status').eq('id', req.params.leadId).maybeSingle()

  const { data, error } = await supabase
    .from('campaign_leads').update({ lead_status: leadStatus }).eq('id', req.params.leadId).select().single()
  if (error || !data) return res.status(500).json({ message: error?.message || 'Update failed' })

  logLeadActivity(req.params.id, req.params.leadId, 'lead_status_changed', `${before?.lead_status || 'lead'} → ${leadStatus}`)
  res.json(leadDbToApi(data))
})

// ── GET /api/campaigns/:id/leads/:leadId/activity ───────────────
router.get('/:id/leads/:leadId/activity', async (req, res) => {
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })
  const items = await getLeadActivity(req.params.leadId)
  res.json({
    items: items.map(r => ({ id: r.id, action: r.action, detail: r.detail, timestamp: r.created_at })),
  })
})

// ── GET /api/campaigns/:id/leads/:leadId/preview-vars ──────────
// Resolves the 7 signal-based sequence variables for one lead — used by
// the sequence builder's variable-picker preview. Uses the exact same
// buildSignalVars() the real sequence executor uses, so the preview can
// never show something a real send wouldn't actually produce.
router.get('/:id/leads/:leadId/preview-vars', async (req, res) => {
  const { data: campaign } = await supabase
    .from('campaigns').select('id, settings').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' })

  const { data: lead } = await supabase
    .from('campaign_leads').select('*').eq('id', req.params.leadId).eq('campaign_id', req.params.id).maybeSingle()
  if (!lead) return res.status(404).json({ message: 'Lead not found' })

  const agentId = campaign.settings?.agentId
  const scoreRow = agentId && lead.provider_id ? await getScore(agentId, lead.provider_id) : null
  const vars = buildSignalVars(scoreRow, lead)

  res.json({ ...vars, hasSignalContext: !!scoreRow && (scoreRow.signal_count || 0) > 0 })
})

// ── Sequence execution helpers ──────────────────────────────────

// LinkedIn URNs from Unipile look like "ACoAAA..." (base64-encoded member URN).
// Numeric IDs, slugs, and URLs are not accepted by the invite/message endpoints.
function isValidLinkedInUrn(value) {
  return typeof value === 'string' && /^ACo[A-Za-z0-9+/=_-]{6,}$/.test(value)
}

// Resolve provider_id for a lead, looking up by LinkedIn URL if needed.
// If a stored provider_id exists but is not a valid URN, re-resolve via profile lookup.
async function resolveProviderId(lead, accountId) {
  if (lead.provider_id && isValidLinkedInUrn(lead.provider_id)) {
    console.log(`[resolve] using stored provider_id for ${lead.name}: ${lead.provider_id}`)
    return lead.provider_id
  }
  if (lead.provider_id) {
    console.log(`[resolve] stored provider_id for ${lead.name} is not a valid URN ("${lead.provider_id}") — re-resolving`)
  }
  if (!lead.linkedin_url) {
    console.log(`[resolve] no linkedin_url for ${lead.name} — cannot resolve provider_id`)
    return null
  }

  // Fast path: extract URN directly from miniProfileUrn query param (no API call needed)
  try {
    const urlObj = new URL(lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`)
    const miniUrn = urlObj.searchParams.get('miniProfileUrn')
    if (miniUrn) {
      // "urn:li:fs_miniProfile:ACoAADE4..." → last segment is the Unipile provider_id
      const pid = miniUrn.split(':').pop()
      if (pid && isValidLinkedInUrn(pid)) {
        console.log(`[resolve] extracted provider_id from miniProfileUrn for ${lead.name}: ${pid}`)
        await supabase.from('campaign_leads').update({ provider_id: pid }).eq('id', lead.id)
        return pid
      }
    }
  } catch {}

  // Fallback: profile API lookup — strip query params from slug
  const pathAfterIn = lead.linkedin_url.split('/in/')[1] || lead.linkedin_url
  const slug = pathAfterIn.split('?')[0].replace(/\/$/, '')
  console.log(`[resolve] looking up profile for ${lead.name} slug=${slug}`)
  const profile = await linkedin.getProfileByUrl(accountId, slug)
  console.log(`[resolve] provider_id=${profile?.provider_id}  id=${profile?.id}  public_identifier=${profile?.public_identifier}`)
  const pid = profile?.provider_id || profile?.id
  if (pid) {
    await supabase.from('campaign_leads').update({ provider_id: pid }).eq('id', lead.id)
    console.log(`[resolve] updated stored provider_id for ${lead.name} to ${pid}`)
  }
  return pid || null
}

// ── Sequence tree walk ───────────────────────────────────────────
// The sequence is a real tree: a node's children live at
// node.config.noBranch / node.config.yesBranch, at any depth. runTree walks
// a sibling list depth-first; runNode executes exactly one node. Together
// they replace the old flat pre/post-connection split — a single recursive
// walk now handles both, distinguished by ctx.connected rather than by
// which function you're in.
//
// ctx fields: providerUserId, accountId, campaignId, workspaceId, lead,
// frequency, profile, connected (mutated: false until we know the lead is
// 1st-level, e.g. via a real cond_1st_level pass), invited (mutated: true
// once connection_request actually sends), halted (mutated: true once
// something pauses the walk — wait / connection_request / a message
// awaiting reply — the caller must stop recursing once this is set).

function treeHasType(nodeList, type) {
  return (nodeList || []).some(n =>
    n.type === type ||
    treeHasType(n.config?.noBranch, type) ||
    treeHasType(n.config?.yesBranch, type)
  )
}

// Mirrors the frontend's nodeHasBranches (CampaignDetail.jsx) — every node
// gets a Yes/No fork except wait/stop/voice_note.
function nodeHasBranches(type) {
  return type !== 'wait' && type !== 'stop' && type !== 'voice_note'
}

// Sequences saved before the branch-tree schema existed are a flat array —
// e.g. [cond_1st_level, connection_request, message, wait]. Walking that
// with runTree's branch dispatch mostly no-ops harmlessly (an undefined
// noBranch/yesBranch just does nothing), but cond_1st_level hard-disqualifies
// the lead (throws CONDITION_FAILED) when it fails pre-connection with no
// noBranch configured — exactly the shape legacy data has. Normalizing once
// before every read avoids that false disqualification and keeps execution
// consistent with what the builder now displays. Idempotent: nodes that
// already have a noBranch/yesBranch (real authored trees) pass through
// untouched. Mirrors normalizeLegacyFlatSequence in CampaignDetail.jsx.
const LEGACY_CONTINUE_BRANCH = {
  cond_1st_level: 'noBranch', // "Not Connected" is what used to just fall through
  // message/message_open/inmail have no "Replied" branch anymore (a reply
  // always hard-stops the sequence) — legacy flat data that just continued
  // to the next step regardless of a reply maps onto "Not Replied" instead,
  // the only branch that still runs further steps.
  message: 'noBranch',
  message_open: 'noBranch',
  inmail: 'noBranch',
}
function normalizeLegacyFlatSequence(list) {
  const arr = list || []
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const node = { ...arr[i] }
    const alreadyTree = !!(node.config?.noBranch || node.config?.yesBranch)
    if (nodeHasBranches(node.type) && !alreadyTree && i < arr.length - 1) {
      const rest = normalizeLegacyFlatSequence(arr.slice(i + 1))
      const continueBranch = LEGACY_CONTINUE_BRANCH[node.type] || 'yesBranch'
      const giveUpBranch = continueBranch === 'yesBranch' ? 'noBranch' : 'yesBranch'
      // The give-up branch never existed in flat data — give it a default
      // wait (same as any freshly-added node gets on both branches, see
      // addNode in CampaignDetail.jsx) rather than an immediate, wait-less Stop.
      node.config = {
        ...node.config,
        [continueBranch]: rest,
        [giveUpBranch]: [{ id: randomUUID(), type: 'wait', config: { days: 1, unit: 'days' } }],
      }
      out.push(node)
      break // `rest` has been absorbed — nothing left to iterate
    }
    if (node.config?.noBranch) node.config = { ...node.config, noBranch: normalizeLegacyFlatSequence(node.config.noBranch) }
    if (node.config?.yesBranch) node.config = { ...node.config, yesBranch: normalizeLegacyFlatSequence(node.config.yesBranch) }
    out.push(node)
  }
  return out
}

// Persists where a lead is paused, as a path of {nodeId, branch} steps from
// the tree root — branch says which of *that* node's branches to descend
// into to reach the next step (irrelevant/omitted on the last step, since
// that's the paused node itself). kind: 'wait' | 'reply' | 'connect'.
// claimId is a random token used to atomically claim this exact pending
// state later (see resumeFromPendingStep) — comparing via a JSONB path
// operator (`pending_step->>claimId`) rather than whole-object equality,
// which PostgREST doesn't handle reliably for jsonb columns.
async function persistPendingStep(ctx, { kind, path, deadline }) {
  const claimId = randomUUID()
  if (!supabase) return claimId
  await supabase.from('campaign_leads')
    .update({ pending_step: { kind, path, deadline, claimId } })
    .eq('provider_id', ctx.providerUserId)
    .eq('campaign_id', ctx.campaignId)
    .catch(() => {}) // ignore if column not yet migrated
  return claimId
}

// Finds the paused node (the last step in `path`) anywhere in `rootNodes`,
// returning it plus its index and the sibling list it lives in (so the
// caller can continue with the nodes after it) — or null if it no longer
// exists (the sequence was edited while this lead was paused, or its id was
// dropped). Searches by id rather than re-walking `path`'s branch hops: a
// pending_step persisted before normalizeLegacyFlatSequence nested a flat
// sequence can have its target node move to a different depth once
// normalized, and node ids are unique, so a plain search is both simpler and
// robust to that reshaping.
function resolveFromPath(rootNodes, path) {
  const targetId = path?.[path.length - 1]?.nodeId
  if (!targetId) return null
  function search(list) {
    const l = list || []
    const idx = l.findIndex(n => n.id === targetId)
    if (idx !== -1) return { node: l[idx], index: idx, containingList: l }
    for (const n of l) {
      const inNo = search(n.config?.noBranch)
      if (inNo) return inNo
      const inYes = search(n.config?.yesBranch)
      if (inYes) return inYes
    }
    return null
  }
  return search(rootNodes)
}

async function runTree(nodeList, ctx, pathToList = []) {
  const list = nodeList || []
  for (let idx = 0; idx < list.length; idx++) {
    const node = list[idx]
    if (node.type === 'stop') return

    const pathToNode = [...pathToList, { nodeId: node.id, branch: null }]
    const outcome = await runNode(node, ctx, pathToNode)
    if (ctx.halted) return

    if (outcome?.pauseForReply) {
      // No configurable timeout — give up and take the "Not Replied" path
      // after a fixed 3 days. A reply, whenever it actually arrives, is
      // handled separately as an unconditional stop (see resumeFromPendingStep).
      const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      console.log(`[sequence] ${node.type} sent — pausing for reply (timeout ${deadline}) for ${ctx.providerUserId}`)
      await persistPendingStep(ctx, { kind: 'reply', path: pathToNode, deadline })
      ctx.halted = true
      return
    }

    if (outcome && !outcome.skipped) {
      const branchKey = outcome.ok ? 'yesBranch' : 'noBranch'
      const pathIntoBranch = [...pathToList, { nodeId: node.id, branch: branchKey }]
      await runTree(node.config?.[branchKey], ctx, pathIntoBranch)
      if (ctx.halted) return
    }

    // Stagger consecutive message sends so they don't fire simultaneously.
    const MESSAGE_TYPES = ['message', 'message_open', 'inmail']
    const nextNode = list[idx + 1]
    if (MESSAGE_TYPES.includes(node.type) && nextNode && MESSAGE_TYPES.includes(nextNode.type)) {
      const delayMs = (2 + Math.floor(Math.random() * 3)) * 60 * 1000
      console.log(`[sequence] waiting ${Math.round(delayMs / 60000)} min before next message for ${ctx.providerUserId}`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

// Executes exactly one node. Returns:
//   { ok: true }                  — succeeded / condition passed → Yes branch
//   { ok: false, error }          — failed / condition failed → No branch
//   { ok: true, skipped: true }   — nothing to branch on, just continue
//   { ok: true, pauseForReply: true } — message sent, awaiting Replied/Not Replied
//   undefined                     — node itself paused the walk (sets ctx.halted)
async function runNode(node, ctx, pathToNode) {
  const { providerUserId, accountId, campaignId, lead, frequency = {}, profile, signalVars } = ctx

  // connection_request — errors must propagate uncaught so the invite-send
  // loop (runCampaignInvites) can classify pending/failed/rate-limited.
  if (node.type === 'connection_request') {
    // Locked: checkAccountSendAllowed's daily-limit check and the actual
    // send must be atomic w.r.t. any other job sending from this same
    // account (another campaign, or a manual send), otherwise two
    // concurrent callers can both pass the check before either sends.
    await withAccountLock(accountId, async () => {
      const acctCheck = await checkAccountSendAllowed(accountId, 'connection_request')
      if (!acctCheck.allowed) {
        console.log(`[sequence] connection_request blocked for ${lead?.name} — ${acctCheck.reason}`)
        const err = new Error(acctCheck.reason)
        err.safetyBlock = true
        throw err
      }
      const rawNote = node.config?.note || undefined
      let note = rawNote ? interpolateVars(rawNote, lead, profile, signalVars) : undefined
      if (note && note.length > 300) {
        console.warn(`[sequence] connection request note truncated from ${note.length} to 300 chars for ${lead?.name}`)
        note = note.slice(0, 297) + '...'
      }
      console.log(`[sequence] sending connection request to ${lead?.name}`)
      await linkedin.sendInvite({ accountId, providerUserId, message: note })
      logSend(accountId, 'connection_request')
      if (lead?.id) logLeadActivity(campaignId, lead.id, 'invite_sent')
    })
    ctx.invited = true
    await persistPendingStep(ctx, { kind: 'connect', path: pathToNode, deadline: null })
    ctx.halted = true
    return
  }

  // wait — pauses the walk and resumes automatically once the delay elapses,
  // whether pre- or post-connection (see resumeFromPendingStep + the
  // pending_step-aware query in runCampaignInvites, which keeps a paused
  // lead from being re-picked-up and restarted from the top in the meantime).
  if (node.type === 'wait') {
    const n = node.config?.days || 1
    const unit = node.config?.unit || 'days'
    const msPerUnit = unit === 'minutes' ? 60 * 1000 : unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    const delayMs = n * msPerUnit
    const deadline = new Date(Date.now() + delayMs).toISOString()
    console.log(`[sequence] wait ${n} ${unit} for ${providerUserId} (resume at ${deadline})`)
    const claimId = await persistPendingStep(ctx, { kind: 'wait', path: pathToNode, deadline })
    await enqueueResumePendingStep(providerUserId, campaignId, { claimId, delayMs })
    ctx.halted = true
    return
  }

  // ── Conditions — each returns {ok}; runTree handles branch dispatch.
  // A hard-fail (condition failed, no noBranch configured) only disqualifies
  // the lead while we're still pre-connection (ctx.connected === false) —
  // once connected, a failed check just means "don't take that path", same
  // as the old post-connection behavior.
  switch (node.type) {
    case 'cond_has_linkedin': {
      const passed = !!lead?.linkedin_url
      if (!passed) console.log(`[sequence] cond_has_linkedin FAILED for ${lead?.name}`)
      if (!passed && !ctx.connected && !node.config?.noBranch?.length)
        throw new Error('CONDITION_FAILED:cond_has_linkedin')
      return { ok: passed }
    }
    case 'cond_1st_level': {
      if (ctx.connected) return { ok: true } // already connected — always passes
      try {
        const data = await unipileRelations.list({ accountId, limit: 1000 })
        const relations = data?.items || data?.objects || data?.relations || []
        const isConnected = relations.some(r => r.provider_id === providerUserId || r.id === providerUserId)
        if (isConnected) {
          console.log(`[sequence] cond_1st_level PASSED for ${lead?.name} — already connected`)
          ctx.connected = true
        } else {
          console.log(`[sequence] cond_1st_level FAILED for ${lead?.name} — not yet connected`)
          if (!node.config?.noBranch?.length) throw new Error('CONDITION_FAILED:cond_1st_level')
        }
        return { ok: isConnected }
      } catch (err) {
        if (err.message?.startsWith('CONDITION_FAILED')) throw err
        console.log(`[sequence] cond_1st_level check error: ${err.message}`)
        return { ok: true, skipped: true }
      }
    }
    case 'cond_check_column': {
      const field = node.config?.field
      const expected = (node.config?.value || '').toLowerCase()
      const actual = String(lead?.[field] || lead?.[field?.toLowerCase()] || '').toLowerCase()
      const passed = !field || !expected || actual.includes(expected)
      if (!passed) console.log(`[sequence] cond_check_column FAILED for ${lead?.name} — ${field} !contains "${expected}"`)
      if (!passed && !ctx.connected && !node.config?.noBranch?.length)
        throw new Error('CONDITION_FAILED:cond_check_column')
      return { ok: passed }
    }
    case 'cond_open_profile': {
      try {
        const profileData = await linkedin.visitProfile(accountId, providerUserId)
        const isOpen = profileData?.is_open_profile || profileData?.open_profile || profileData?.openProfile || false
        if (!isOpen) {
          console.log(`[sequence] cond_open_profile FAILED for ${lead?.name} — not an open profile`)
          if (!ctx.connected && !node.config?.noBranch?.length) throw new Error('CONDITION_FAILED:cond_open_profile')
        } else {
          console.log(`[sequence] cond_open_profile PASSED for ${lead?.name}`)
        }
        return { ok: isOpen }
      } catch (err) {
        if (err.message?.startsWith('CONDITION_FAILED')) throw err
        console.log(`[sequence] cond_open_profile check error — passing through: ${err.message}`)
        return { ok: true, skipped: true }
      }
    }
    case 'cond_opened_message': {
      if (!ctx.connected) {
        console.log(`[sequence] cond_opened_message cannot be evaluated pre-connection — passing through`)
        return { ok: true, skipped: true }
      }
      try {
        const chatId = lead?.chat_id
        if (!chatId) {
          console.log(`[sequence] cond_opened_message — no chat found for ${providerUserId}, passing through`)
          return { ok: true, skipped: true }
        }
        const messagesData = await unipileChats.getMessages(chatId, { limit: 50 })
        const messages = messagesData?.items || messagesData?.objects || []
        const hasBeenOpened = messages.some(m =>
          (m.is_sender === 1 || m.is_sender === true) &&
          (m.is_read || m.seen || m.read_at || m.seen_at)
        )
        console.log(`[sequence] cond_opened_message ${hasBeenOpened ? 'PASSED' : 'FAILED'} for ${providerUserId}`)
        return { ok: hasBeenOpened }
      } catch (err) {
        console.log(`[sequence] cond_opened_message check error — continuing: ${err.message}`)
        return { ok: true, skipped: true }
      }
    }
    case 'icp_score_check':
      // No real scoring implemented yet — deliberate no-op, not a fallthrough.
      return { ok: true, skipped: true }
    case 'voice_note':
      console.log(`[sequence] voice_note not supported via Unipile — skipping`)
      return { ok: true, skipped: true }
    default:
      break // fall through to leaf actions below
  }

  // ── Leaf actions + message sends — shared try/catch; failures return
  // {ok:false} (take the No/Failed branch) rather than throwing.
  try {
    // Account-level pause / active-hours gate — applies to every outbound
    // LinkedIn action, not just connection requests, so pausing an account
    // (or its hours closing) stops profile visits/likes/follows/comments too.
    const SENDING_NODE_TYPES = ['visit_profile', 'like_post', 'follow', 'comment_post', 'reply_comment', 'message', 'message_open', 'inmail']
    // Locked for the same reason as connection_request above — the gate
    // check and the send itself must be atomic w.r.t. other concurrent
    // sends from this account. add_tag/other non-sending node types pass
    // through the lock too (cheap, held only for a quick Supabase update).
    return await withAccountLock(accountId, async () => {
    let acctSafety = null
    if (SENDING_NODE_TYPES.includes(node.type)) {
      const acctGate = await checkAccountAvailable(accountId)
      if (!acctGate.allowed) {
        console.log(`[sequence] ${node.type} skipped for ${providerUserId} — ${acctGate.reason}`)
        return { ok: true, skipped: true }
      }
      acctSafety = acctGate.safety
    }
    switch (node.type) {
      case 'visit_profile': {
        if (!(await withinDailyLimit(accountId, 'profile_visit', frequency.profileVisits))) {
          console.log(`[sequence] visit_profile skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        // Visiting a profile has no downstream state keyed to the acting
        // account (unlike connection_request, whose invite has to be sent
        // from — and later polled against — the campaign's account), so a
        // per-step override is safe: fall back to the campaign account.
        const visitAccountId = node.config?.accountId || accountId
        await linkedin.visitProfile(visitAccountId, providerUserId)
        logSend(visitAccountId, 'profile_visit')
        console.log(`[sequence] visited profile of ${providerUserId} via account ${visitAccountId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'visited_profile')
        return { ok: true }
      }
      case 'like_post': {
        if (!(await withinDailyLimit(accountId, 'like_post', frequency.likesToPosts))) {
          console.log(`[sequence] like_post skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
        const posts = postsData?.items || postsData?.objects || []
        if (!posts.length) {
          console.log(`[sequence] like_post — no posts found for ${providerUserId}`)
          return { ok: false, error: 'no_posts' }
        }
        const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
        await linkedin.likePost(accountId, postId)
        logSend(accountId, 'like_post')
        console.log(`[sequence] liked post ${postId} for ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'liked_post')
        return { ok: true }
      }
      case 'follow': {
        if (!(await withinDailyLimit(accountId, 'follow', frequency.followLead))) {
          console.log(`[sequence] follow skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        await linkedin.followUser(accountId, providerUserId)
        logSend(accountId, 'follow')
        console.log(`[sequence] followed ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'followed')
        return { ok: true }
      }
      case 'comment_post':
      case 'reply_comment': {
        if (!(await withinDailyLimit(accountId, 'comment_post', frequency.aiComments))) {
          console.log(`[sequence] ${node.type} skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const commentText = node.config?.text?.trim()
        if (!commentText) return { ok: false, error: 'missing_text' }
        const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
        const posts = postsData?.items || postsData?.objects || []
        if (!posts.length) {
          console.log(`[sequence] ${node.type} — no posts found for ${providerUserId}`)
          return { ok: false, error: 'no_posts' }
        }
        const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
        const text = interpolateVars(commentText, lead || {}, profile, signalVars)
        await linkedin.commentOnPost(accountId, postId, text)
        logSend(accountId, 'comment_post')
        console.log(`[sequence] ${node.type} on post ${postId} for ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'commented')
        return { ok: true }
      }
      case 'add_tag': {
        if (node.config?.tag && lead?.id) {
          const { data: existingLead } = await supabase
            .from('campaign_leads').select('tags').eq('id', lead.id).single()
          const existingTags = existingLead?.tags || []
          if (!existingTags.includes(node.config.tag)) {
            await supabase.from('campaign_leads')
              .update({ tags: [...existingTags, node.config.tag] })
              .eq('id', lead.id)
          }
          console.log(`[sequence] tagged ${lead?.name || providerUserId} with "${node.config.tag}"`)
        }
        return { ok: true }
      }
      case 'message':
      case 'message_open': {
        if (!node.config?.text?.trim()) return { ok: false, error: 'missing_text' }
        if (!(await withinDailyLimit(accountId, 'message', frequency.messages))) {
          console.log(`[sequence] ${node.type} skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const acctLimits = getEffectiveLimits(acctSafety)
        const acctMsgUsage = await getDailyUsage([accountId])
        if (acctLimits.dailyMessageLimit && (acctMsgUsage[accountId]?.messages || 0) >= acctLimits.dailyMessageLimit) {
          console.log(`[sequence] ${node.type} skipped for ${providerUserId} — account daily message limit reached`)
          return { ok: true, skipped: true }
        }
        const text = interpolateVars(node.config.text.trim(), lead || {}, profile, signalVars)
        const attachments = node.config?.attachments || []
        await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
        logSend(accountId, 'message')
        console.log(`[sequence] sent ${node.type} to ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'message_sent')
        // There's no "Replied" branch to run — a reply always hard-stops the
        // sequence (see resumeFromPendingStep). Only pause if there's a
        // "Not Replied" follow-up to fall back to.
        const hasFollowUp = node.config?.noBranch?.length
        return hasFollowUp ? { ok: true, pauseForReply: true } : { ok: true, skipped: true }
      }
      case 'inmail': {
        if (!node.config?.body?.trim()) return { ok: false, error: 'missing_body' }
        if (!(await withinDailyLimit(accountId, 'inmail', frequency.inmails))) {
          console.log(`[sequence] inmail skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const acctLimitsInmail = getEffectiveLimits(acctSafety)
        const acctInmailUsage = await getDailyUsage([accountId])
        if (acctLimitsInmail.dailyMessageLimit && (acctInmailUsage[accountId]?.messages || 0) >= acctLimitsInmail.dailyMessageLimit) {
          console.log(`[sequence] inmail skipped for ${providerUserId} — account daily message limit reached`)
          return { ok: true, skipped: true }
        }
        const body    = interpolateVars(node.config.body.trim(), lead || {}, profile, signalVars)
        const subject = interpolateVars(node.config.subject || '', lead || {}, profile, signalVars)
        const text    = subject ? `${subject}\n\n${body}` : body
        const attachments = node.config?.attachments || []
        await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
        logSend(accountId, 'inmail')
        console.log(`[sequence] sent inmail to ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'inmail_sent')
        // No "Replied" branch — a reply always hard-stops the sequence.
        const hasFollowUp = node.config?.noBranch?.length
        return hasFollowUp ? { ok: true, pauseForReply: true } : { ok: true, skipped: true }
      }
      default:
        console.log(`[sequence] runNode — unhandled type: ${node.type}`)
        return { ok: true, skipped: true }
    }
    })
  } catch (err) {
    console.error(`[sequence] ${node.type} error for ${providerUserId}: ${err.message}`)
    // A failed send has nothing to reply to — take the Failed/Not-Replied
    // branch immediately rather than pausing.
    return { ok: false, error: err.message }
  }
}

// Runs the invite-sending walk for one lead, from the tree root. Throws on
// hard failure (provider_id unresolvable, a disqualifying condition with no
// fallback branch, or the connection_request API call itself failing) — the
// caller (runCampaignInvites) classifies the error into a lead status.
// Returns { invited, connected } — connected-without-invited means the walk
// found the lead already connected (e.g. "If Connected → Yes") and never
// needed to send a request at all.
async function executePreConnectionSteps(lead, sequence, accountId, workspaceId, campaignId, frequency = {}, agentId = null) {
  const providerUserId = await resolveProviderId(lead, accountId)
  if (!providerUserId) throw new Error('Cannot resolve provider_id for lead')

  const profile = await getWorkspaceProfile(workspaceId)
  const signalVars = buildSignalVars(agentId ? await getScore(agentId, providerUserId) : null, lead)
  const ctx = {
    providerUserId, accountId, campaignId, workspaceId, lead, frequency, profile, signalVars,
    connected: false, invited: false, halted: false,
  }

  const nodes = normalizeLegacyFlatSequence(sequence?.nodes || [])
  if (!treeHasType(nodes, 'connection_request')) {
    // No connection_request anywhere in the sequence — fall back to just
    // sending the invite directly (matches the pre-nesting fallback).
    await runNode({ type: 'connection_request', config: {} }, ctx, [{ nodeId: '__implicit_connect__', branch: null }])
    return { invited: ctx.invited, connected: ctx.connected }
  }

  await runTree(nodes, ctx, [])
  return { invited: ctx.invited, connected: ctx.connected }
}

// Resumes a walk that's paused anywhere in the tree (wait / connect / reply).
// `outcome` only matters for 'reply' (replied vs timeout) and 'connect'
// (always 'connected' — this is only ever called once we know they accepted).
// The claim is atomic: the update is guarded by matching the exact
// pending_step we read, so a webhook and a timeout/poll racing for the same
// lead only resolve once.
// A resumed walk can now advance a lead past 'pending' for the first time —
// e.g. a pre-connection wait that resumes straight into connection_request —
// which nothing else updates campaign_leads.status for. Brings it forward,
// but never regresses it (a lead can legitimately already be further along,
// e.g. 'replied', by the time an unrelated pending step resolves).
const LEAD_STATUS_RANK = { pending: 0, invited: 1, connected: 2, replied: 3, booked: 4 }
const CONNECTED_STATUSES = ['connected', 'replied', 'booked']
async function syncLeadStatusFromCtx(leadId, ctx) {
  if (!ctx.invited && !ctx.connected) return
  const target = ctx.connected && !ctx.invited ? 'connected' : 'invited'
  const { data: row } = await supabase.from('campaign_leads').select('status').eq('id', leadId).single()
  const current = row?.status || 'pending'
  if ((LEAD_STATUS_RANK[target] ?? 0) > (LEAD_STATUS_RANK[current] ?? 0)) {
    await updateLeadStatus(leadId, target)
  }
}

// Returns true if a pending step was found and resumed, false if there was
// nothing pending for this lead (caller may then fall back to something else).
export async function resumeFromPendingStep(providerUserId, campaignId, outcome = null) {
  if (!supabase || !providerUserId || !campaignId) return false
  try {
    const { data: leadRow } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('provider_id', providerUserId)
      .eq('campaign_id', campaignId)
      .maybeSingle()

    const pending = leadRow?.pending_step
    if (!pending?.path?.length || !pending.claimId) return false

    const { data: claimed } = await supabase
      .from('campaign_leads')
      .update({ pending_step: null })
      .eq('provider_id', providerUserId)
      .eq('campaign_id', campaignId)
      .eq('pending_step->>claimId', pending.claimId) // atomic: only clears if still this exact pending state
      .select('id')

    if (!claimed?.length) return true // already claimed by a race (webhook vs. poll) — still "handled"

    // A reply (or a booked meeting) means the builder is done with this
    // lead — stop unconditionally, no matter what step it was paused on
    // (a reply-wait, a plain wait, mid-connect). leadRow was read fresh
    // above, and the message_received webhook sets status:'replied' before
    // ever calling us, so this reliably catches a reply that landed while
    // the lead was paused anywhere else in the sequence.
    if (['replied', 'booked'].includes(leadRow.status)) {
      console.log(`[sequence] ${providerUserId} already ${leadRow.status} — stopping remaining automation`)
      return true
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('sequence, settings, workspace_id')
      .eq('id', campaignId)
      .single()
    if (!campaign?.sequence?.nodes) return true
    const sequenceNodes = normalizeLegacyFlatSequence(campaign.sequence.nodes)

    const loc = resolveFromPath(sequenceNodes, pending.path)
    if (!loc) {
      console.warn(`[sequence] resumeFromPendingStep — node in path no longer exists for ${providerUserId}, dropping pending state`)
      return true
    }

    const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
    const effectiveWsId = campaign.workspace_id
    const frequency = campaign.settings?.frequency || {}
    const profile = await getWorkspaceProfile(effectiveWsId)
    const agentId = campaign.settings?.agentId || null
    const signalVars = buildSignalVars(agentId ? await getScore(agentId, providerUserId) : null, leadRow)
    const ctx = {
      providerUserId, accountId, campaignId, workspaceId: effectiveWsId, lead: leadRow,
      frequency, profile, signalVars,
      connected: CONNECTED_STATUSES.includes(leadRow?.status),
      invited: leadRow?.status !== 'pending',
      halted: false,
    }

    console.log(`[sequence] resuming ${pending.kind} for ${providerUserId} — outcome: ${outcome || 'n/a'}`)

    // pending.path's last entry already points at loc.node (with branch:
    // null, since it was the halt target) — replace that entry's branch
    // rather than appending a duplicate for the same node.
    if (pending.kind === 'connect') {
      const branchKey = outcome === 'connected' ? 'yesBranch' : 'noBranch'
      const pathIntoBranch = [...pending.path.slice(0, -1), { nodeId: loc.node.id, branch: branchKey }]
      await runTree(loc.node.config?.[branchKey], ctx, pathIntoBranch)
      if (ctx.halted) {
        await syncLeadStatusFromCtx(leadRow.id, ctx)
        return true
      }
    } else if (pending.kind === 'reply') {
      // Only reachable when the lead hasn't replied (the hard-stop above
      // already caught that case) — this is the reply timeout firing, so
      // take the "Not Replied" follow-up path. There's no "Replied" branch
      // to run.
      const pathIntoBranch = [...pending.path.slice(0, -1), { nodeId: loc.node.id, branch: 'noBranch' }]
      await runTree(loc.node.config?.noBranch, ctx, pathIntoBranch)
      if (ctx.halted) {
        await syncLeadStatusFromCtx(leadRow.id, ctx)
        return true
      }
    }
    // 'wait' just continues — nothing to resolve, fall through.

    try {
      await runTree(loc.containingList.slice(loc.index + 1), ctx, pending.path.slice(0, -1))
      await syncLeadStatusFromCtx(leadRow.id, ctx)
    } catch (err) {
      // Only reachable now that a pre-connection wait can resume straight into
      // connection_request (previously connection_request was only ever hit
      // from the initial synchronous walk). Classify the same way the main
      // send-invites loop does, so e.g. "already connected" lands on a sane
      // status instead of silently leaving the lead stuck on 'pending'.
      const invErr = classifyInviteError(err)
      if (invErr.status) {
        await updateLeadStatus(leadRow.id, invErr.status, invErr.reason)
        logLeadActivity(campaignId, leadRow.id, invErr.status, invErr.reason)
      } else {
        console.error(`[sequence] resumed walk failed for ${providerUserId}, leaving pending for retry:`, err.message)
      }
    }
    return true
  } catch (err) {
    console.error('[sequence] resumeFromPendingStep error:', err.message)
    return true // treat as handled — don't let the caller double-run on error
  }
}

// Depth-first search for the first node of `type` anywhere in the tree.
// Returns { node, index, containingList } (same shape as resolveFromPath) or
// null. Used only as a fallback when there's no persisted pending_step to
// resume from (e.g. a lead invited before this column existed).
function locateNodeByType(nodeList, type) {
  const list = nodeList || []
  const index = list.findIndex(n => n.type === type)
  if (index !== -1) return { node: list[index], index, containingList: list }
  for (const n of list) {
    const inNo = locateNodeByType(n.config?.noBranch, type)
    if (inNo) return inNo
    const inYes = locateNodeByType(n.config?.yesBranch, type)
    if (inYes) return inYes
  }
  return null
}

// Entry point once a lead is known to be connected (new_relation webhook, or
// a fresh manual sync). Prefers resuming from the exact point where
// connection_request paused (persisted via pending_step) — this correctly
// skips whatever pre-connection actions already ran. Falls back to locating
// connection_request fresh (for leads invited before pending_step existed)
// or, if the sequence has none, running the whole tree with connected=true.
export async function executePostConnectionSteps(providerUserId, accountId, campaignId, workspaceId) {
  try {
    const resumed = await resumeFromPendingStep(providerUserId, campaignId, 'connected')
    if (resumed) return

    const { data: campaign } = await supabase
      .from('campaigns').select('sequence, settings, workspace_id').eq('id', campaignId).single()
    if (!campaign?.sequence?.nodes) return
    const sequenceNodes = normalizeLegacyFlatSequence(campaign.sequence.nodes)

    const schedule = campaign.settings?.schedule
    const timezone = campaign.settings?.timezone || 'UTC'
    if (schedule?.length && !isWithinSchedule(schedule, timezone)) {
      console.log(`[sequence] post-connection steps skipped — outside active schedule (${timezone})`)
      return
    }

    const { data: lead } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('provider_id', providerUserId)
      .maybeSingle()

    // Stop automated follow-ups if the prospect has already replied or booked —
    // they're in an active conversation and shouldn't receive sequence blasts.
    if (lead && ['replied', 'booked'].includes(lead.status)) {
      console.log(`[sequence] Skipping remaining steps for ${providerUserId} — prospect has already ${lead.status}`)
      return
    }

    const effectiveWsId = workspaceId || campaign?.workspace_id
    const profile = await getWorkspaceProfile(effectiveWsId)
    const frequency = campaign.settings?.frequency || {}
    const agentId = campaign.settings?.agentId || null
    const signalVars = buildSignalVars(agentId ? await getScore(agentId, providerUserId) : null, lead)
    const ctx = {
      providerUserId, accountId, campaignId, workspaceId: effectiveWsId, lead,
      frequency, profile, signalVars, connected: true, invited: true, halted: false,
    }

    const connectLoc = locateNodeByType(sequenceNodes, 'connection_request')
    if (connectLoc) {
      // Run the Accepted/yes branch of connection_request, then continue
      // with whatever comes after it in the same list — skipping anything
      // before it (already executed pre-connection).
      await runTree(connectLoc.node.config?.yesBranch, ctx, [{ nodeId: connectLoc.node.id, branch: 'yesBranch' }])
      if (ctx.halted) return
      await runTree(connectLoc.containingList.slice(connectLoc.index + 1), ctx, [])
      return
    }

    // No connection_request anywhere in the sequence — treat the whole tree
    // as post-connection (matches the pre-nesting fallback).
    await runTree(sequenceNodes, ctx, [])
  } catch (err) {
    console.error('[sequence] post-connection steps error:', err.message)
  }
}

// ── Shared: sync invited leads → connected for a campaign ──────
export async function syncCampaignStatuses(campaignId, workspaceId) {
  const query = supabase.from('campaigns').select('*').eq('id', campaignId)
  if (workspaceId && workspaceId !== 'ws_default') query.eq('workspace_id', workspaceId)
  const { data: campaign } = await query.single()
  if (!campaign) throw new Error('Campaign not found')

  const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
  if (!accountId) return { connected: 0, checked: 0, message: 'No LinkedIn account configured' }

  const { data: invitedLeads } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'invited')

  if (!invitedLeads?.length) return { connected: 0, checked: 0, message: 'No invited leads to check' }

  let allRelations = []
  try {
    const data = await unipileRelations.list({ accountId, limit: 1000 })
    allRelations = data?.items || data?.objects || data?.relations || []
  } catch (err) {
    throw new Error(`Unipile relations fetch failed: ${err.message}`)
  }

  const connectedIds = new Set(allRelations.map(r => r.member_id || r.provider_id || r.id).filter(Boolean))
  console.log(`[sync] ${allRelations.length} relations fetched, checking ${invitedLeads.length} invited leads`)
  const { handleNewConnection } = await import('../webhooks/unipile.js')

  let connected = 0
  for (const lead of invitedLeads) {
    if (!lead.provider_id) continue
    if (connectedIds.has(lead.provider_id)) {
      console.log(`[sync] ${lead.name} is now connected — running post-connection steps`)
      await handleNewConnection({ providerUserId: lead.provider_id, prospectName: lead.name || '', accountId })
      connected++
    }
  }

  return { connected, checked: invitedLeads.length }
}

// ── POST /api/campaigns/:id/sync-statuses ──────────────────────
// Polls Unipile relations list and detects which "invited" leads have accepted.
// Triggers post-connection steps (builder message + AI) for each new connection.
router.post('/:id/sync-statuses', async (req, res) => {
  try {
    const result = await syncCampaignStatuses(req.params.id, wsId(req))
    res.json(result)
  } catch (err) {
    console.error('[sync-statuses] error:', err)
    const status = err.message === 'Campaign not found' ? 404 : 500
    res.status(status).json({ message: err.message })
  }
})

// Classify an invite-send error into a lead outcome.
// Returns { status, reason, stop } — status null means "leave as pending" (retried next run),
// stop true means the whole loop should halt (account-level problem, no point continuing).
function classifyInviteError(err) {
  // Our own account-safety gate (paused / outside active hours / daily limit
  // reached) — not a LinkedIn API error, but the same "stop the loop, leave
  // leads pending for retry later" outcome applies.
  if (err.safetyBlock) {
    return { status: null, reason: err.message, stop: true }
  }

  const msg = err.message || ''
  const typ = err.data?.type || ''
  const code = err.data?.code || err.data?.error_code || ''
  const text = `${msg} ${typ} ${code}`.toLowerCase()
  const httpStatus = err.status

  if (msg.startsWith('CONDITION_FAILED')) {
    return { status: 'skipped', reason: msg, stop: false }
  }
  // Recipient is already a 1st-level connection — not a failure
  if (/already[ _-]?connect|already.*relation|relation.*exist|RELATION_ALREADY_EXIST/i.test(text)) {
    return { status: 'connected', reason: null, stop: false }
  }
  // Temporary provider / LinkedIn rate limit — stop the loop and leave leads pending for retry later
  // "cannot_resend_yet" means LinkedIn is throttling this account, NOT that an invite is already pending
  const dataType = (err.data?.type || '').toLowerCase()
  if (dataType === 'errors/cannot_resend_yet' ||
      /cannot_resend_yet|temporary.*provider.*limit|provider.*limit|provider.*temporary/i.test(text)) {
    console.warn(`[send-invites] LinkedIn provider rate limit hit — stopping loop, leads stay pending`)
    return { status: null, reason: msg, stop: true }
  }
  // Invitation already pending on LinkedIn (e.g. sent before a restart, or manually)
  if (/already[ _-]?invit|invitation.*(pending|exist|sent)|invited[ _-]?recently|invalid_recipient|INVITATION_ALREADY|PENDING_INVITATION/i.test(text)) {
    return { status: 'invited', reason: null, stop: false }
  }
  // Account-level problems — stop the loop, leave leads pending for retry
  if (httpStatus === 401 || httpStatus === 403 ||
      /disconnected[ _-]?account|checkpoint|credentials|expired[ _-]?(token|session)|insufficient[ _-]?credits|weekly.*limit|limit.*(week|invitation)/.test(text)) {
    return { status: null, reason: msg, stop: true }
  }
  // Transient: rate limits, provider/network hiccups — leave pending, retry next run
  if (httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 599) ||
      /rate[ _-]?limit|too[ _-]?many[ _-]?request|provider[ _-]?unavailable|fetch failed|network|timeout|econnreset|socket/.test(text)) {
    return { status: null, reason: msg, stop: false }
  }
  // Unknown 400/422 — transient or bad data; leave pending so user can retry
  if (httpStatus === 400 || httpStatus === 422) {
    console.warn(`[send-invites] ${httpStatus} from Unipile — leaving pending for retry. Error: ${msg}`)
    return { status: null, reason: msg, stop: false }
  }
  // Genuine permanent failure (bad profile URL, unresolvable provider_id, …)
  return { status: 'failed', reason: msg, stop: false }
}

// Update lead status + last_error; falls back to status-only if the
// last_error column hasn't been added to campaign_leads yet.
async function updateLeadStatus(leadId, status, lastError = null) {
  const { error } = await supabase
    .from('campaign_leads')
    .update({ status, last_error: lastError })
    .eq('id', leadId)
  if (error) {
    await supabase.from('campaign_leads').update({ status }).eq('id', leadId)
  }
}

// ── Connection request delay ─────────────────────────────────────
// Configurable per-campaign via settings.sendingDelay = { min, max } (whole
// minutes, inclusive range, randomized between each connection request).
// SENDING_DELAY_PRESETS mirrors the frontend's copy (CampaignDetail.jsx) —
// duplicated rather than shared over HTTP since the frontend just writes
// whichever {min, max} a preset resolves to into settings.sendingDelay; the
// backend only ever needs to read those two numbers, never the preset name.
// "normal" matches the delay this used to be hardcoded to, so an existing
// campaign with no sendingDelay configured behaves exactly as before.
export const SENDING_DELAY_PRESETS = {
  warmup:   { min: 30, max: 60 }, // new/recently-restricted accounts — slowest
  normal:   { min: 15, max: 20 }, // established accounts — previous hardcoded default
  cautious: { min: 20, max: 35 }, // extra safety margin above normal
}
// Absolute floor regardless of what's stored — protects against a
// misconfigured/corrupted settings value (e.g. 0 or negative) producing
// near-instant, obviously-automated sends.
const MIN_SAFE_CONNECTION_DELAY_MINUTES = 1

// Reads settings.sendingDelay, falling back to the "normal" preset, and
// clamps/repairs anything unsafe (non-numeric, negative, or min > max).
export function resolveConnectionDelayRange(settings) {
  let min = Number(settings?.sendingDelay?.min)
  let max = Number(settings?.sendingDelay?.max)
  if (!Number.isFinite(min)) min = SENDING_DELAY_PRESETS.normal.min
  if (!Number.isFinite(max)) max = SENDING_DELAY_PRESETS.normal.max
  if (min > max) [min, max] = [max, min]
  min = Math.max(MIN_SAFE_CONNECTION_DELAY_MINUTES, Math.round(min))
  max = Math.max(min, Math.round(max))
  return { min, max }
}

// Uniform-random whole-minute delay in [min, max] — same distribution the
// old hardcoded `15 + Math.floor(Math.random() * 6)` used, generalized to
// any range.
export function randomDelayMs(min, max) {
  const span = Math.max(0, max - min)
  const minutes = min + Math.floor(Math.random() * (span + 1))
  return minutes * 60 * 1000
}

// Backoff before re-checking a send-batch chain that's blocked by the
// campaign schedule or the account's own gate (paused / outside active
// hours) — short enough to resume promptly once the window reopens,
// long enough not to hammer Supabase while it stays closed.
const SCHEDULE_RECHECK_BACKOFF_MS = 20 * 60 * 1000

// ── Shared: run send-invites logic for a campaign ──────────────
// Returns { queued, message } or throws. Used by both the route and the scheduler.
export async function runCampaignInvites(campaignId, workspaceId) {
  if (await isSendBatchRunning(campaignId)) {
    return { queued: 0, message: 'Invite sending already in progress for this campaign' }
  }
  const query = supabase.from('campaigns').select('*').eq('id', campaignId)
  if (workspaceId && workspaceId !== 'ws_default') query.eq('workspace_id', workspaceId)
  const { data: campaign } = await query.single()
  if (!campaign) throw new Error('Campaign not found')

  if (campaign.status !== 'active') {
    return { queued: 0, message: 'Campaign is paused' }
  }

  const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
  if (!accountId) throw new Error('Campaign has no LinkedIn account configured')

  const schedule = campaign.settings?.schedule
  const timezone = campaign.settings?.timezone || 'UTC'
  if (schedule?.length && !isWithinSchedule(schedule, timezone)) {
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date())
    return { queued: 0, message: `Outside active schedule (${dayName}, ${timezone})` }
  }

  // Account-level gate — paused or outside the account's own active sending
  // hours stops sending regardless of what the campaign's own schedule says.
  const acctSafety = await getAccountSafety(accountId)
  if (acctSafety.paused) {
    return { queued: 0, message: 'LinkedIn account sending is paused' }
  }
  if (!isWithinSchedule(
    (acctSafety.activeDays || []).map(day => ({ day, enabled: true, start: acctSafety.activeHours?.start, end: acctSafety.activeHours?.end })),
    acctSafety.timezone,
  )) {
    return { queued: 0, message: 'Outside account active sending hours' }
  }
  const acctLimits = getEffectiveLimits(acctSafety)

  // The effective daily connection-request cap is the stricter of the
  // campaign's own frequency setting and the account's own safety setting
  // (which also accounts for warm-up mode tightening it further).
  const dailyLimit = Math.min(
    campaign.settings?.frequency?.connectionRequests ?? campaign.settings?.dailyConnectionLimit ?? 20,
    acctLimits.dailyConnectionLimit || Infinity,
  )

  // Read today's count from the persisted send log (unipile_send_log), not
  // an in-memory counter — the in-memory version reset on every backend
  // restart/redeploy, silently granting a fresh budget each time and letting
  // far more than the configured limit go out over a day. This is also
  // scoped to the LinkedIn account rather than just this campaign, so two
  // campaigns sharing one account can't each independently max out the
  // account's real daily send capacity.
  const usage = await getDailyUsage([accountId])
  const sentToday = usage[accountId]?.requests || 0
  const remaining = dailyLimit - sentToday
  if (remaining <= 0) {
    return { queued: 0, message: `Daily limit of ${dailyLimit} already reached` }
  }

  const { data: pendingLeads } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .is('pending_step', null) // exclude leads paused mid-sequence (e.g. a pre-connection wait) — they resume on their own
    .limit(remaining)

  if (!pendingLeads?.length) {
    return { queued: 0, message: 'No pending leads' }
  }

  // Warm-up mode forces the slow warm-up pace regardless of the campaign's
  // own delay setting — it's a safety override, not a suggestion.
  const { min: delayMin, max: delayMax } = acctSafety.warmupMode
    ? { min: acctLimits.delayMin, max: acctLimits.delayMax }
    : resolveConnectionDelayRange(campaign.settings)

  console.log(`[send-invites] campaign=${campaignId} accountId=${accountId} leads=${pendingLeads.length} dailyLimit=${dailyLimit} sentToday=${sentToday || 0} delay=${delayMin}-${delayMax}min${acctSafety.warmupMode ? ' (warmup)' : ''}`)

  // Kick off a durable send-batch chain — see processSendBatchJob below for
  // the actual per-lead work. Each hop re-validates schedule/gate/limit
  // freshly (this upfront check is just for the response message).
  await enqueueSendBatch(campaignId, workspaceId || campaign.workspace_id)

  return { queued: pendingLeads.length, message: `Sending ${pendingLeads.length} connection request(s) with ${delayMin}–${delayMax} min delays` }
}

// Processes exactly one pending lead for a campaign's send-batch chain.
// Called by the campaign-sequence queue worker (services/campaignQueue.js)
// for the 'send-batch' job — that job stays alive for the whole chain via
// job.moveToDelayed, using the return value here as the next hop's delay.
// Returns the delay (ms) until the next lead should be attempted, or null
// once there's nothing left to do (chain complete, blocked, or halted).
export async function processSendBatchJob(campaignId, workspaceId) {
  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaignId).single()
  if (!campaign || campaign.status !== 'active') return null

  const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
  if (!accountId) return null

  const schedule = campaign.settings?.schedule
  const timezone = campaign.settings?.timezone || 'UTC'
  if (schedule?.length && !isWithinSchedule(schedule, timezone)) {
    console.log(`[send-invites] campaign=${campaignId} outside active sending window — rechecking in ${Math.round(SCHEDULE_RECHECK_BACKOFF_MS / 60000)} min`)
    return SCHEDULE_RECHECK_BACKOFF_MS
  }

  // Account-level gate — paused or outside the account's own active sending
  // hours stops sending regardless of what the campaign's own schedule says.
  const acctSafety = await getAccountSafety(accountId)
  if (acctSafety.paused) {
    console.log(`[send-invites] campaign=${campaignId} account ${accountId} sending paused — rechecking in ${Math.round(SCHEDULE_RECHECK_BACKOFF_MS / 60000)} min`)
    return SCHEDULE_RECHECK_BACKOFF_MS
  }
  if (!isWithinSchedule(
    (acctSafety.activeDays || []).map(day => ({ day, enabled: true, start: acctSafety.activeHours?.start, end: acctSafety.activeHours?.end })),
    acctSafety.timezone,
  )) {
    console.log(`[send-invites] campaign=${campaignId} outside account active sending hours — rechecking in ${Math.round(SCHEDULE_RECHECK_BACKOFF_MS / 60000)} min`)
    return SCHEDULE_RECHECK_BACKOFF_MS
  }
  const acctLimits = getEffectiveLimits(acctSafety)

  const dailyLimit = Math.min(
    campaign.settings?.frequency?.connectionRequests ?? campaign.settings?.dailyConnectionLimit ?? 20,
    acctLimits.dailyConnectionLimit || Infinity,
  )
  const usage = await getDailyUsage([accountId])
  const sentToday = usage[accountId]?.requests || 0
  if (dailyLimit - sentToday <= 0) {
    console.log(`[send-invites] campaign=${campaignId} daily limit of ${dailyLimit} reached — stopping chain for today`)
    return null
  }

  // Fetch two — process the first, and the mere presence of a second tells
  // us whether to keep the chain going without a second round-trip.
  const { data: pendingLeads } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .is('pending_step', null) // exclude leads paused mid-sequence (e.g. a pre-connection wait) — they resume on their own
    .order('created_at', { ascending: true })
    .limit(2)

  if (!pendingLeads?.length) return null

  const effectiveWsId = workspaceId || campaign.workspace_id
  const { min: delayMin, max: delayMax } = acctSafety.warmupMode
    ? { min: acctLimits.delayMin, max: acctLimits.delayMax }
    : resolveConnectionDelayRange(campaign.settings)

  const lead = pendingLeads[0]
  let halted = false
  try {
    const result = await executePreConnectionSteps(lead, campaign.sequence, accountId, effectiveWsId, campaignId, campaign.settings?.frequency || {}, campaign.settings?.agentId || null)
    if (result?.invited || result?.connected) {
      // Nested branching can reach "already connected" without ever sending
      // a request (e.g. an "If Connected → Yes" path) — mark accordingly
      // instead of always assuming an invite went out.
      await updateLeadStatus(lead.id, result.connected && !result.invited ? 'connected' : 'invited')
      console.log(`[send-invites] ✓ sequence executed for ${lead.name} (campaign=${campaignId})`)
    } else {
      // Neither invited nor connected — the walk paused mid-sequence (e.g.
      // hit a wait node). Lead stays 'pending' but its pending_step is now
      // set, so it won't be re-picked-up here; it resumes automatically
      // once the wait elapses (see resumeFromPendingStep).
      console.log(`[send-invites] ⏸ ${lead.name} paused mid-sequence — will resume automatically (campaign=${campaignId})`)
    }
  } catch (err) {
    const detail = err.data ? JSON.stringify(err.data) : err.message
    const outcome = classifyInviteError(err)
    if (outcome.status) {
      await updateLeadStatus(lead.id, outcome.status, outcome.reason)
      logLeadActivity(campaignId, lead.id, outcome.status, outcome.reason)
      console.error(`[send-invites] ✗ ${lead.name} → ${outcome.status} (campaign=${campaignId}):`, detail)
    } else {
      // Transient or account-level error — leave lead as pending so it's retried next run
      await updateLeadStatus(lead.id, 'pending', outcome.reason)
      console.error(`[send-invites] ⟳ ${lead.name} left pending, will retry (campaign=${campaignId}):`, detail)
    }
    if (outcome.stop) {
      console.error(`[send-invites] halting chain for campaign ${campaignId} — account-level error: ${detail}`)
      halted = true
    }
  }

  if (halted || pendingLeads.length < 2) return null

  const delayMs = randomDelayMs(delayMin, delayMax)
  console.log(`[send-invites] campaign=${campaignId} waiting ${Math.round(delayMs / 60000)} min before next invite…`)
  return delayMs
}

// ── POST /api/campaigns/:id/send-invites ───────────────────────
router.post('/:id/send-invites', async (req, res) => {
  try {
    const result = await runCampaignInvites(req.params.id, wsId(req))
    res.json(result)
  } catch (err) {
    console.error('[send-invites] error:', err)
    const status = err.message === 'Campaign not found' ? 404
      : err.message.includes('no LinkedIn account') ? 400 : 500
    res.status(status).json({ message: err.message })
  }
})

// ── GET /api/campaigns/:id/queue-status ─────────────────────────
// Read-only view into the send-batch chain's live BullMQ job state —
// state, next scheduled run time, retry count, last failure reason.
router.get('/:id/queue-status', async (req, res) => {
  try {
    const status = await getCampaignQueueStatus(req.params.id)
    res.json(status)
  } catch (err) {
    console.error('[queue-status] error:', err)
    res.status(500).json({ message: err.message })
  }
})

// ── POST /api/campaigns/:id/sync-messages ──────────────────────
// Polls Unipile chats for connected/replied leads.
// Detects new prospect messages → updates status to "replied" → triggers AI reply.
// Fallback for local dev where Unipile webhooks can't reach localhost.
router.post('/:id/sync-messages', async (req, res) => {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' })

    const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
    if (!accountId) return res.json({ processed: 0 })

    // Get leads that could have replied
    const { data: activeLeads } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', req.params.id)
      .in('status', ['connected', 'replied'])

    if (!activeLeads?.length) return res.json({ processed: 0 })

    const { chats } = await import('../services/unipile.js')
    const { conversationStore } = await import('../services/store.js')
    const { generateAIReply } = await import('./conversations.js')

    let processed = 0
    for (const lead of activeLeads) {
      if (!lead.provider_id) continue
      try {
        // Find the conversation record for this lead
        const conv = conversationStore.list().find(c =>
          c.prospectId === lead.provider_id || c.linkedinChatId === lead.chat_id
        )
        if (!conv?.linkedinChatId) continue

        // Fetch latest messages from Unipile
        const data = await chats.getMessages(conv.linkedinChatId, { limit: 10 })
        const msgs = data?.items || data?.objects || []
        if (!msgs.length) continue

        // Latest message (Unipile returns newest-first)
        const latest = msgs[0]
        const latestIsProspect = isProspectMessage(latest)

        if (!latestIsProspect) continue

        // Check if we've already stored this message
        const alreadyKnown = conv.messages.some(m => m.id === latest.id)
        if (alreadyKnown) continue

        // Store new prospect messages (oldest→newest)
        const knownIds = new Set(conv.messages.map(m => m.id).filter(Boolean))
        const newMsgs = [...msgs].reverse().filter(m => !knownIds.has(m.id) && !(m.is_sender === 1 || m.is_sender === true))
        for (const m of newMsgs) {
          conversationStore.addMessage(conv.id, {
            id:   m.id,
            from: 'prospect',
            text: m.text || m.content || '',
            timestamp: m.timestamp || m.created_at,
          })
        }

        // Update Supabase status to replied if still connected
        if (lead.status === 'connected') {
          await supabase.from('campaign_leads').update({ status: 'replied' }).eq('id', lead.id)
          console.log(`[sync-messages] ${lead.name} replied — status → replied`)
          logLeadActivity(req.params.id, lead.id, 'replied')
        }

        // Trigger AI reply if not paused
        if (canAiTakeOver({ isFromProspect: latestIsProspect, aiPaused: conv.aiPaused })) {
          console.log(`[sync-messages] triggering AI reply for ${lead.name}`)
          generateAIReply(conv.id).catch(err => console.error('[sync-messages] AI error:', err.message))
        }

        processed++
      } catch (err) {
        console.error(`[sync-messages] error for lead ${lead.name}:`, err.message)
      }
    }

    res.json({ processed, checked: activeLeads.length })
  } catch (err) {
    console.error('[sync-messages] error:', err)
    res.status(500).json({ message: err.message })
  }
})

// ── GET /api/campaigns/:id/sequence ───────────────────────────
router.get('/:id/sequence', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns').select('sequence').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()

  if (error || !data) return res.status(404).json({ message: 'Campaign not found' })
  res.json(data.sequence || { nodes: [] })
})

// ── PUT /api/campaigns/:id/sequence ───────────────────────────
router.put('/:id/sequence', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ sequence: req.body })
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))
    .select('sequence')
    .single()

  if (error || !data) return res.status(404).json({ message: error?.message || 'Campaign not found' })
  res.json(data.sequence)
})

// ── GET /api/campaigns/:id/analytics ──────────────────────────
router.get('/:id/analytics', async (req, res) => {
  const { data: leads, error } = await supabase
    .from('campaign_leads')
    .select('status, added_at')
    .eq('campaign_id', req.params.id)

  if (error) return res.status(500).json({ message: error.message })

  const rows = leads || []

  // Totals from actual lead statuses
  const sent     = rows.filter(r => ['invited','connected','replied','booked','rejected'].includes(r.status)).length
  const accepted = rows.filter(r => ['connected','replied','booked'].includes(r.status)).length
  const replied  = rows.filter(r => ['replied','booked'].includes(r.status)).length
  const booked   = rows.filter(r => r.status === 'booked').length

  // Build a 30-day time series from real dates
  const DAYS = 30
  const now  = new Date()
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (DAYS - 1 - i))
    return d.toISOString().slice(0, 10)
  })

  const byDay = {}
  for (const d of days) byDay[d] = { sent: 0, accepted: 0, replied: 0 }

  for (const r of rows) {
    const day = r.added_at?.slice(0, 10)
    if (!day || !byDay[day]) continue

    if (['invited','connected','replied','booked','rejected'].includes(r.status)) {
      byDay[day].sent += 1
    }
    if (['connected','replied','booked'].includes(r.status)) {
      byDay[day].accepted += 1
    }
    if (['replied','booked'].includes(r.status)) {
      byDay[day].replied += 1
    }
  }

  res.json({
    sent, accepted, replied, booked,
    acceptanceRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    replyRate:      accepted > 0 ? Math.round((replied / accepted) * 100) : 0,
    timeSeries: days.map((date, i) => ({
      day:      i + 1,
      date,
      sent:     byDay[date].sent,
      accepted: byDay[date].accepted,
      replied:  byDay[date].replied,
    })),
  })
})

// ── GET /api/campaigns/:id/activity ───────────────────────────
router.get('/:id/activity', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1)
  const limit = Math.min(50, parseInt(req.query.limit) || 10)
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('campaign_leads')
    .select('id, name, linkedin_url, status, added_at', { count: 'exact' })
    .eq('campaign_id', req.params.id)
    .in('status', ['invited', 'connected', 'replied', 'booked', 'failed', 'rejected', 'skipped'])
    .order('added_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[activity] error:', error.message)
    return res.status(500).json({ message: error.message })
  }
  console.log(`[activity] campaign=${req.params.id} page=${page} count=${count} items=${data?.length}`)

  const ACTION_TEXT = {
    invited:   'Connection request sent to',
    connected: 'Connection accepted by',
    replied:   'Reply received from',
    booked:    'Meeting booked with',
    failed:    'Failed to send request to',
    rejected:  'Connection request declined by',
    skipped:   'Skipped (condition not met) for',
  }

  res.json({
    items: (data || []).map(r => ({
      id:         r.id,
      name:       r.name,
      linkedinUrl: r.linkedin_url,
      status:     r.status,
      action:     ACTION_TEXT[r.status] || r.status,
      timestamp:  r.added_at,
    })),
    total: count || 0,
    page,
    limit,
  })
})

// POST /api/campaigns/generate-message
router.post('/generate-message', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt?.trim()) return res.status(400).json({ message: 'prompt required' })

    const profile = await getWorkspaceProfile(wsId(req))

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a LinkedIn outreach copywriter. Write a concise, natural LinkedIn message based on the instructions below.

Company context:
- Company: ${profile.companyName || 'Our company'}
- Value prop: ${profile.valueProp || ''}
- Tone: ${profile.tone || 'professional and friendly'}

Instructions: ${prompt}

Rules:
- Max 200 words
- Sound human, not salesy
- Use {firstName} where appropriate for personalisation
- Return ONLY the message text, no quotes, no explanation`
      }]
    })

    res.json({ message: msg.content[0].text.trim() })
  } catch (err) {
    console.error('Message generation error:', err)
    res.status(500).json({ message: 'Generation failed', error: err.message })
  }
})

export default router
