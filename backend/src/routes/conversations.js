import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { conversationStore, workspaceStore } from '../services/store.js'
import { chats } from '../services/unipile.js'
import { getAgentById } from './agents.js'
import { supabase } from '../services/supabase.js'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// GET /api/conversations
router.get('/', (req, res) => {
  res.json(conversationStore.list())
})

// POST /api/conversations — manually enable AI for an Inbox chat
router.post('/', (req, res) => {
  const { linkedinChatId, linkedinAccountId, agentId, prospectId } = req.body
  if (!linkedinChatId) return res.status(400).json({ message: 'linkedinChatId required' })

  // Return existing if already tracked
  const existing = conversationStore.list().find(c => c.linkedinChatId === linkedinChatId)
  if (existing) {
    const updated = conversationStore.update(existing.id, { aiPaused: false, status: 'ai_active', ...(agentId && { agentId }) })
    return res.json(updated)
  }

  const conv = conversationStore.create(undefined, {
    linkedinChatId,
    linkedinAccountId,
    prospectId,
    agentId: agentId || null,
    status:   'ai_active',
    aiPaused: false,
  })
  res.status(201).json(conv)
})

// GET /api/conversations/by-chat/:chatId
// Lookup a conversation by its LinkedIn chat ID
router.get('/by-chat/:chatId', (req, res) => {
  const conv = conversationStore.list().find(c => c.linkedinChatId === req.params.chatId)
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
    const data = await chats.getMessages(conv.linkedinChatId, { limit: 20 })
    const unipileMsgs = (data?.items || data?.objects || []).reverse() // oldest first

    // Track message IDs already in the store
    const knownIds = new Set(conv.messages.map(m => m.id).filter(Boolean))

    let lastProspectMsgId = null
    for (const m of unipileMsgs) {
      if (knownIds.has(m.id)) continue
      const from = (m.is_sender === 1 || m.is_sender === true) ? 'ai' : 'prospect'
      conversationStore.addMessage(conv.id, {
        id:        m.id,
        from,
        text:      m.text || m.content || '',
        timestamp: m.timestamp || m.created_at,
      })
      if (from === 'prospect') lastProspectMsgId = m.id
    }

    // Only trigger AI if the very last Unipile message is from the prospect
    const allMsgs = (data?.items || data?.objects || []) // newest first
    const lastMsg = allMsgs[0]
    const lastIsProspect = lastMsg && (lastMsg.is_sender === 0 || lastMsg.is_sender === false)

    if (lastIsProspect && !conv.aiPaused && lastProspectMsgId) {
      console.log(`[sync] New prospect message — triggering AI reply for conv ${conv.id}`)
      // Fire-and-forget so response isn't blocked
      generateAIReply(conv.id).catch(err => console.error('[sync] generateAIReply error:', err))
      return res.json({ triggered: true, newMessageId: lastProspectMsgId })
    }

    res.json({ triggered: false, reason: lastIsProspect ? 'ai paused' : 'last message is ours or no new messages' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/conversations/:id/mark-booked
router.post('/:id/mark-booked', async (req, res) => {
  const conv = conversationStore.get(req.params.id)
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })

  // Update in-memory store
  const updated = conversationStore.update(req.params.id, { status: 'booked', aiPaused: true })

  // Persist meeting to Supabase
  if (supabase) {
    const meetingRow = {
      linkedin_chat_id:  conv.linkedinChatId || null,
      prospect_id:       conv.prospectId || null,
      prospect_name:     req.body.prospectName || null,
      account_id:        conv.linkedinAccountId || null,
      agent_id:          conv.agentId || null,
      booked_at:         new Date().toISOString(),
      notes:             req.body.notes || null,
    }

    const { error } = await supabase.from('meetings').insert(meetingRow)
    if (error) console.error('[mark-booked] Failed to save meeting:', error.message)
    else console.log('[mark-booked] Meeting saved to Supabase')

    // Also update campaign lead status to booked if linked
    if (conv.prospectId) {
      await supabase
        .from('campaign_leads')
        .update({ status: 'booked' })
        .eq('provider_id', conv.prospectId)
        .in('status', ['connected', 'replied'])
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
function buildSystemPrompt(agent, profile) {
  const p = agent.persona || {}
  return `You are a LinkedIn AI Sales Assistant for ${profile?.companyName || 'our company'}.

PERSONA:
Role & Objective: ${p.roleAndObjective || ''}
Tone & Style: ${p.toneAndStyle || ''}
Moving to Call: ${p.movingToCall || ''}
Objection Handling: ${p.objectionHandling || ''}
Final Rules: ${p.finalRules || ''}

${profile?.calendarLink ? `Calendar booking link: ${profile.calendarLink}` : ''}

CRITICAL RULES:
- Never admit you are an AI or a bot
- Keep messages concise (under 100 words unless detail is genuinely needed)
- Write in plain conversational English — no bullet points, no formal language
- Always move the conversation toward a booked call when interest is shown
- If they ask for the calendar link, include it directly in your reply`
}

// Internal: generate a Claude reply and send it back to LinkedIn via Unipile
export async function generateAIReply(conversationId) {
  const conv = conversationStore.get(conversationId)
  if (!conv || conv.aiPaused) return null

  const agent = await getAgentById(conv.agentId)
  if (!agent || !agent.persona) return null

  const profile = workspaceStore.getProfile()
  const recentMessages = conv.messages.slice(-8) // last 4 exchanges

  const conversationHistory = recentMessages.map(m => ({
    role: m.from === 'prospect' ? 'user' : 'assistant',
    content: m.text,
  }))

  // Ensure we have valid alternating history (Claude requires user → assistant alternation)
  // Filter to ensure it starts with a user message
  const validHistory = conversationHistory.filter((_, i) => {
    if (i === 0) return conversationHistory[0].role === 'user'
    return true
  })

  if (validHistory.length === 0) return null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: buildSystemPrompt(agent, profile),
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

    return replyText
  } catch (err) {
    console.error('[AI] Reply generation failed:', err.message)
    return null
  }
}

// Internal: generate and send an opening message after connection accepted
export async function generateOpeningMessage({ agentId, accountId, providerUserId, prospectName, campaignId }) {
  const agent = await getAgentById(agentId)
  if (!agent || !agent.persona) return null

  const profile = workspaceStore.getProfile()

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: buildSystemPrompt(agent, profile),
      messages: [{
        role: 'user',
        content: `[SYSTEM: Write the first opening message to send to ${prospectName || 'this new connection'} who just accepted my connection request on LinkedIn. Do not greet with "Hi [Name]," — just write the message body. Be natural, brief, and curious. Do not pitch immediately.]`,
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
      const existing = conversationStore.list().find(c => c.linkedinChatId === chatId)
      if (!existing) {
        conversationStore.create(undefined, {
          linkedinChatId:    chatId,
          linkedinAccountId: accountId,
          prospectId:        providerUserId,
          agentId,
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
