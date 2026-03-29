import { Router } from 'express'
import { conversationStore, agentStore } from '../services/store.js'
import { generateAIReply, generateOpeningMessage } from '../routes/conversations.js'
import { executePostConnectionSteps } from '../routes/campaigns.js'
import { supabase } from '../services/supabase.js'

const router = Router()

// ── Shared helper: handle a new connection (accepted invite) ────
// Called from both the webhook and the polling sync endpoint
export async function handleNewConnection({ providerUserId, prospectName, accountId }) {
  if (!providerUserId || !accountId) return
  console.log('[Connection] Handling new connection for:', providerUserId)

  // Find the lead and their campaign
  let campaignId = null
  if (supabase) {
    const { data: leadRow } = await supabase
      .from('campaign_leads')
      .select('campaign_id, status')
      .eq('provider_id', providerUserId)
      .single()

    // Skip if already processed (avoid duplicate messages on repeated calls)
    if (leadRow?.status === 'connected' || leadRow?.status === 'replied') {
      console.log('[Connection] Already processed for:', providerUserId)
      return
    }

    campaignId = leadRow?.campaign_id || null

    await supabase
      .from('campaign_leads')
      .update({ status: 'connected' })
      .eq('provider_id', providerUserId)
      .in('status', ['invited', 'pending']) // only advance if still in earlier state
  }

  // Execute builder sequence message steps after connection_request node
  if (campaignId) {
    await executePostConnectionSteps(providerUserId, accountId, campaignId)
  }

  // Trigger AI opening message if an agent is assigned to the campaign
  const agentId = await findAgentForProspect(providerUserId)
  if (agentId) {
    await generateOpeningMessage({ agentId, accountId, providerUserId, prospectName, campaignId })
  }
}

// Find the campaign agent for a given prospect
async function findAgentForProspect(providerUserId) {
  if (!supabase || !providerUserId) return null
  try {
    const { data } = await supabase
      .from('campaign_leads')
      .select('campaign_id')
      .eq('provider_id', providerUserId)
      .limit(1)
      .single()

    if (!data?.campaign_id) return null

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('settings')
      .eq('id', data.campaign_id)
      .single()

    return campaign?.settings?.agentId || null
  } catch {
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

        let conv = conversationStore.list().find(c => c.linkedinChatId === chatId)
        if (!conv) {
          const agentId = await findAgentForProspect(senderId)
          conv = conversationStore.create(undefined, {
            linkedinChatId:    chatId,
            linkedinAccountId: accountId,
            prospectId:        senderId,
            agentId:           agentId || agentStore.list()[0]?.id || null,
            status:            'ai_active',
          })
        }

        conversationStore.addMessage(conv.id, { from: 'prospect', text, timestamp: data.created_at })

        if (supabase && senderId) {
          await supabase
            .from('campaign_leads')
            .update({ status: 'replied' })
            .eq('provider_id', senderId)
            .eq('status', 'connected')
        }

        if (!conv.aiPaused) await generateAIReply(conv.id)
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
          await supabase.from('campaign_leads').update({ status: 'rejected' }).eq('provider_id', providerUserId)
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
