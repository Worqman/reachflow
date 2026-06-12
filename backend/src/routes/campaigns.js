import { Router } from 'express'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase.js'
import { linkedin, chats as unipileChats, relations as unipileRelations } from '../services/unipile.js'
import { isWithinSchedule, consumeDailyLimit, getDailyCount } from '../services/limits.js'

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
      model: 'claude-sonnet-4-20250514',
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

// Interpolate message variables with lead + workspace profile data
function interpolateVars(text, lead, profile = {}) {
  if (!text) return text
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

    res.json({ ok: true, message: text })
  } catch (err) {
    console.error('[send-message] error:', err.message)
    res.status(500).json({ message: err.message })
  }
})

// ── Sequence execution helpers ──────────────────────────────────

// Resolve provider_id for a lead, looking up by LinkedIn URL if needed
async function resolveProviderId(lead, accountId) {
  if (lead.provider_id) {
    console.log(`[resolve] using stored provider_id for ${lead.name}: ${lead.provider_id}`)
    return lead.provider_id
  }
  if (!lead.linkedin_url) return null
  const slug = lead.linkedin_url.split('/in/')[1]?.replace(/\/$/, '') || lead.linkedin_url
  console.log(`[resolve] looking up profile for ${lead.name} slug=${slug}`)
  const profile = await linkedin.getProfileByUrl(accountId, slug)
  console.log(`[resolve] profile response keys:`, Object.keys(profile || {}))
  console.log(`[resolve] provider_id=${profile?.provider_id}  id=${profile?.id}  public_identifier=${profile?.public_identifier}`)
  const pid = profile?.provider_id || profile?.id
  if (pid) {
    await supabase.from('campaign_leads').update({ provider_id: pid }).eq('id', lead.id)
  }
  return pid || null
}

