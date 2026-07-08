import { Router } from 'express'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase.js'
import { linkedin, chats as unipileChats, relations as unipileRelations } from '../services/unipile.js'
import { isWithinSchedule, consumeDailyLimit, getDailyCount } from '../services/limits.js'
import { logSend } from '../services/usageLog.js'
import { logLeadActivity, getLeadActivity } from '../services/leadActivity.js'

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
function interpolateVars(text, lead, profile) {
  if (!text) return text
  profile = profile || {}
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
  const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
  if (!camp) return res.status(404).json({ message: 'Campaign not found' })

  const { data, error } = await supabase
    .from('campaign_leads')
    .select('*')
    .eq('campaign_id', req.params.id)
    .order('added_at', { ascending: false })

  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(leadDbToApi))
})

// ── POST /api/campaigns/:id/leads ──────────────────────────────
router.post('/:id/leads', async (req, res) => {
  try {
    const { leads, source } = req.body
    if (!Array.isArray(leads)) return res.status(400).json({ message: 'leads array required' })
    if (!supabase) return res.status(503).json({ message: 'Database not configured' })

    const { data: camp } = await supabase.from('campaigns').select('id').eq('id', req.params.id).eq('workspace_id', wsId(req)).maybeSingle()
    if (!camp) return res.status(404).json({ message: 'Campaign not found' })

    const rows = leads.map(l => ({
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
    res.status(201).json({ added: data.map(leadDbToApi), count: data.length })
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

// ── POST /api/campaigns/:id/leads/:leadId/send-message ─────────
// Manually trigger the AI opening message for a connected lead.
// Use this when the webhook hasn't fired or needs to be re-triggered.
router.post('/:id/leads/:leadId/send-message', async (req, res) => {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' })

    const { data: lead } = await supabase
      .from('campaign_leads').select('*').eq('id', req.params.leadId).single()
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
    if (!accountId) return res.status(400).json({ message: 'No LinkedIn account set in campaign settings' })

    const providerUserId = lead.provider_id
    if (!providerUserId) return res.status(400).json({ message: 'Lead has no provider_id — cannot message' })

    const agentId = campaign.settings?.agentId
    if (!agentId) return res.status(400).json({ message: 'No AI agent set in campaign settings' })

    // Import here to avoid circular deps
    const { generateOpeningMessage } = await import('./conversations.js')
    const text = await generateOpeningMessage({
      agentId,
      accountId,
      providerUserId,
      prospectName: lead.name || '',
    })

    if (!text) return res.status(500).json({ message: 'AI message generation failed — check agent persona and ANTHROPIC_API_KEY' })

    // Update lead status
    await supabase.from('campaign_leads').update({ status: 'replied' }).eq('id', lead.id)
    logLeadActivity(req.params.id, lead.id, 'opening_message_sent')

    res.json({ ok: true, message: text })
  } catch (err) {
    console.error('[send-message] error:', err.message)
    res.status(500).json({ message: err.message })
  }
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
  if (!supabase) return
  const claimId = randomUUID()
  await supabase.from('campaign_leads')
    .update({ pending_step: { kind, path, deadline, claimId } })
    .eq('provider_id', ctx.providerUserId)
    .eq('campaign_id', ctx.campaignId)
    .catch(() => {}) // ignore if column not yet migrated
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
      const timeoutCfg = node.config?.replyTimeout || {}
      const tn = timeoutCfg.days || 3
      const tunit = timeoutCfg.unit || 'days'
      const msPerUnit = tunit === 'minutes' ? 60 * 1000 : tunit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      const deadline = new Date(Date.now() + tn * msPerUnit).toISOString()
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
  const { providerUserId, accountId, campaignId, lead, frequency = {}, profile } = ctx

  // connection_request — errors must propagate uncaught so the invite-send
  // loop (runCampaignInvites) can classify pending/failed/rate-limited.
  if (node.type === 'connection_request') {
    const rawNote = node.config?.note || undefined
    let note = rawNote ? interpolateVars(rawNote, lead, profile) : undefined
    if (note && note.length > 300) {
      console.warn(`[sequence] connection request note truncated from ${note.length} to 300 chars for ${lead?.name}`)
      note = note.slice(0, 297) + '...'
    }
    console.log(`[sequence] sending connection request to ${lead?.name}`)
    await linkedin.sendInvite({ accountId, providerUserId, message: note })
    logSend(accountId, 'connection_request')
    if (lead?.id) logLeadActivity(campaignId, lead.id, 'invite_sent')
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
    await persistPendingStep(ctx, { kind: 'wait', path: pathToNode, deadline })
    setTimeout(() => resumeFromPendingStep(providerUserId, campaignId), delayMs)
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
    switch (node.type) {
      case 'visit_profile': {
        if (!consumeDailyLimit(campaignId, 'profileVisits', frequency.profileVisits)) {
          console.log(`[sequence] visit_profile skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        // Visiting a profile has no downstream state keyed to the acting
        // account (unlike connection_request, whose invite has to be sent
        // from — and later polled against — the campaign's account), so a
        // per-step override is safe: fall back to the campaign account.
        const visitAccountId = node.config?.accountId || accountId
        await linkedin.visitProfile(visitAccountId, providerUserId)
        console.log(`[sequence] visited profile of ${providerUserId} via account ${visitAccountId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'visited_profile')
        return { ok: true }
      }
      case 'like_post': {
        if (!consumeDailyLimit(campaignId, 'likesToPosts', frequency.likesToPosts)) {
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
        console.log(`[sequence] liked post ${postId} for ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'liked_post')
        return { ok: true }
      }
      case 'follow': {
        if (!consumeDailyLimit(campaignId, 'followLead', frequency.followLead)) {
          console.log(`[sequence] follow skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        await linkedin.followUser(accountId, providerUserId)
        console.log(`[sequence] followed ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'followed')
        return { ok: true }
      }
      case 'comment_post':
      case 'reply_comment': {
        if (!consumeDailyLimit(campaignId, 'aiComments', frequency.aiComments)) {
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
        const text = interpolateVars(commentText, lead || {}, profile)
        await linkedin.commentOnPost(accountId, postId, text)
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
        if (!consumeDailyLimit(campaignId, 'messages', frequency.messages)) {
          console.log(`[sequence] ${node.type} skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const text = interpolateVars(node.config.text.trim(), lead || {}, profile)
        const attachments = node.config?.attachments || []
        await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
        logSend(accountId, 'message')
        console.log(`[sequence] sent ${node.type} to ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'message_sent')
        const hasBranches = node.config?.yesBranch?.length || node.config?.noBranch?.length
        return hasBranches ? { ok: true, pauseForReply: true } : { ok: true, skipped: true }
      }
      case 'inmail': {
        if (!node.config?.body?.trim()) return { ok: false, error: 'missing_body' }
        if (!consumeDailyLimit(campaignId, 'inmails', frequency.inmails)) {
          console.log(`[sequence] inmail skipped for ${providerUserId} — daily limit reached`)
          return { ok: true, skipped: true }
        }
        const body    = interpolateVars(node.config.body.trim(), lead || {}, profile)
        const subject = interpolateVars(node.config.subject || '', lead || {}, profile)
        const text    = subject ? `${subject}\n\n${body}` : body
        const attachments = node.config?.attachments || []
        await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
        logSend(accountId, 'message')
        console.log(`[sequence] sent inmail to ${providerUserId}`)
        if (lead?.id) logLeadActivity(campaignId, lead.id, 'inmail_sent')
        const hasBranches = node.config?.yesBranch?.length || node.config?.noBranch?.length
        return hasBranches ? { ok: true, pauseForReply: true } : { ok: true, skipped: true }
      }
      default:
        console.log(`[sequence] runNode — unhandled type: ${node.type}`)
        return { ok: true, skipped: true }
    }
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
async function executePreConnectionSteps(lead, sequence, accountId, workspaceId, campaignId, frequency = {}) {
  const providerUserId = await resolveProviderId(lead, accountId)
  if (!providerUserId) throw new Error('Cannot resolve provider_id for lead')

  const profile = await getWorkspaceProfile(workspaceId)
  const ctx = {
    providerUserId, accountId, campaignId, workspaceId, lead, frequency, profile,
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
async function syncLeadStatusFromCtx(leadId, campaignId, ctx) {
  if (!ctx.invited && !ctx.connected) return
  const target = ctx.connected && !ctx.invited ? 'connected' : 'invited'
  const { data: row } = await supabase.from('campaign_leads').select('status').eq('id', leadId).single()
  const current = row?.status || 'pending'
  if ((LEAD_STATUS_RANK[target] ?? 0) > (LEAD_STATUS_RANK[current] ?? 0)) {
    await updateLeadStatus(leadId, target)
    if (current === 'pending') consumeDailyLimit(campaignId, 'connectionRequests', 0)
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
    const ctx = {
      providerUserId, accountId, campaignId, workspaceId: effectiveWsId, lead: leadRow,
      frequency, profile,
      connected: CONNECTED_STATUSES.includes(leadRow?.status),
      invited: leadRow?.status !== 'pending',
      halted: false,
    }

    console.log(`[sequence] resuming ${pending.kind} for ${providerUserId} — outcome: ${outcome || 'n/a'}`)

    if (pending.kind === 'reply' || pending.kind === 'connect') {
      const branchKey = outcome === 'replied' || outcome === 'connected' ? 'yesBranch' : 'noBranch'
      // pending.path's last entry already points at loc.node (with branch:
      // null, since it was the halt target) — replace that entry's branch
      // rather than appending a duplicate for the same node.
      const pathIntoBranch = [...pending.path.slice(0, -1), { nodeId: loc.node.id, branch: branchKey }]
      await runTree(loc.node.config?.[branchKey], ctx, pathIntoBranch)
      if (ctx.halted) {
        await syncLeadStatusFromCtx(leadRow.id, campaignId, ctx)
        return true
      }
    }
    // 'wait' just continues — nothing to resolve, fall through.

    try {
      await runTree(loc.containingList.slice(loc.index + 1), ctx, pending.path.slice(0, -1))
      await syncLeadStatusFromCtx(leadRow.id, campaignId, ctx)
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

// Backwards-compatible name for the reply-specific resume path — kept so
// webhooks/scheduler call sites read clearly at their call site.
export async function resumeReplyBranch(providerUserId, campaignId, outcome) {
  return resumeFromPendingStep(providerUserId, campaignId, outcome)
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
    const ctx = {
      providerUserId, accountId, campaignId, workspaceId: effectiveWsId, lead,
      frequency, profile, connected: true, invited: true, halted: false,
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

// Tracks campaigns currently running invite loops — prevents concurrent duplicate sends.
const _runningCampaigns = new Set()

// Classify an invite-send error into a lead outcome.
// Returns { status, reason, stop } — status null means "leave as pending" (retried next run),
// stop true means the whole loop should halt (account-level problem, no point continuing).
function classifyInviteError(err) {
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

// ── Shared: run send-invites logic for a campaign ──────────────
// Returns { queued, message } or throws. Used by both the route and the scheduler.
export async function runCampaignInvites(campaignId, workspaceId) {
  if (_runningCampaigns.has(campaignId)) {
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

  const dailyLimit = campaign.settings?.frequency?.connectionRequests ?? campaign.settings?.dailyConnectionLimit ?? 20

  const sentToday = getDailyCount(campaignId, 'connectionRequests')
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

  console.log(`[send-invites] campaign=${campaignId} accountId=${accountId} leads=${pendingLeads.length} dailyLimit=${dailyLimit} sentToday=${sentToday || 0}`)

  // Process leads in the background — do not await this loop
  _runningCampaigns.add(campaignId)
  ;(async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    try {
    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i]
      try {
        const result = await executePreConnectionSteps(lead, campaign.sequence, accountId, workspaceId || campaign.workspace_id, campaignId, campaign.settings?.frequency || {})
        if (result?.invited || result?.connected) {
          // Nested branching can reach "already connected" without ever sending
          // a request (e.g. an "If Connected → Yes" path) — mark accordingly
          // instead of always assuming an invite went out.
          await updateLeadStatus(lead.id, result.connected && !result.invited ? 'connected' : 'invited')
          consumeDailyLimit(campaignId, 'connectionRequests', 0) // track without enforcing (limit enforced above)
          console.log(`[send-invites] ✓ (${i + 1}/${pendingLeads.length}) sequence executed for ${lead.name}`)
        } else {
          // Neither invited nor connected — the walk paused mid-sequence (e.g.
          // hit a wait node). Lead stays 'pending' but its pending_step is now
          // set, so it won't be re-picked-up here; it resumes automatically
          // once the wait elapses (see resumeFromPendingStep).
          console.log(`[send-invites] ⏸ (${i + 1}/${pendingLeads.length}) ${lead.name} paused mid-sequence — will resume automatically`)
        }
      } catch (err) {
        const detail = err.data ? JSON.stringify(err.data) : err.message
        const outcome = classifyInviteError(err)
        if (outcome.status) {
          await updateLeadStatus(lead.id, outcome.status, outcome.reason)
          logLeadActivity(campaignId, lead.id, outcome.status, outcome.reason)
          console.error(`[send-invites] ✗ (${i + 1}/${pendingLeads.length}) ${lead.name} → ${outcome.status}:`, detail)
        } else {
          // Transient or account-level error — leave lead as pending so it's retried next run
          await updateLeadStatus(lead.id, 'pending', outcome.reason)
          console.error(`[send-invites] ⟳ (${i + 1}/${pendingLeads.length}) ${lead.name} left pending (will retry):`, detail)
        }
        if (outcome.stop) {
          console.error(`[send-invites] halting loop for campaign ${campaignId} — account-level error: ${detail}`)
          break
        }
      }
      if (i < pendingLeads.length - 1) {
        const delayMs = (15 + Math.floor(Math.random() * 6)) * 60 * 1000
        console.log(`[send-invites] waiting ${Math.round(delayMs / 60000)} min before next invite…`)
        await sleep(delayMs)
      }
    }
    console.log(`[send-invites] done — processed ${pendingLeads.length} lead(s) for campaign ${campaignId}`)
    } finally {
      _runningCampaigns.delete(campaignId)
    }
  })()

  return { queued: pendingLeads.length, message: `Sending ${pendingLeads.length} connection request(s) with 15–20 min delays` }
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
        const latestIsProspect = latest.is_sender === 0 || latest.is_sender === false

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
        if (!conv.aiPaused) {
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
