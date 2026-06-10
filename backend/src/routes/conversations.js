import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { conversationStore } from '../services/store.js'
import { chats } from '../services/unipile.js'
import { getAgentById } from './agents.js'
import { supabase } from '../services/supabase.js'
import { isWithinSchedule, consumeDailyLimit } from '../services/limits.js'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

// ── AI Reply delay ─────────────────────────────────────────────
// Override with env vars for testing: AI_REPLY_DELAY_MS=5000 (5 seconds)
const OPENING_MSG_DELAY_MS = parseInt(process.env.OPENING_MSG_DELAY_MS || '') || 45 * 60 * 1000
const AI_REPLY_DELAY_MS    = parseInt(process.env.AI_REPLY_DELAY_MS    || '') || 5 * 60 * 1000
const LONG_REPLY_DELAY_MS  = parseInt(process.env.LONG_REPLY_DELAY_MS  || '') || 30 * 60 * 1000

// Map<conversationId, timeoutId> — tracks pending delayed replies
const pendingReplies = new Map()

// Map<"campaignId:providerUserId", timeoutId> — tracks pending opening messages
const pendingOpenings = new Map()

export function scheduleAIReply(conversationId) {
  // Don't schedule if one is already pending for this conversation
  if (pendingReplies.has(conversationId)) return

  // After 4+ AI messages the conversation is established — use a longer delay
  const conv = conversationStore.get(conversationId)
  const aiMessageCount = conv ? conv.messages.filter(m => m.from === 'ai').length : 0
  const delayMs = aiMessageCount >= 4 ? LONG_REPLY_DELAY_MS : AI_REPLY_DELAY_MS
  const delayMin = Math.round(delayMs / 60000)

  const timer = setTimeout(() => {
    pendingReplies.delete(conversationId)
    generateAIReply(conversationId).catch(err =>
      console.error('[sync] generateAIReply error:', err)
    )
  }, delayMs)
  pendingReplies.set(conversationId, timer)
  console.log(`[sync] AI reply scheduled in ${delayMin} min for conv ${conversationId} (${aiMessageCount} AI msgs so far)`)
}

// Schedule the opening message with a 45-min delay after connection is accepted
export function scheduleOpeningMessage(params) {
  const key = `${params.campaignId}:${params.providerUserId}`
  if (pendingOpenings.has(key)) return
  const timer = setTimeout(() => {
    pendingOpenings.delete(key)
    generateOpeningMessage(params).catch(err =>
      console.error('[sync] generateOpeningMessage error:', err)
    )
  }, OPENING_MSG_DELAY_MS)
  pendingOpenings.set(key, timer)
  console.log(`[sync] Opening message scheduled in ${Math.round(OPENING_MSG_DELAY_MS / 60000)} min for ${params.providerUserId}`)
}

function cancelPendingReply(conversationId) {
  const timer = pendingReplies.get(conversationId)
  if (timer) {
    clearTimeout(timer)
    pendingReplies.delete(conversationId)
    console.log(`[sync] Cancelled pending AI reply for conv ${conversationId}`)
  }
}

// GET /api/conversations
router.get('/', (req, res) => {
  const ws = req.workspaceId
  res.json(ws && ws !== 'ws_default' ? conversationStore.list(ws) : conversationStore.list())
})

// POST /api/conversations — track an Inbox chat (AI is not enabled for inbox)
router.post('/', (req, res) => {
  const { linkedinChatId, linkedinAccountId, agentId, prospectId } = req.body
  if (!linkedinChatId) return res.status(400).json({ message: 'linkedinChatId required' })

  // Return existing if already tracked
  const existing = conversationStore.list().find(c => c.linkedinChatId === linkedinChatId)
  if (existing) return res.json(existing)

  const conv = conversationStore.create(req.workspaceId, {
    linkedinChatId,
    linkedinAccountId,
    prospectId,
    agentId: agentId || null,
    workspaceId: req.workspaceId,
    source:   'inbox',
    status:   'review',
    aiPaused: true,
  })
  res.status(201).json(conv)
})