// Execute pre-connection sequence steps for one lead:
//   visit_profile → (wait ignored) → connection_request
// Returns 'invited' on success, throws on failure.
async function executePreConnectionSteps(lead, sequence, accountId, workspaceId, campaignId, frequency = {}) {
  const nodes = sequence?.nodes || []

  // Find connection_request step index (we stop there)
  const connectIdx = nodes.findIndex(n => n.type === 'connection_request')
  const stepsToRun = connectIdx >= 0 ? nodes.slice(0, connectIdx + 1) : []

  // If no connection_request step, fall back to just sending invite
  if (stepsToRun.length === 0) {
    stepsToRun.push({ type: 'connection_request', config: {} })
  }

  const providerUserId = await resolveProviderId(lead, accountId)
  if (!providerUserId) throw new Error('Cannot resolve provider_id for lead')

  for (const node of stepsToRun) {
    switch (node.type) {
      case 'visit_profile': {
        const allowed = consumeDailyLimit(campaignId, 'profileVisits', frequency.profileVisits)
        if (!allowed) {
          console.log(`[sequence] visit_profile skipped for ${lead.name} — daily limit (${frequency.profileVisits}) reached`)
          break
        }
        try {
          console.log(`[sequence] visiting profile of ${lead.name} (today: ${getDailyCount(campaignId, 'profileVisits')}/${frequency.profileVisits || '∞'})`)
          await linkedin.visitProfile(accountId, providerUserId)
        } catch (err) {
          console.error(`[sequence] visit_profile error for ${lead.name}: ${err.message}`)
        }
        break
      }
      case 'like_post': {
        if (!consumeDailyLimit(campaignId, 'likesToPosts', frequency.likesToPosts)) {
          console.log(`[sequence] like_post skipped for ${lead.name} — daily limit reached`)
          break
        }
        try {
          const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
          const posts = postsData?.items || postsData?.objects || []
          if (!posts.length) { console.log(`[sequence] like_post — no posts found for ${lead.name}`); break }
          const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
          await linkedin.likePost(accountId, postId)
          console.log(`[sequence] liked post ${postId} for ${lead.name}`)
        } catch (err) {
          console.error(`[sequence] like_post error for ${lead.name}: ${err.message}`)
        }
        break
      }
      case 'follow': {
        if (!consumeDailyLimit(campaignId, 'followLead', frequency.followLead)) {
          console.log(`[sequence] follow skipped for ${lead.name} — daily limit reached`)
          break
        }
        try {
          await linkedin.followUser(accountId, providerUserId)
          console.log(`[sequence] followed ${lead.name}`)
        } catch (err) {
          console.error(`[sequence] follow error for ${lead.name}: ${err.message}`)
        }
        break
      }
      case 'comment_post': {
        if (!consumeDailyLimit(campaignId, 'aiComments', frequency.aiComments)) {
          console.log(`[sequence] comment_post skipped for ${lead.name} — daily limit reached`)
          break
        }
        const commentText = node.config?.text?.trim()
        if (!commentText) break
        try {
          const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
          const posts = postsData?.items || postsData?.objects || []
          if (!posts.length) { console.log(`[sequence] comment_post — no posts found for ${lead.name}`); break }
          const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
          const profile = await getWorkspaceProfile(workspaceId)
          const text = interpolateVars(commentText, lead, profile)
          await linkedin.commentOnPost(accountId, postId, text)
          console.log(`[sequence] commented on post ${postId} for ${lead.name}`)
        } catch (err) {
          console.error(`[sequence] comment_post error for ${lead.name}: ${err.message}`)
        }
        break
      }
      case 'wait':
        // Wait is skipped in pre-connection — delay is handled in post-connection phase
        console.log(`[sequence] wait ${node.config?.days}d skipped in pre-connection phase`)
        break
      // ── Conditions ──────────────────────────────────────────────
      case 'cond_has_linkedin': {
        if (!lead.linkedin_url) {
          console.log(`[sequence] cond_has_linkedin FAILED for ${lead.name}`)
          throw new Error(`CONDITION_FAILED:cond_has_linkedin`)
        }
        break
      }
      case 'cond_1st_level': {
        try {
          const data = await unipileRelations.list({ accountId, limit: 1000 })
          const relations = data?.items || data?.objects || data?.relations || []
          const isConnected = relations.some(r => r.provider_id === providerUserId || r.id === providerUserId)
          if (!isConnected) {
            console.log(`[sequence] cond_1st_level FAILED for ${lead.name} — not yet connected`)
            throw new Error(`CONDITION_FAILED:cond_1st_level`)
          }
        } catch (err) {
          if (err.message?.startsWith('CONDITION_FAILED')) throw err
          console.log(`[sequence] cond_1st_level check error: ${err.message}`)
        }
        break
      }
      case 'cond_check_column': {
        const field = node.config?.field
        const expected = (node.config?.value || '').toLowerCase()
        const actual = String(lead[field] || lead[field?.toLowerCase()] || '').toLowerCase()
        if (field && expected && !actual.includes(expected)) {
          console.log(`[sequence] cond_check_column FAILED for ${lead.name} — ${field} !contains "${expected}"`)
          throw new Error(`CONDITION_FAILED:cond_check_column`)
        }
        break
      }
      case 'cond_open_profile': {
        try {
          const profileData = await linkedin.visitProfile(accountId, providerUserId)
          const isOpen = profileData?.is_open_profile || profileData?.open_profile || profileData?.openProfile || false
          if (!isOpen) {
            console.log(`[sequence] cond_open_profile FAILED for ${lead.name} — not an open profile`)
            throw new Error(`CONDITION_FAILED:cond_open_profile`)
          }
          console.log(`[sequence] cond_open_profile PASSED for ${lead.name}`)
        } catch (err) {
          if (err.message?.startsWith('CONDITION_FAILED')) throw err
          console.log(`[sequence] cond_open_profile check error — passing through: ${err.message}`)
        }
        break
      }
      case 'cond_opened_message':
        // Cannot be meaningfully checked pre-connection — pass through
        console.log(`[sequence] cond_opened_message cannot be evaluated pre-connection — passing through`)
        break
      case 'connection_request': {
        const profile = await getWorkspaceProfile(workspaceId)
        const rawNote = node.config?.note || undefined
        const note = rawNote ? interpolateVars(rawNote, lead, profile) : undefined
        console.log(`[sequence] sending connection request to ${lead.name}`)
        await linkedin.sendInvite({ accountId, providerUserId, message: note })
        break
      }
      default:
        console.log(`[sequence] unknown step type: ${node.type}`)
    }
  }
}

