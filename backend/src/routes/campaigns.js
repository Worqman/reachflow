import { Router } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../services/supabase.js'
import { linkedin, relations as unipileRelations } from '../services/unipile.js'

const router = Router()

// workspace_id comes from the auth middleware via req.workspaceId
function wsId(req) { return req.workspaceId || 'ws_default' }

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
    status:      row.status,
    source:      row.source,
    addedAt:     row.added_at,
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
  res.json(data.map(dbToApi))
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
      .from('campaigns').select('settings').eq('id', req.params.id).single()
    patch.settings = { ...(existing?.settings || {}), ...body.settings }
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', req.params.id)
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

  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

// ── GET /api/campaigns/:id/leads ───────────────────────────────
router.get('/:id/leads', async (req, res) => {
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
  const { error } = await supabase
    .from('campaign_leads').delete().eq('id', req.params.leadId).eq('campaign_id', req.params.id)
  if (error) return res.status(500).json({ message: error.message })
  res.json({ ok: true })
})

// ── POST /api/campaigns/:id/leads/:leadId/status ───────────────
router.post('/:id/leads/:leadId/status', async (req, res) => {
  const { status } = req.body
  if (!status) return res.status(400).json({ message: 'status required' })
  const { data, error } = await supabase
    .from('campaign_leads').update({ status }).eq('id', req.params.leadId).select().single()
  if (error || !data) return res.status(500).json({ message: error?.message || 'Update failed' })
  res.json(leadDbToApi(data))
})

// ── POST /api/campaigns/:id/leads/:leadId/send-message ─────────
// Manually trigger the AI opening message for a connected lead.
// Use this when the webhook hasn't fired or needs to be re-triggered.
router.post('/:id/leads/:leadId/send-message', async (req, res) => {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', req.params.id).single()
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
async function executePreConnectionSteps(lead, sequence, accountId) {
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
      case 'visit_profile':
        console.log(`[sequence] visiting profile of ${lead.name}`)
        await linkedin.visitProfile(accountId, providerUserId)
        break
      case 'like_post':
        // Not yet implemented — Unipile requires fetching user's posts first
        console.log(`[sequence] like_post skipped for ${lead.name} (not implemented)`)
        break
      case 'follow':
        console.log(`[sequence] follow skipped for ${lead.name} (no Unipile endpoint)`)
        break
      case 'wait':
        // Pre-connection waits are skipped — delays happen server-side via scheduling
        console.log(`[sequence] wait ${node.config?.days}d skipped (no scheduler)`)
        break
      case 'connection_request': {
        const note = node.config?.note || undefined
        console.log(`[sequence] sending connection request to ${lead.name}`)
        await linkedin.sendInvite({ accountId, providerUserId, message: note })
        break
      }
      default:
        console.log(`[sequence] unknown step type: ${node.type}`)
    }
  }
}

// Execute post-connection sequence steps (message steps after connection_request)
// Called from the webhook after connection_accepted.
export async function executePostConnectionSteps(providerUserId, accountId, campaignId) {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('sequence').eq('id', campaignId).single()
    if (!campaign?.sequence?.nodes) return

    const nodes = campaign.sequence.nodes
    const connectIdx = nodes.findIndex(n => n.type === 'connection_request')
    if (connectIdx < 0) return

    const postNodes = nodes.slice(connectIdx + 1)

    for (const node of postNodes) {
      if (node.type === 'message' && node.config?.text?.trim()) {
        console.log(`[sequence] sending post-connection message to ${providerUserId}`)
        await linkedin.sendMessage({ accountId, providerUserId, text: node.config.text.trim() })
      } else if (node.type === 'wait') {
        // For MVP, skip waits — a proper scheduler would queue the next step
        console.log(`[sequence] wait ${node.config?.days}d skipped (no scheduler)`)
      }
    }
  } catch (err) {
    console.error('[sequence] post-connection steps error:', err.message)
  }
}

