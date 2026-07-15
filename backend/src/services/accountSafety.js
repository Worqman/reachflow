// ── LinkedIn account sending safety ──────────────────────────────
// Per-account (not per-campaign) sending guardrails: daily connection
// request / message caps, active sending hours + days, a delay range
// between sends, warm-up mode for new accounts, and a manual pause
// switch. Stored on workspace_linkedin_accounts (paused, safety_settings).
// Consumed by campaigns.js (sequence execution) and unipile.js (manual
// invite/message sends) so every outbound action — campaign or manual —
// respects the same account-level limits.
import { supabase } from './supabase.js'
import { isWithinSchedule } from './limits.js'
import { getDailyUsage } from './usageLog.js'

export const DEFAULT_SAFETY_SETTINGS = {
  dailyConnectionLimit: 20,
  dailyMessageLimit: 40,
  activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  activeHours: { start: '08:00', end: '18:00' },
  timezone: 'UTC',
  sendingDelay: { min: 15, max: 20 },
  warmupMode: false,
}

// Conservative caps applied on top of (never above) the account's own
// configured limits while warmupMode is on — for new/recently-restricted
// accounts. Mirrors the "warmup" sending-delay preset already used by
// campaigns (backend/src/routes/campaigns.js SENDING_DELAY_PRESETS).
const WARMUP_CAPS = { dailyConnectionLimit: 5, dailyMessageLimit: 10 }
const WARMUP_DELAY = { min: 30, max: 60 }

// Fetches { paused, ...safety_settings } for one Unipile account, merged
// over the defaults. Falls back to defaults (no persistence) when there's
// no DB configured or the row/migration doesn't exist yet — same fallback
// pattern used throughout unipile.js for this table.
export async function getAccountSafety(accountId) {
  if (!supabase || !accountId) return { paused: false, ...DEFAULT_SAFETY_SETTINGS }

  const { data, error } = await supabase
    .from('workspace_linkedin_accounts')
    .select('paused, safety_settings')
    .eq('unipile_account_id', accountId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.warn('[accountSafety] lookup failed (migration not run?):', error.message)
    return { paused: false, ...DEFAULT_SAFETY_SETTINGS }
  }

  return {
    paused: !!data.paused,
    ...DEFAULT_SAFETY_SETTINGS,
    ...(data.safety_settings || {}),
  }
}

// Applies the warm-up override (if enabled) on top of the account's own
// configured limits/delay — warm-up only ever tightens, never loosens.
export function getEffectiveLimits(safety) {
  const dailyConnectionLimit = safety.dailyConnectionLimit ?? DEFAULT_SAFETY_SETTINGS.dailyConnectionLimit
  const dailyMessageLimit = safety.dailyMessageLimit ?? DEFAULT_SAFETY_SETTINGS.dailyMessageLimit
  const delay = safety.sendingDelay || DEFAULT_SAFETY_SETTINGS.sendingDelay

  if (!safety.warmupMode) {
    return { dailyConnectionLimit, dailyMessageLimit, delayMin: delay.min, delayMax: delay.max }
  }
  return {
    dailyConnectionLimit: Math.min(dailyConnectionLimit, WARMUP_CAPS.dailyConnectionLimit),
    dailyMessageLimit: Math.min(dailyMessageLimit, WARMUP_CAPS.dailyMessageLimit),
    delayMin: WARMUP_DELAY.min,
    delayMax: WARMUP_DELAY.max,
  }
}

// Reuses the campaign schedule checker (limits.js) by expressing the
// account's activeDays/activeHours as the same [{day, enabled, start, end}]
// shape — days not in activeDays are simply absent, which isWithinSchedule
// already treats as "not active that day".
function toScheduleArray(safety) {
  const days = safety.activeDays?.length ? safety.activeDays : DEFAULT_SAFETY_SETTINGS.activeDays
  const hours = safety.activeHours || DEFAULT_SAFETY_SETTINGS.activeHours
  return days.map(day => ({ day, enabled: true, start: hours.start, end: hours.end }))
}

export function isAccountWithinActiveHours(safety) {
  return isWithinSchedule(toScheduleArray(safety), safety.timezone || DEFAULT_SAFETY_SETTINGS.timezone)
}

// Pause + active-hours gate only — cheap, no daily-count query. Used to
// gate actions (profile visits, likes, follows, comments) that don't have
// their own account-level daily cap but should still stop while paused or
// outside active hours.
function evaluateGate(safety) {
  if (safety.paused) return { allowed: false, reason: 'LinkedIn account sending is paused' }
  if (!isAccountWithinActiveHours(safety)) return { allowed: false, reason: 'Outside account active sending hours' }
  return { allowed: true, reason: null }
}

export async function checkAccountAvailable(accountId) {
  const safety = await getAccountSafety(accountId)
  return { ...evaluateGate(safety), safety }
}

// Full gate: pause + active hours + the account's own daily cap for
// connection requests or messages (messages and inmails share one budget,
// matching how getDailyUsage/the LinkedIn Accounts page already combine them).
export async function checkAccountSendAllowed(accountId, kind /* 'connection_request' | 'message' */) {
  const safety = await getAccountSafety(accountId)
  const gate = evaluateGate(safety)
  if (!gate.allowed) return { ...gate, safety }

  const limits = getEffectiveLimits(safety)
  const usage = await getDailyUsage([accountId])
  const used = kind === 'connection_request' ? (usage[accountId]?.requests || 0) : (usage[accountId]?.messages || 0)
  const limit = kind === 'connection_request' ? limits.dailyConnectionLimit : limits.dailyMessageLimit

  if (limit && used >= limit) {
    const label = kind === 'connection_request' ? 'connection request' : 'message'
    return { allowed: false, reason: `Account daily ${label} limit of ${limit} reached`, safety, limits }
  }
  return { allowed: true, reason: null, safety, limits }
}
