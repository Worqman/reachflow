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
// `messages` combines 'message' and 'inmail' — this feeds the LinkedIn
// Accounts page's single "Daily Messages Usage" figure, which doesn't
// distinguish the two. For per-type enforcement (the campaign sequence's
// individual frequency limits) use getDailyActionCount instead.
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
    else if (row.action_type === 'message' || row.action_type === 'inmail') usage[row.account_id].messages++
  }
  return usage
}

// Returns the count of one specific action_type for one account since the
// start of today (UTC). Used by the campaign sequence executor for real-time
// per-node-type limit checks — unlike the in-memory counters in limits.js,
// this survives backend restarts and is consistent across multiple backend
// processes, since every process reads the same Supabase table.
export async function getDailyActionCount(accountId, actionType) {
  if (!supabase || !accountId) return 0
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('unipile_send_log')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('action_type', actionType)
    .gte('created_at', startOfDay.toISOString())

  if (error) {
    console.warn('[usageLog] getDailyActionCount failed (migration not run?):', error.message)
    return 0
  }
  return count || 0
}

// Checks a frequency limit against the persisted send log rather than the
// in-memory counters in services/limits.js — those reset on every backend
// restart/redeploy and aren't shared across multiple backend processes,
// silently granting a fresh daily budget on every reset. limit falsy/0 means
// unlimited. The actual "increment" is just logSend() being called after the
// action succeeds — there's no separate counter to bump. Shared by the
// campaign sequence executor (campaigns.js) and the AI-reply path
// (conversations.js), since both draw against the same per-account 'message'
// budget.
export async function withinDailyLimit(accountId, actionType, limit) {
  if (!limit || limit <= 0) return true
  return (await getDailyActionCount(accountId, actionType)) < limit
}