// GET /api/conversations/by-chat/:chatId
// Lookup a conversation by its LinkedIn chat ID
router.get('/by-chat/:chatId', (req, res) => {
  const ws = req.workspaceId
  const all = conversationStore.list()
  const list = ws && ws !== 'ws_default' ? all.filter(c => c.workspaceId === ws) : all
  const conv = list.find(c => c.linkedinChatId === req.params.chatId)
  if (!conv) return res.status(404).json({ message: 'Not found' })
  res.json(conv)
})

// GET /api/conversations/:id
router.get('/:id', (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  res.json(conv)
})

// POST /api/conversations/:id/pause-ai
router.post('/:id/pause-ai', (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  cancelPendingReply(req.params.id)
  const updated = conversationStore.update(req.params.id, { aiPaused: true, status: 'review' })
  res.json(updated)
})

// POST /api/conversations/:id/resume-ai
router.post('/:id/resume-ai', (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  const updated = conversationStore.update(req.params.id, { aiPaused: false, status: 'ai_active' })
  res.json(updated)
})

// POST /api/conversations/:id/sync
// Fetch latest Unipile messages, store new prospect messages, trigger AI reply if needed.
// Used as a webhook fallback for local dev where Unipile can't reach localhost.
router.post('/:id/sync', async (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  if (!conv.linkedinChatId) return res.json({ triggered: false, reason: 'no chat id' })

  try {
    const data = await chats.getMessages(conv.linkedinChatId, { limit: 50 })
    const unipileMsgs = data?.items || data?.objects || [] // newest-first (Unipile API order)

    // Track message IDs already in the store
    const knownIds = new Set(conv.messages.map(m => m.id).filter(Boolean))

    for (const m of unipileMsgs) {
      if (knownIds.has(m.id)) continue
      const isSender = m.is_sender === 1 || m.is_sender === true
      conversationStore.addMessage(conv.id, {
        id:        m.id,
        from:      isSender ? 'ai' : 'prospect',
        text:      m.text || m.content || '',
        timestamp: m.timestamp || m.created_at,
      })
    }

    // API returns newest-first — index 0 is the most recent message
    const lastMsg = unipileMsgs[0]
    const lastIsProspect = lastMsg && lastMsg.is_sender !== 1 && lastMsg.is_sender !== true


    if (lastIsProspect && !conv.aiPaused) {
      scheduleAIReply(conv.id)
      return res.json({ triggered: true, scheduled: true })
    }

    res.json({ triggered: false, reason: lastIsProspect ? 'ai paused' : 'last message is ours' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/conversations/:id/mark-booked
router.post('/:id/mark-booked', async (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })

  // Cancel any pending delayed reply
  cancelPendingReply(req.params.id)
  // Update in-memory store
  const updated = conversationStore.update(req.params.id, { status: 'booked', aiPaused: true })

  // Persist meeting to Supabase
  if (supabase) {
    // If prospectId or campaignId is missing from the in-memory record (e.g. after a server
    // restart that wiped the store), recover them from campaign_leads via the chat ID.
    let prospectId = conv.prospectId || null
    let campaignId = conv.campaignId || null
    if ((!prospectId || !campaignId) && conv.linkedinChatId) {
      const { data: leadRow } = await supabase
        .from('campaign_leads')
        .select('provider_id, campaign_id')
        .eq('chat_id', conv.linkedinChatId)
        .maybeSingle()
      if (leadRow) {
        prospectId  = prospectId  || leadRow.provider_id  || null
        campaignId  = campaignId  || leadRow.campaign_id  || null
      }
    }

    const meetingRow = {
      workspace_id:      conv.workspaceId || null,
      linkedin_chat_id:  conv.linkedinChatId || null,
      prospect_id:       prospectId,
      prospect_name:     req.body.prospectName || null,
      account_id:        conv.linkedinAccountId || null,
      agent_id:          conv.agentId || null,
      campaign_id:       campaignId,
      booked_at:         new Date().toISOString(),
      notes:             req.body.notes || null,
    }

    const { error } = await supabase.from('meetings').insert(meetingRow)
    if (error) console.error('[mark-booked] Failed to save meeting:', error.message)
    else console.log('[mark-booked] Meeting saved to Supabase')

    // Update campaign lead status — scoped to the specific campaign when known
    if (prospectId) {
      let query = supabase
        .from('campaign_leads')
        .update({ status: 'booked' })
        .eq('provider_id', prospectId)
        .in('status', ['connected', 'replied'])
      if (campaignId) query = query.eq('campaign_id', campaignId)
      await query
    }
  }

  res.json(updated)
})

// POST /api/conversations/:id/reply
// Human sends a manual reply (AI is paused)
router.post('/:id/reply', (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ message: 'text required' })

  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })

  const updated = conversationStore.addMessage(req.params.id, {
    from: 'human_override',
    text,
  })
  res.json(updated)
})

