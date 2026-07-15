import { Router } from 'express'
import { conversationStore } from '../services/store.js'
import { scheduleAIReply } from '../routes/conversations.js'
import { supabase } from '../services/supabase.js'
import { logLeadActivity } from '../services/leadActivity.js'
import { canAiTakeOver } from '../services/replyTakeover.js'
import { enqueuePostConnection, enqueueResumePendingStep } from '../services/campaignQueue.js'

const router = Router()

// Verify webhook secret if configured
router.use((req, res, next) => {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET
  if (!secret) return next() // No secret configured — skip check (dev mode)
  const provided = req.headers['x-unipile-secret'] || req.headers['x-webhook-secret']
  if (provided !== secret) {
    console.warn('[webhook] Rejected request with invalid secret')
    return res.status(401).json({ message: 'Invalid webhook secret' })
  }
  next()
})

// ── Shared helper: handle a new connection (accepted invite) ────
// Called from both the webhook and the polling sync endpoint
export async function handleNewConnection({ providerUserId, accountId }) {
  if (!providerUserId || !accountId) return
  console.log('[Connection] Handling new connection for:', providerUserId)

  // Find the lead and their campaign
  let campaignId = null
  let workspaceId = null
  if (supabase) {
    const { data: leadRow } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, status, workspace_id')
      .eq('provider_id', providerUserId)
      .limit(1)
      .maybeSingle()

    // Skip if already processed (avoid duplicate messages on repeated calls)
    if (['connected', 'replied', 'booked'].includes(leadRow?.status)) {
      console.log('[Connection] Already processed for:', providerUserId)
      return
    }

    campaignId = leadRow?.campaign_id || null
    workspaceId = leadRow?.workspace_id || null

    await supabase
      .from('campaign_leads')
      .update({ status: 'connected' })
      .eq('provider_id', providerUserId)
      .in('status', ['invited', 'pending']) // only advance if still in earlier state

    if (leadRow?.id) logLeadActivity(campaignId, leadRow.id, 'connected')
  }

  // Execute builder sequence message steps after connection_request node —
  // via the durable queue rather than inline, so a crash mid-processing
  // doesn't silently drop the post-connection sequence (see campaignQueue.js).
  if (campaignId) {
    await enqueuePostConnection({ providerUserId, accountId, campaignId, workspaceId })
  }
}

