// ── Per-lead activity timeline ────────────────────────────────────
// Records every notable event on a campaign lead (profile visits, invites,
// messages, connection/reply events, manual lead-status changes) so the
// leads table can show a real activity history per row.
import { supabase } from './supabase.js'

// Fire-and-forget — a logging failure must never break the action it's tracking.
export function logLeadActivity(campaignId, leadId, action, detail = null) {
  if (!supabase || !campaignId || !leadId) return
  supabase
    .from('campaign_lead_activity')
    .insert({ campaign_id: campaignId, lead_id: leadId, action, detail })
    .then(({ error }) => {
      if (error) console.warn('[leadActivity] insert failed (migration not run?):', error.message)
    })
}

export async function getLeadActivity(leadId) {
  if (!supabase || !leadId) return []
  const { data, error } = await supabase
    .from('campaign_lead_activity')
    .select('id, action, detail, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[leadActivity] query failed (migration not run?):', error.message)
    return []
  }
  return data || []
}
