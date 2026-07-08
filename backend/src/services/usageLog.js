// ── Unipile send usage log ──────────────────────────────────────
// Records every connection-request / message send against a LinkedIn
// account, regardless of whether it came from a campaign sequence or a
// standalone manual send — so account-level daily usage (LinkedIn Accounts
// page) reflects everything sent through Unipile, not just campaign activity.
import { supabase } from './supabase.js'

// Fire-and-forget — a logging failure must never break the send it's tracking.
export function logSend(accountId, actionType) {
  if (!supabase || !accountId) return
  supabase
    .from('unipile_send_log')
    .insert({ account_id: accountId, action_type: actionType })
    .then(({ error }) => {
      if (error) console.warn('[usageLog] insert failed (migration not run?):', error.message)
    })
}

// Returns { [accountId]: { requests, messages } } counts for today (UTC) across all given account IDs.
export async function getDailyUsage(accountIds) {
  const usage = {}
  for (const id of accountIds) usage[id] = { requests: 0, messages: 0 }
  if (!supabase || !accountIds.length) return usage

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('unipile_send_log')
    .select('account_id, action_type')
    .in('account_id', accountIds)
    .gte('created_at', startOfDay.toISOString())

  if (error) {
    console.warn('[usageLog] query failed (migration not run?):', error.message)
    return usage
  }

  for (const row of data || []) {
    if (!usage[row.account_id]) usage[row.account_id] = { requests: 0, messages: 0 }
    if (row.action_type === 'connection_request') usage[row.account_id].requests++
    else if (row.action_type === 'message') usage[row.account_id].messages++
  }
  return usage
}