// Find the campaign agent for a given prospect — only returns if agent is active.
async function findAgentForProspect(providerUserId) {
  if (!supabase || !providerUserId) return null
  try {
    const { data: lead } = await supabase
      .from('campaign_leads')
      .select('campaign_id')
      .eq('provider_id', providerUserId)
      .limit(1)
      .maybeSingle()

    if (!lead?.campaign_id) {
      console.log(`[findAgent] no campaign_lead found for providerUserId=${providerUserId} — AI message will not fire`)
      return null
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('settings')
      .eq('id', lead.campaign_id)
      .maybeSingle()

    const agentId = campaign?.settings?.agentId
    if (!agentId) {
      console.log(`[findAgent] campaign ${lead.campaign_id} has no agentId in settings — AI message will not fire`)
      return null
    }

    // Only return if the agent is active — paused agents should not send messages
    const { data: agent } = await supabase
      .from('agents')
      .select('id, status')
      .eq('id', agentId)
      .maybeSingle()

    if (!agent) {
      console.log(`[findAgent] agentId=${agentId} not found in DB — AI message will not fire`)
      return null
    }
    if (agent.status !== 'active') {
      console.log(`[findAgent] agentId=${agentId} status=${agent.status} (not active) — AI message will not fire`)
      return null
    }

    console.log(`[findAgent] resolved agentId=${agentId} (active) for providerUserId=${providerUserId}`)
    return agentId
  } catch (err) {
    console.error(`[findAgent] error for providerUserId=${providerUserId}:`, err.message)
    return null
  }
}

// POST /api/webhooks/unipile
router.post('/unipile', async (req, res) => {
  res.status(200).json({ received: true })

  try {
    const event = req.body
    console.log('[Webhook] Unipile event type:', event?.type)

    if (!event?.type) return

    switch (event.type) {

      case 'account_created': {
        const { account_id, name, provider } = event.data || {}
        console.log(`[Webhook] Account connected: ${name} (${account_id}) via ${provider}`)
        // `name` is the workspace ID we passed when creating the hosted-auth link
        if (supabase && account_id && name) {
          const { error } = await supabase
            .from('workspace_linkedin_accounts')
            .upsert(
              { workspace_id: name, unipile_account_id: account_id, name: null },
              { onConflict: 'unipile_account_id' }
            )
          if (error) console.error('[Webhook] Failed to save account to DB:', error.message)
          else console.log(`[Webhook] Saved account ${account_id} to workspace ${name}`)
        }
        break
      }

      case 'account_deleted': {
        console.log('[Webhook] Account disconnected:', event.data?.account_id)
        break
      }

      case 'message_received': {
        const data = event.data || {}
        const chatId    = data.chat_id || data.threadId
        const senderId  = data.sender?.provider_id || data.senderId
        const text      = data.text || data.content || ''
        const accountId = data.account_id

        if (!chatId || !text) break

        let conv = conversationStore.findByChatId(chatId)

        // If the sender is NOT the prospect (i.e. it's our own outgoing message),
        // store it as 'ai' and do not trigger a reply.
        const isOurMessage = conv?.prospectId && senderId !== conv.prospectId
        if (isOurMessage) {
          conversationStore.addMessage(conv.id, { from: 'ai', text, timestamp: data.created_at })
          break
        }

        if (!conv) {
          const agentId = await findAgentForProspect(senderId)

          // Resolve the workspace from the LinkedIn account so resolveAgentForConv
          // can fall back to any active workspace agent for inbox conversations
          let workspaceId
          if (supabase && accountId) {
            try {
              const { data: acct } = await supabase
                .from('workspace_linkedin_accounts')
                .select('workspace_id')
                .eq('unipile_account_id', accountId)
                .maybeSingle()
              workspaceId = acct?.workspace_id || undefined
            } catch {}
          }

          conv = conversationStore.create(workspaceId, {
            linkedinChatId:    chatId,
            linkedinAccountId: accountId,
            prospectId:        senderId,
            agentId:           agentId || null,
            workspaceId,
            status:            agentId ? 'ai_active' : 'review',
            source:            agentId ? 'campaign' : 'inbox',
            aiPaused:          !agentId,
          })
        }

        conversationStore.addMessage(conv.id, { from: 'prospect', text, timestamp: data.created_at })

        if (supabase && senderId) {
          let q = supabase
            .from('campaign_leads')
            .update({ status: 'replied' })
            .eq('provider_id', senderId)
            .eq('status', 'connected')
          if (conv.campaignId) q = q.eq('campaign_id', conv.campaignId)
          const { data: repliedLeads } = await q.select('id, campaign_id')
          for (const row of repliedLeads || []) logLeadActivity(row.campaign_id, row.id, 'replied')
        }

        // Resume any sequence paused on this lead's Replied/Not Replied branch
        if (senderId && conv.campaignId) {
          enqueueResumePendingStep(senderId, conv.campaignId, { outcome: 'replied' })
            .catch(err => console.error('[Webhook] enqueueResumePendingStep error:', err.message))
        }

        // Use scheduleAIReply (45-min delay) — same as the polling path.
        // isFromProspect is always true here — the isOurMessage branch above
        // already returned for our own outgoing messages.
        if (canAiTakeOver({ isFromProspect: true, aiPaused: conv.aiPaused })) scheduleAIReply(conv.id)
        break
      }

      // Unipile sends "new_relation" when a connection request is accepted
      case 'new_relation': {
        const providerUserId = event.user_provider_id || event.data?.user_provider_id || event.data?.provider_id
        const prospectName   = event.user_full_name   || event.data?.user_full_name   || event.data?.name || ''
        const accountId      = event.account_id       || event.data?.account_id
        console.log('[Webhook] new_relation:', providerUserId, 'account:', accountId)
        await handleNewConnection({ providerUserId, prospectName, accountId })
        break
      }

      // Keep legacy event names in case some Unipile plans use them
      case 'connection_accepted': {
        const data = event.data || {}
        const providerUserId = data.attendee?.provider_id || data.user_provider_id || data.prospectId
        const prospectName   = data.attendee?.name        || data.user_full_name   || ''
        const accountId      = data.account_id
        console.log('[Webhook] connection_accepted:', providerUserId)
        await handleNewConnection({ providerUserId, prospectName, accountId })
        break
      }

      case 'connection_rejected': {
        const data = event.data || {}
        const providerUserId = data.attendee?.provider_id || data.user_provider_id || data.prospectId
        console.log('[Webhook] Connection rejected:', providerUserId)
        if (supabase && providerUserId) {
          await supabase.from('campaign_leads')
            .update({ status: 'rejected' })
            .eq('provider_id', providerUserId)
            .in('status', ['pending', 'invited'])
        }
        break
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type, JSON.stringify(event).slice(0, 200))
    }
  } catch (err) {
    console.error('[Webhook] Error:', err)
  }
})

export default router