// POST /api/conversations/ai-edit
// AI Editor — rewrites a persona section based on plain English instruction
router.post('/ai-edit', async (req, res) => {
  try {
    const { section, sectionContent, instruction } = req.body
    if (!section || !sectionContent || !instruction) {
      return res.status(400).json({ message: 'section, sectionContent, and instruction required' })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are editing an AI Assistant persona section for a LinkedIn outreach agent.

Section name: ${section}
Current content:
${sectionContent}

Instruction from user: ${instruction}

Rewrite this section applying the instruction. Keep the same general structure but improve it per the instruction. Return only the rewritten section text — no preamble, no explanation.`
      }]
    })

    res.json({ rewritten: message.content[0].text.trim() })
  } catch (err) {
    console.error('AI edit error:', err)
    res.status(500).json({ message: 'AI edit failed', error: err.message })
  }
})

// ── Core AI engine ─────────────────────────────────────────────
// Builds the system prompt from agent persona + workspace profile
function buildSystemPrompt(agent, profile, prospectBrief) {
  const p = agent.persona || {}
  return `You are a LinkedIn AI Sales Assistant for ${profile?.companyName || 'our company'}.

PERSONA:
Role & Objective: ${p.roleAndObjective || ''}
Tone & Style: ${p.toneAndStyle || ''}
Moving to Call: ${p.movingToCall || ''}
Objection Handling: ${p.objectionHandling || ''}
${p.exampleConversation ? `Example Conversation:\n${p.exampleConversation}\n` : ''}Final Rules: ${p.finalRules || ''}
${prospectBrief ? `\nPROSPECT CONTEXT (use this to personalise your messages — do not quote it verbatim):\n${prospectBrief}` : ''}
${profile?.calendarLink ? `\nCalendar booking link: ${profile.calendarLink}` : ''}

CRITICAL RULES:
- Never admit you are an AI or a bot
- Keep messages concise (under 100 words unless detail is genuinely needed)
- Write in plain conversational English — no bullet points, no formal language
- Always move the conversation toward a booked call when interest is shown
- If they ask for the calendar link, include it directly in your reply
- NEVER invent or assume the prospect's job title, company name, or any personal details that were not explicitly provided in the PROSPECT CONTEXT section above — if you are unsure, ask a question instead`
}

// Fetch campaign settings for a prospect (used for schedule + frequency checks).
// Uses campaignId directly when known, avoiding an ambiguous multi-campaign lookup.
async function getCampaignSettingsForProspect(prospectId, campaignId = null) {
  if (!supabase || !prospectId) return null
  try {
    let cid = campaignId
    if (!cid) {
      const { data: lead } = await supabase
        .from('campaign_leads')
        .select('campaign_id')
        .eq('provider_id', prospectId)
        .limit(1)
        .maybeSingle()
      cid = lead?.campaign_id
    }
    if (!cid) return null
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, settings')
      .eq('id', cid)
      .single()
    return campaign || null
  } catch {
    return null
  }
}

// Internal: generate a Claude reply and send it back to LinkedIn via Unipile
export async function generateAIReply(conversationId) {
  const conv = conversationStore.get(conversationId)
  if (!conv || conv.aiPaused) return null

  const agent = await getAgentById(conv.agentId)
  if (!agent || !agent.persona) return null

  // Enforce campaign schedule and message frequency limit
  const campaignData = await getCampaignSettingsForProspect(conv.prospectId, conv.campaignId)
  if (campaignData) {
    const settings  = campaignData.settings || {}
    if (settings.schedule?.length && !isWithinSchedule(settings.schedule, settings.timezone)) {
      console.log(`[AI reply] skipped for ${conv.prospectId} — outside campaign schedule`)
      return null
    }
    const msgLimit = settings.frequency?.messages
    if (!consumeDailyLimit(campaignData.id, 'messages', msgLimit)) {
      console.log(`[AI reply] skipped for ${conv.prospectId} — daily message limit (${msgLimit}) reached`)
      return null
    }
  }

  const profile = await getWorkspaceProfile(conv.workspaceId)

  // Load cached profile summary so AI replies are also prospect-aware
  let profileSummary = null
  if (supabase && conv.prospectId) {
    const { data: leadRow } = await supabase
      .from('campaign_leads')
      .select('profile_summary')
      .eq('provider_id', conv.prospectId)
      .maybeSingle()
    profileSummary = leadRow?.profile_summary || null
  }

  const recentMessages = conv.messages.slice(-8) // last 4 exchanges

  const rawHistory = recentMessages
    .map(m => ({ role: m.from === 'prospect' ? 'user' : 'assistant', content: m.text || '' }))
    .filter(m => m.content)

  // Build a valid alternating history by walking backwards from the most recent message,
  // keeping only one message per role-turn (Claude requires strict user/assistant alternation).
  const validHistory = []
  let lastRole = null
  for (let i = rawHistory.length - 1; i >= 0; i--) {
    const msg = rawHistory[i]
    if (msg.role !== lastRole) {
      validHistory.unshift(msg)
      lastRole = msg.role
    }
  }
  // Must start with 'user'
  while (validHistory.length && validHistory[0].role !== 'user') {
    validHistory.shift()
  }

  if (validHistory.length === 0) return null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: buildSystemPrompt(agent, profile, profileSummary),
      messages: validHistory,
    })

    const replyText = message.content[0].text.trim()
    if (!replyText) return null

    // Store in conversation
    conversationStore.addMessage(conversationId, { from: 'ai', text: replyText })

    // Actually send via Unipile back to LinkedIn
    if (conv.linkedinChatId) {
      try {
        await chats.sendMessage(conv.linkedinChatId, replyText)
        console.log(`[AI] Sent reply to chat ${conv.linkedinChatId}: "${replyText.slice(0, 60)}…"`)
      } catch (sendErr) {
        console.error('[AI] Failed to send via Unipile:', sendErr.message)
      }
    }

    // Auto-detect booking: if the AI included the calendar link it's booking a meeting
    if (profile?.calendarLink && replyText.includes(profile.calendarLink)) {
      console.log(`[AI] Calendar link detected in reply — auto-marking conv ${conversationId} as booked`)
      conversationStore.update(conversationId, { status: 'booked', aiPaused: true })

      if (supabase) {
        // Recover campaignId/prospectId if not on the in-memory record
        let prospectId = conv.prospectId || null
        let campaignId = conv.campaignId || null
        if ((!prospectId || !campaignId) && conv.linkedinChatId) {
          const { data: leadRow } = await supabase
            .from('campaign_leads')
            .select('provider_id, campaign_id')
            .eq('chat_id', conv.linkedinChatId)
            .maybeSingle()
          if (leadRow) {
            prospectId = prospectId || leadRow.provider_id || null
            campaignId = campaignId || leadRow.campaign_id || null
          }
        }

        const { error: meetingErr } = await supabase.from('meetings').insert({
          linkedin_chat_id: conv.linkedinChatId || null,
          prospect_id:      prospectId,
          account_id:       conv.linkedinAccountId || null,
          agent_id:         conv.agentId || null,
          campaign_id:      campaignId,
          booked_at:        new Date().toISOString(),
          notes:            'Auto-detected: AI sent calendar link',
        })
        if (meetingErr) console.error('[AI] Failed to save auto-detected meeting:', meetingErr.message)

        if (prospectId) {
          let q = supabase
            .from('campaign_leads')
            .update({ status: 'booked' })
            .eq('provider_id', prospectId)
            .in('status', ['connected', 'replied'])
          if (campaignId) q = q.eq('campaign_id', campaignId)
          await q
        }
      }
    }

    return replyText
  } catch (err) {
    console.error('[AI] Reply generation failed:', err.message)
    return null
  }
}

