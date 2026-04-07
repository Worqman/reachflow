// ── Campaign schedule & frequency enforcement ──────────────────
// Shared by campaigns.js and conversations.js.

// ── In-memory daily action counters ────────────────────────────
// Key: `${campaignId}:${actionType}:YYYY-MM-DD`
// Resets naturally as the date changes; cleared on server restart (acceptable).
const _dailyCounters = new Map()

function _dailyKey(campaignId, actionType) {
  return `${campaignId}:${actionType}:${new Date().toISOString().slice(0, 10)}`
}

export function getDailyCount(campaignId, actionType) {
  return _dailyCounters.get(_dailyKey(campaignId, actionType)) || 0
}

// Returns true and increments if under limit; false if at/over limit.
// limit = 0 or undefined → no enforcement, just count.
export function consumeDailyLimit(campaignId, actionType, limit) {
  const key = _dailyKey(campaignId, actionType)
  const current = _dailyCounters.get(key) || 0
  if (limit && limit > 0 && current >= limit) return false
  _dailyCounters.set(key, current + 1)
  return true
}

// ── Schedule enforcement ────────────────────────────────────────
// schedule: [{ day: "Monday", enabled: bool, start: "08:00", end: "18:00" }, ...]
// timezone: IANA timezone string e.g. "Europe/London"
export function isWithinSchedule(schedule, timezone) {
  if (!schedule?.length) return true // no schedule → always active

  const tz  = timezone || 'UTC'
  const now = new Date()

  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now)

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const hh = timeParts.find(p => p.type === 'hour')?.value   || '00'
  const mm = timeParts.find(p => p.type === 'minute')?.value || '00'
  const currentHHMM = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`

  const dayEntry = schedule.find(d => d.day === dayName)
  if (!dayEntry || !dayEntry.enabled) return false

  return currentHHMM >= dayEntry.start && currentHHMM <= dayEntry.end
}
