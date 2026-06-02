import { supabase } from './supabase.js'
import { syncCampaignStatuses } from '../routes/campaigns.js'

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
  }
}

// Run every hour by default; override with SCHEDULER_INTERVAL_MS env var
export function startScheduler() {
  const intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS || '') || 60 * 60 * 1000

  console.log(`[scheduler] Starting — checking active campaigns every ${Math.round(intervalMs / 60000)} min`)

  // Run once shortly after startup, then on interval
  setTimeout(processActiveCampaigns, 30 * 1000)
  setInterval(processActiveCampaigns, intervalMs)
}