// Internal: generate and send an opening message after connection accepted
export async function generateOpeningMessage({ agentId, accountId, providerUserId, prospectName, campaignId, workspaceId, profileSummary }) {
  const agent = await getAgentById(agentId)
  if (!agent || !agent.persona) return null

  // Enforce campaign schedule and message frequency limit
  if (campaignId && supabase) {
    try {
      const { data: campaign } = await supabase
        .from('campaigns').select('settings').eq('id', campaignId).single()
      if (campaign) {
        const settings = campaign.settings || {}
        if (settings.schedule?.length && !isWithinSchedule(settings.schedule, settings.timezone)) {
          console.log(`[AI opening] skipped for ${providerUserId} — outside campaign schedule`)
          return null
        }
        const msgLimit = settings.frequency?.messages
        if (!consumeDailyLimit(campaignId, 'messages', msgLimit)) {
          console.log(`[AI opening] skipped for ${providerUserId} — daily message limit (${msgLimit}) reached`)
          return null
        }
      }
    } catch (err) {
      console.log(`[AI opening] could not check schedule/frequency: ${err.message}`)
    }
  }

  const profile = await getWorkspaceProfile(workspaceId)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: buildSystemPrompt(agent, profile, profileSummary || null),
      messages: [{
        role: 'user',
        content: `[SYSTEM: Write the first opening message to send to ${prospectName || 'this new connection'} who just accepted my connection request on LinkedIn.${profileSummary ? ' Use the PROSPECT CONTEXT to make the message feel personal and relevant to them.' : ''} Do not greet with "Hi [Name]," — just write the message body. Be natural, brief, and curious. Do not pitch immediately.]`,
      }],
    })

    const text = message.content[0].text.trim()
    if (!text) return null

    // Send directly as a LinkedIn message via Unipile
    const { linkedin } = await import('../services/unipile.js')
    const chatResult = await linkedin.sendMessage({ accountId, providerUserId, text })
    const chatId = chatResult?.chat_id || chatResult?.id || null
    console.log(`[AI] Sent opening message to ${providerUserId}, chatId=${chatId}: "${text.slice(0, 60)}…"`)

    // Create a conversation record so future replies can be routed to this AI agent
    if (chatId) {
      const existing = conversationStore.findByChatId(chatId)
      if (!existing) {
        conversationStore.create(workspaceId, {
          linkedinChatId:    chatId,
          linkedinAccountId: accountId,
          prospectId:        providerUserId,
          agentId,
          campaignId:        campaignId || null,
          source:   'campaign',
          status:   'ai_active',
          aiPaused: false,
        })
        console.log(`[AI] Created conversation record for chat ${chatId}`)
      }

      // Persist chatId on the campaign lead so sync-messages can find the chat
      if (campaignId) {
        const { supabase } = await import('../services/supabase.js')
        await supabase.from('campaign_leads')
          .update({ chat_id: chatId })
          .eq('provider_id', providerUserId)
          .eq('campaign_id', campaignId)
          .catch(() => {}) // column may not exist yet — ignore
      }
    }

    return text
  } catch (err) {
    console.error('[AI] Opening message failed:', err.message)
    return null
  }
}

export default router
