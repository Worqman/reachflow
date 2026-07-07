import { randomUUID } from 'crypto'
import { supabase } from './supabase.js'
import { syncCampaignStatuses, runCampaignInvites, resumeReplyBranch, resumeFromPendingStep } from '../routes/campaigns.js'
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

// One-time (idempotent — safe to run every scheduler tick) conversion of
// leads paused under the pre-nested-branching flat-index columns
// (sequence_step/sequence_resume_at, reply_wait_step/reply_wait_deadline)
// into the new node-id-keyed pending_step column. Every lead paused by the
// old executor was paused at the tree root level, so its resume point is
// always representable as a single-element path. Each row is cleared of its
// legacy columns once converted, so this naturally drains to a no-op.
async function backfillLegacyPendingSteps() {
  if (!supabase) return
  try {
    async function resolveLegacyNodeId(campaignId, stepIndex) {
      const { data: campaign } = await supabase
        .from('campaigns').select('sequence').eq('id', campaignId).maybeSingle()
      const nodes = campaign?.sequence?.nodes || []
      const connectIdx = nodes.findIndex(n => n.type === 'connection_request')
      const postNodes = connectIdx >= 0 ? nodes.slice(connectIdx + 1) : nodes
      return postNodes[stepIndex]?.id || null
    }

    const { data: waitLeads } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, sequence_step, sequence_resume_at')
      .not('sequence_resume_at', 'is', null)
    for (const lead of waitLeads || []) {
      const nodeId = await resolveLegacyNodeId(lead.campaign_id, lead.sequence_step)
      await supabase.from('campaign_leads').update({
        sequence_step: null,
        sequence_resume_at: null,
        ...(nodeId ? { pending_step: {
          kind: 'wait',
          path: [{ nodeId, branch: null }],
          deadline: lead.sequence_resume_at,
          claimId: randomUUID(),
        } } : {}),
      }).eq('id', lead.id)
    }

    const { data: replyLeads } = await supabase
      .from('campaign_leads')
      .select('id, campaign_id, reply_wait_step, reply_wait_deadline')
      .not('reply_wait_deadline', 'is', null)
    for (const lead of replyLeads || []) {
      const nodeId = await resolveLegacyNodeId(lead.campaign_id, lead.reply_wait_step)
      await supabase.from('campaign_leads').update({
        reply_wait_step: null,
        reply_wait_deadline: null,
        ...(nodeId ? { pending_step: {
          kind: 'reply',
          path: [{ nodeId, branch: null }],
          deadline: lead.reply_wait_deadline,
          claimId: randomUUID(),
        } } : {}),
      }).eq('id', lead.id)
    }

    const total = (waitLeads?.length || 0) + (replyLeads?.length || 0)
    if (total > 0) {
      console.log(`[scheduler] Backfilled ${total} legacy pause(s) to pending_step`)
    }
  } catch (err) {
    console.error('[scheduler] backfillLegacyPendingSteps error:', err.message)
  }
}

// Recover any lead whose pending_step deadline has passed (wait elapsed, or
// a reply timeout with no reply received) — backstop for a setTimeout lost
// to a server restart, or a missed/undelivered reply webhook.
async function resumePendingSteps() {
  if (!supabase) return
  try {
    const { data: leads } = await supabase
      .from('campaign_leads')
      .select('provider_id, campaign_id, pending_step')
      .not('pending_step', 'is', null)

    const now = new Date().toISOString()
    const due = (leads || []).filter(l => l.pending_step?.deadline && l.pending_step.deadline <= now)
    if (!due.length) return
    console.log(`[scheduler] Recovering ${due.length} pending step(s)`)

    for (const lead of due) {
      const outcome = lead.pending_step.kind === 'reply' ? 'timeout' : null
      resumeFromPendingStep(lead.provider_id, lead.campaign_id, outcome)
        .catch(err => console.error(`[scheduler] pending-step resume error:`, err.message))
    }
  } catch (err) {
    console.error('[scheduler] resumePendingSteps error:', err.message)
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
        if (conv.prospectId && conv.campaignId) {
          resumeReplyBranch(conv.prospectId, conv.campaignId, 'replied')
            .catch(err => console.error(`[sync-ai-convs] resumeReplyBranch error:`, err.message))
        }
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
  setTimeout(backfillLegacyPendingSteps, 20 * 1000)
  setTimeout(processActiveCampaigns, 30 * 1000)
  setTimeout(resumePendingSteps, 35 * 1000)
  setTimeout(syncAIConversations, 60 * 1000) // first check 1 min after startup
  setInterval(backfillLegacyPendingSteps, intervalMs)
  setInterval(processActiveCampaigns, intervalMs)
  setInterval(resumePendingSteps, intervalMs)
  setInterval(syncAIConversations, aiSyncIntervalMs)

  console.log(`[scheduler] AI conversation sync every ${Math.round(aiSyncIntervalMs / 60000)} min`)
}
