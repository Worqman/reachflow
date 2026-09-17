// ── Workspace credit balance ────────────────────────────────────
// Every outbound LinkedIn send debits credits from the owning workspace
// (see the deductCredits() calls in routes/campaigns.js, alongside the
// existing logSend() calls in usageLog.js). Deduction/grant go through the
// deduct_workspace_credits / grant_workspace_credits Postgres functions
// (migrations/credits.sql) so concurrent sends across accounts in the same
// workspace can't race each other into an inconsistent balance the way a
// read-then-write from here would.
import { supabase } from './supabase.js'

// Credit cost per send action — keyed the same as unipile_send_log's
// action_type (see usageLog.js). Actions with no direct reply potential
// (profile visits, likes, follows) are free; sends that put a message in
// front of a person cost credits.
const ACTION_COSTS = {
  connection_request: 1,
  message: 1,
  inmail: 2,
  comment_post: 1,
  profile_visit: 0,
  like_post: 0,
  follow: 0,
}

export function costFor(actionType) {
  return ACTION_COSTS[actionType] ?? 0
}

export async function getBalance(workspaceId) {
  if (!supabase || !workspaceId) return 0
  const { data, error } = await supabase
    .from('workspace_credits')
    .select('balance')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) {
    console.warn('[credits] getBalance failed (migration not run?):', error.message)
    return 0
  }
  // No row yet means the workspace hasn't sent anything — it still gets the
  // same starting balance the DB functions would create on first debit/grant.
  return data ? data.balance : 100
}

// Checked before a send so a depleted workspace skips cleanly (same
// "skipped" branch as a daily-limit hit) instead of sending for free.
export async function hasCredits(workspaceId, amount) {
  if (!amount) return true
  if (!supabase || !workspaceId) return true // credits not configured — don't block sends
  return (await getBalance(workspaceId)) >= amount
}

// Must be awaited by the caller (unlike the fire-and-forget logSend) — an
// undercounted deduction would let sending continue past a zero balance.
export async function deductCredits(workspaceId, amount, reason, { campaignId, leadId } = {}) {
  if (!amount || !supabase || !workspaceId) return null
  const { data, error } = await supabase.rpc('deduct_workspace_credits', {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
    p_campaign_id: campaignId || null,
    p_lead_id: leadId || null,
  })
  if (error) {
    console.warn('[credits] deductCredits failed (migration not run?):', error.message)
    return null
  }
  return data
}

export async function grantCredits(workspaceId, amount, reason = 'manual_grant') {
  if (!amount || !supabase || !workspaceId) return null
  const { data, error } = await supabase.rpc('grant_workspace_credits', {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
  })
  if (error) {
    console.warn('[credits] grantCredits failed (migration not run?):', error.message)
    return null
  }
  return data
}

export async function listTransactions(workspaceId, limit = 50) {
  if (!supabase || !workspaceId) return []
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id, amount, balance_after, reason, campaign_id, lead_id, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[credits] listTransactions failed (migration not run?):', error.message)
    return []
  }
  return data || []
}