// Execute post-connection sequence steps (nodes after connection_request).
// startFromIndex: resume from a specific node (used by wait scheduling).
export async function executePostConnectionSteps(providerUserId, accountId, campaignId, workspaceId, startFromIndex = 0) {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('sequence, settings, workspace_id').eq('id', campaignId).single()
    if (!campaign?.sequence?.nodes) return

    const nodes = campaign.sequence.nodes
    const connectIdx = nodes.findIndex(n => n.type === 'connection_request')
    // If no connection_request node, treat all nodes as post-connection steps
    const postNodes = connectIdx >= 0 ? nodes.slice(connectIdx + 1) : nodes
    const frequency = campaign.settings?.frequency || {}

    // Respect campaign schedule for post-connection outreach
    const schedule = campaign.settings?.schedule
    const timezone = campaign.settings?.timezone || 'UTC'
    if (startFromIndex === 0 && schedule?.length && !isWithinSchedule(schedule, timezone)) {
      console.log(`[sequence] post-connection steps skipped — outside active schedule (${timezone})`)
      return
    }

    // Clear persisted wait state now that we're resuming
    if (startFromIndex > 0) {
      await supabase.from('campaign_leads')
        .update({ sequence_step: null, sequence_resume_at: null })
        .eq('provider_id', providerUserId)
        .eq('campaign_id', campaignId)
        .catch(() => {})
    }

    const { data: lead } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('provider_id', providerUserId)
      .maybeSingle()
    const effectiveWsId = workspaceId || campaign?.workspace_id
    const profile = await getWorkspaceProfile(effectiveWsId)

    for (let i = startFromIndex; i < postNodes.length; i++) {
      const node = postNodes[i]
      switch (node.type) {

        // ── Messages ──────────────────────────────────────────────
        case 'message': {
          if (!node.config?.text?.trim()) break
          if (!consumeDailyLimit(campaignId, 'messages', frequency.messages)) {
            console.log(`[sequence] message skipped for ${providerUserId} — daily limit reached`)
            break
          }
          const text = interpolateVars(node.config.text.trim(), lead || {}, profile)
          const attachments = node.config?.attachments || []
          console.log(`[sequence] sending message to ${providerUserId}${attachments.length ? ` +${attachments.length} attachment(s)` : ''}`)
          await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
          break
        }
        case 'message_open': {
          if (!node.config?.text?.trim()) break
          if (!consumeDailyLimit(campaignId, 'messages', frequency.messages)) {
            console.log(`[sequence] message_open skipped for ${providerUserId} — daily limit reached`)
            break
          }
          const text = interpolateVars(node.config.text.trim(), lead || {}, profile)
          const attachments = node.config?.attachments || []
          console.log(`[sequence] sending open-profile message to ${providerUserId}${attachments.length ? ` +${attachments.length} attachment(s)` : ''}`)
          await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
          break
        }
        case 'inmail': {
          if (!node.config?.body?.trim()) break
          if (!consumeDailyLimit(campaignId, 'inmails', frequency.inmails)) {
            console.log(`[sequence] inmail skipped for ${providerUserId} — daily limit reached`)
            break
          }
          const body    = interpolateVars(node.config.body.trim(), lead || {}, profile)
          const subject = interpolateVars(node.config.subject || '', lead || {}, profile)
          const text    = subject ? `${subject}\n\n${body}` : body
          const attachments = node.config?.attachments || []
          console.log(`[sequence] sending InMail to ${providerUserId}${attachments.length ? ` +${attachments.length} attachment(s)` : ''}`)
          await linkedin.sendMessage({ accountId, providerUserId, text, attachments })
          break
        }
        case 'voice_note':
          console.log(`[sequence] voice_note not supported via Unipile — skipping`)
          break

        // ── Engagement actions ─────────────────────────────────────
        case 'visit_profile': {
          if (!consumeDailyLimit(campaignId, 'profileVisits', frequency.profileVisits)) {
            console.log(`[sequence] visit_profile skipped for ${providerUserId} — daily limit reached`)
            break
          }
          await linkedin.visitProfile(accountId, providerUserId)
          console.log(`[sequence] visited profile of ${providerUserId}`)
          break
        }
        case 'like_post': {
          if (!consumeDailyLimit(campaignId, 'likesToPosts', frequency.likesToPosts)) {
            console.log(`[sequence] like_post skipped for ${providerUserId} — daily limit reached`)
            break
          }
          try {
            const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
            const posts = postsData?.items || postsData?.objects || []
            if (!posts.length) { console.log(`[sequence] like_post — no posts found for ${providerUserId}`); break }
            const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
            await linkedin.likePost(accountId, postId)
            console.log(`[sequence] liked post ${postId} for ${providerUserId}`)
          } catch (err) {
            console.error(`[sequence] like_post error: ${err.message}`)
          }
          break
        }
        case 'follow': {
          if (!consumeDailyLimit(campaignId, 'followLead', frequency.followLead)) {
            console.log(`[sequence] follow skipped for ${providerUserId} — daily limit reached`)
            break
          }
          try {
            await linkedin.followUser(accountId, providerUserId)
            console.log(`[sequence] followed ${providerUserId}`)
          } catch (err) {
            console.error(`[sequence] follow error: ${err.message}`)
          }
          break
        }
        case 'comment_post':
        case 'reply_comment': {
          if (!consumeDailyLimit(campaignId, 'aiComments', frequency.aiComments)) {
            console.log(`[sequence] ${node.type} skipped for ${providerUserId} — daily limit reached`)
            break
          }
          const commentText = node.config?.text?.trim()
          if (!commentText) break
          try {
            const postsData = await linkedin.getUserPosts(accountId, providerUserId, { limit: 5 })
            const posts = postsData?.items || postsData?.objects || []
            if (!posts.length) { console.log(`[sequence] ${node.type} — no posts found for ${providerUserId}`); break }
            const postId = posts[0].identifier || posts[0].id || posts[0].provider_id
            const text = interpolateVars(commentText, lead || {}, profile)
            await linkedin.commentOnPost(accountId, postId, text)
            console.log(`[sequence] ${node.type} on post ${postId} for ${providerUserId}`)
          } catch (err) {
            console.error(`[sequence] ${node.type} error: ${err.message}`)
          }
          break
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
          break
        }

        // ── Wait — schedule resume from the next node ──────────────
        case 'wait': {
          const n = node.config?.days || 1
          const unit = node.config?.unit || 'days'
          const msPerUnit = unit === 'minutes' ? 60 * 1000 : unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
          const delayMs = n * msPerUnit
          const resumeAt = new Date(Date.now() + delayMs).toISOString()
          console.log(`[sequence] wait ${n} ${unit} — scheduling resume at node ${i + 1} for ${providerUserId} (resume at ${resumeAt})`)
          // Persist so the resume survives a server restart
          if (supabase) {
            await supabase.from('campaign_leads')
              .update({ sequence_step: i + 1, sequence_resume_at: resumeAt })
              .eq('provider_id', providerUserId)
              .eq('campaign_id', campaignId)
              .catch(() => {}) // ignore if columns not yet migrated
          }
          setTimeout(
            () => executePostConnectionSteps(providerUserId, accountId, campaignId, workspaceId, i + 1),
            delayMs
          )
          return // stop current run; will resume after delay
        }

        // ── Conditions ────────────────────────────────────────────
        case 'cond_has_linkedin':
          if (!lead?.linkedin_url) {
            console.log(`[sequence] cond_has_linkedin FAILED post-connection — stopping`)
            return
          }
          break
        case 'cond_1st_level':
          break // post-connection = they ARE connected, always passes
        case 'cond_check_column': {
          const field = node.config?.field
          const expected = (node.config?.value || '').toLowerCase()
          const actual = String(lead?.[field] || '').toLowerCase()
          if (field && expected && !actual.includes(expected)) {
            console.log(`[sequence] cond_check_column FAILED post-connection — stopping`)
            return
          }
          break
        }
        case 'cond_open_profile': {
          try {
            const profileData = await linkedin.visitProfile(accountId, providerUserId)
            const isOpen = profileData?.is_open_profile || profileData?.open_profile || profileData?.openProfile || false
            if (!isOpen) {
              console.log(`[sequence] cond_open_profile FAILED for ${providerUserId} — not an open profile, stopping`)
              return
            }
            console.log(`[sequence] cond_open_profile PASSED for ${providerUserId}`)
          } catch (err) {
            console.log(`[sequence] cond_open_profile check error — continuing: ${err.message}`)
          }
          break
        }
        case 'cond_opened_message': {
          try {
            // Find the chat_id stored on the lead (set when opening message was sent)
            const chatId = lead?.chat_id
            if (!chatId) {
              console.log(`[sequence] cond_opened_message — no chat found for ${providerUserId}, passing through`)
              break
            }
            const messagesData = await unipileChats.getMessages(chatId, { limit: 50 })
            const messages = messagesData?.items || messagesData?.objects || []
            // A message is "opened" if any sent message (is_sender=1) has a read/seen indicator
            const hasBeenOpened = messages.some(m =>
              (m.is_sender === 1 || m.is_sender === true) &&
              (m.is_read || m.seen || m.read_at || m.seen_at)
            )
            if (!hasBeenOpened) {
              console.log(`[sequence] cond_opened_message FAILED for ${providerUserId} — message not opened yet, stopping`)
              return
            }
            console.log(`[sequence] cond_opened_message PASSED for ${providerUserId}`)
          } catch (err) {
            console.log(`[sequence] cond_opened_message check error — continuing: ${err.message}`)
          }
          break
        }
        default:
          console.log(`[sequence] unknown post-connection step type: ${node.type}`)
      }
    }
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
  const text = `${msg} ${typ}`.toLowerCase()
  const httpStatus = err.status

  if (msg.startsWith('CONDITION_FAILED')) {
    return { status: 'skipped', reason: msg, stop: false }
  }
  // Recipient is already a 1st-level connection — not a failure
  if (/already[ _-]?connect|already.*relation/.test(text)) {
    return { status: 'connected', reason: null, stop: false }
  }
  // Invitation already pending on LinkedIn (e.g. sent before a restart, or manually)
  if (/already[ _-]?invit|invitation.*(pending|exist|sent)|cannot[ _-]?resend|invited[ _-]?recently|invalid_recipient/.test(text)) {
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
        await executePreConnectionSteps(lead, campaign.sequence, accountId, workspaceId || campaign.workspace_id, campaignId, campaign.settings?.frequency || {})
        await updateLeadStatus(lead.id, 'invited')
        consumeDailyLimit(campaignId, 'connectionRequests', 0) // track without enforcing (limit enforced above)
        console.log(`[send-invites] ✓ (${i + 1}/${pendingLeads.length}) sequence executed for ${lead.name}`)
      } catch (err) {
        const detail = err.data ? JSON.stringify(err.data) : err.message
        const outcome = classifyInviteError(err)
        if (outcome.status) {
          await updateLeadStatus(lead.id, outcome.status, outcome.reason)
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

// POST /api/campaigns/generate-message
router.post('/generate-message', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt?.trim()) return res.status(400).json({ message: 'prompt required' })

    const profile = await getWorkspaceProfile(wsId(req))

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