// ── POST /api/campaigns/:id/sync-statuses ──────────────────────
// Polls Unipile relations list and detects which "invited" leads have accepted.
// Triggers post-connection steps (builder message + AI) for each new connection.
router.post('/:id/sync-statuses', async (req, res) => {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', req.params.id).single()
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' })

    const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
    if (!accountId) return res.status(400).json({ message: 'No LinkedIn account set in campaign settings' })

    // Get all invited leads for this campaign
    const { data: invitedLeads } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', req.params.id)
      .eq('status', 'invited')

    if (!invitedLeads?.length) return res.json({ connected: 0, message: 'No invited leads to check' })

    // Fetch current relations from Unipile (paginate up to 250)
    let allRelations = []
    try {
      const data = await unipileRelations.list({ accountId, limit: 250 })
      allRelations = data?.items || data?.objects || data?.relations || []
    } catch (err) {
      console.error('[sync] Failed to fetch relations:', err.message)
      return res.status(500).json({ message: `Unipile relations fetch failed: ${err.message}` })
    }

    // Build a set of provider_ids that are now connections
    const connectedIds = new Set(
      allRelations.map(r => r.provider_id || r.id).filter(Boolean)
    )

    console.log(`[sync] ${allRelations.length} relations fetched, checking ${invitedLeads.length} invited leads`)

    // Import the shared handler
    const { handleNewConnection } = await import('../webhooks/unipile.js')

    let connected = 0
    for (const lead of invitedLeads) {
      if (!lead.provider_id) continue
      if (connectedIds.has(lead.provider_id)) {
        console.log(`[sync] ${lead.name} is now connected — running post-connection steps`)
        await handleNewConnection({
          providerUserId: lead.provider_id,
          prospectName:   lead.name || '',
          accountId,
        })
        connected++
      }
    }

    res.json({ connected, checked: invitedLeads.length })
  } catch (err) {
    console.error('[sync-statuses] error:', err)
    res.status(500).json({ message: err.message })
  }
})

// ── POST /api/campaigns/:id/send-invites ───────────────────────
// Runs the pre-connection sequence (visit_profile + connection_request) for all pending leads.
router.post('/:id/send-invites', async (req, res) => {
  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', req.params.id).single()
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' })

    const accountId = campaign.settings?.linkedinAccountId || campaign.settings?.accountId
    if (!accountId) {
      return res.status(400).json({ message: 'Campaign has no LinkedIn account configured. Set it in Campaign Settings.' })
    }

    const { data: pendingLeads } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', req.params.id)
      .eq('status', 'pending')

    if (!pendingLeads?.length) {
      return res.json({ sent: 0, message: 'No pending leads' })
    }

    console.log(`[send-invites] campaign=${req.params.id} accountId=${accountId} leads=${pendingLeads.length}`)

    const results = []
    for (const lead of pendingLeads) {
      try {
        await executePreConnectionSteps(lead, campaign.sequence, accountId)
        await supabase.from('campaign_leads').update({ status: 'invited' }).eq('id', lead.id)
        results.push({ id: lead.id, name: lead.name, ok: true })
        console.log(`[send-invites] ✓ sequence executed for ${lead.name}`)
      } catch (err) {
        const detail = err.data ? JSON.stringify(err.data) : err.message
        console.error(`[send-invites] ✗ failed for ${lead.name}:`, detail)
        results.push({ id: lead.id, name: lead.name, ok: false, error: detail })
      }
    }

    const sent = results.filter(r => r.ok).length
    res.json({ sent, total: pendingLeads.length, results })
  } catch (err) {
    console.error('[send-invites] error:', err)
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
      .from('campaigns').select('*').eq('id', req.params.id).single()
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
    .from('campaigns').select('sequence').eq('id', req.params.id).single()

  if (error || !data) return res.status(404).json({ message: 'Campaign not found' })
  res.json(data.sequence || { nodes: [] })
})

// ── PUT /api/campaigns/:id/sequence ───────────────────────────
router.put('/:id/sequence', async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ sequence: req.body })
    .eq('id', req.params.id)
    .select('sequence')
    .single()

  if (error || !data) return res.status(404).json({ message: error?.message || 'Campaign not found' })
  res.json(data.sequence)
})

// ── GET /api/campaigns/:id/analytics ──────────────────────────
router.get('/:id/analytics', async (req, res) => {
  const { data: leads, error } = await supabase
    .from('campaign_leads')
    .select('status, created_at, updated_at')
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
    return d.toISOString().slice(0, 10)   // YYYY-MM-DD
  })

  const byDay = {}
  for (const d of days) byDay[d] = { sent: 0, accepted: 0, replied: 0 }

  for (const r of rows) {
    const createdDay  = r.created_at?.slice(0, 10)
    const updatedDay  = r.updated_at?.slice(0, 10)

    // "sent" = when the lead was created (invite went out)
    if (createdDay && byDay[createdDay] && ['invited','connected','replied','booked','rejected'].includes(r.status)) {
      byDay[createdDay].sent += 1
    }
    // "accepted" = when status moved to connected (use updated_at as proxy)
    if (updatedDay && byDay[updatedDay] && ['connected','replied','booked'].includes(r.status)) {
      byDay[updatedDay].accepted += 1
    }
    // "replied" = when status moved to replied/booked
    if (updatedDay && byDay[updatedDay] && ['replied','booked'].includes(r.status)) {
      byDay[updatedDay].replied += 1
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

export default router
