// ── Campaign schedule enforcement ────────────────────────────────
// Shared by campaigns.js and conversations.js. Daily action-frequency limits
// used to live here as an in-memory counter, but that reset on every backend
// restart/redeploy and wasn't shared across multiple backend processes —
// each reset silently granted a fresh daily budget. All seven frequency
// limits (connection requests, messages, inmails, AI comments, likes,
// profile visits, follows) are now enforced against the persisted
// unipile_send_log table instead — see withinDailyLimit in usageLog.js.

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
