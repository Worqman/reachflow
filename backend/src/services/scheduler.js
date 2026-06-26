import { supabase } from './supabase.js'
import { syncCampaignStatuses, executePostConnectionSteps, runCampaignInvites } from '../routes/campaigns.js'
import { conversationStore } from './store.js'

async function processActiveCampaigns() {
  if (!supabase) return

  let campaigns
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, workspace_id')
      .eq('status', 'active')

    if (error) throw error
    campaigns = data || []
  } catch (err) {
    console.error('[scheduler] Failed to fetch active campaigns:', err.message)
    return
  }

  if (!campaigns.length) return
  console.log(`[scheduler] Syncing statuses for ${campaigns.length} active campaign(s)`)

  for (const campaign of campaigns) {
    syncCampaignStatuses(campaign.id, campaign.workspace_id)
      .then(result => {
        if (result.connected > 0) {
          console.log(`[scheduler] Campaign ${campaign.id}: ${result.connected} new connection(s) detected`)
        }
      })
      .catch(err => {
        console.error(`[scheduler] Campaign ${campaign.id} sync error:`, err.message)
      })

    // Resume invite sending for pending leads — recovers loops killed by a
    // server restart. runCampaignInvites enforces schedule, daily limits and
    // skips campaigns whose loop is already running.
    runCampaignInvites(campaign.id, campaign.workspace_id)
      .then(result => {
        if (result.queued > 0) {
          console.log(`[scheduler] Campaign ${campaign.id}: resumed invites for ${result.queued} pending lead(s)`)
        }
      })
      .catch(err => {
        console.error(`[scheduler] Campaign ${campaign.id} invite error:`, err.message)
      })
  }
}

// Recover any sequence wait nodes that were persisted but never resumed
// (e.g. because the server restarted mid-wait).
async function resumePendingWaits() {
  if (!supabase) return
  try {
    const { data: leads } = await supabase
      .from('campaign_leads')
      .select('provider_id, campaign_id, workspace_id, sequence_step')
      .not('sequence_resume_at', 'is', null)
      .lte('sequence_resume_at', new Date().toISOString())

    if (!leads?.length) return
    console.log(`[scheduler] Recovering ${leads.length} pending wait node(s)`)

    for (const lead of leads) {
      const { data: campaign } = await supabase
        .from('campaigns').select('settings').eq('id', lead.campaign_id).maybeSingle()
      const accountId = campaign?.settings?.linkedinAccountId || campaign?.settings?.accountId
      if (!accountId) continue

      console.log(`[scheduler] Resuming sequence at step ${lead.sequence_step} for ${lead.provider_id}`)
      executePostConnectionSteps(
        lead.provider_id, accountId, lead.campaign_id, lead.workspace_id, lead.sequence_step
      ).catch(err => console.error(`[scheduler] wait resume error:`, err.message))
    }
  } catch (err) {
    console.error('[scheduler] resumePendingWaits error:', err.message)
  }
}

// Poll all AI-enabled conversations for new prospect messages and trigger replies.
// This is the fallback for when Unipile webhooks are not delivered (e.g. local dev).
async function syncAIConversations() {
  const conversations = conversationStore.list().filter(c => !c.aiPaused && c.linkedinChatId)
  if (!conversations.length) return

  let triggered = 0
  try {
    const { chats } = await import('../services/unipile.js')
    const { scheduleAIReply } = await import('../routes/conversations.js')

    for (const conv of conversations) {
      try {
        const data = await chats.getMessages(conv.linkedinChatId, { limit: 5 })
        const msgs = data?.items || data?.objects || []
        if (!msgs.length) continue

        // Unipile returns newest-first — index 0 is most recent
        const latest = msgs[0]
        const latestIsProspect = latest.is_sender === 0 || latest.is_sender === false
        if (!latestIsProspect) continue

        // Skip if we already know this message
        const alreadyKnown = conv.messages.some(m => m.id === latest.id)
        if (alreadyKnown) continue

        // Store new prospect messages
        const knownIds = new Set(conv.messages.map(m => m.id).filter(Boolean))
        const newMsgs = [...msgs].reverse().filter(
          m => !knownIds.has(m.id) && !(m.is_sender === 1 || m.is_sender === true)
        )
        for (const m of newMsgs) {
          conversationStore.addMessage(conv.id, {
            id:        m.id,
            from:      'prospect',
            text:      m.text || m.content || '',
            timestamp: m.timestamp || m.created_at,
          })
        }

        scheduleAIReply(conv.id)
        triggered++
      } catch (err) {
        const msg = err.message || ''
        // Chat no longer accessible — pause AI so we stop polling it
        if (msg.toLowerCase().includes('not found') || msg.includes('403') || msg.toLowerCase().includes('access')) {
          console.warn(`[sync-ai-convs] Chat inaccessible for conv ${conv.id} — pausing AI. Reason: ${msg}`)
          conversationStore.update(conv.id, { aiPaused: true, status: 'review' })
        } else {
          console.error(`[sync-ai-convs] error for conv ${conv.id}:`, msg)
        }
      }
    }
  } catch (err) {
    console.error('[sync-ai-convs] import error:', err.message)
  }

  if (triggered > 0) {
    console.log(`[sync-ai-convs] Scheduled AI replies for ${triggered} conversation(s)`)
  }
}

// Run every hour by default; override with SCHEDULER_INTERVAL_MS env var
export function startScheduler() {
  const intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS || '') || 60 * 60 * 1000

  console.log(`[scheduler] Starting — checking active campaigns every ${Math.round(intervalMs / 60000)} min`)

  // AI conversation sync runs more frequently than campaign sync (default every 10 min)
  const aiSyncIntervalMs = parseInt(process.env.AI_SYNC_INTERVAL_MS || '') || 10 * 60 * 1000

  // Run once shortly after startup, then on interval
  setTimeout(processActiveCampaigns, 30 * 1000)
  setTimeout(resumePendingWaits, 35 * 1000)
  setTimeout(syncAIConversations, 60 * 1000) // first check 1 min after startup
  setInterval(processActiveCampaigns, intervalMs)
  setInterval(resumePendingWaits, intervalMs)
  setInterval(syncAIConversations, aiSyncIntervalMs)

  console.log(`[scheduler] AI conversation sync every ${Math.round(aiSyncIntervalMs / 60000)} min`)
}
