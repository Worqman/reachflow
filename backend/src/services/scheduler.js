import { supabase } from './supabase.js'
import { syncCampaignStatuses, executePostConnectionSteps, runCampaignInvites } from '../routes/campaigns.js'

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

// Run every hour by default; override with SCHEDULER_INTERVAL_MS env var
export function startScheduler() {
  const intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS || '') || 60 * 60 * 1000

  console.log(`[scheduler] Starting — checking active campaigns every ${Math.round(intervalMs / 60000)} min`)

  // Run once shortly after startup, then on interval
  setTimeout(processActiveCampaigns, 30 * 1000)
  setTimeout(resumePendingWaits, 35 * 1000) // recover any wait nodes that survived restart
  setInterval(processActiveCampaigns, intervalMs)
  setInterval(resumePendingWaits, intervalMs) // also check on each scheduler tick
}
