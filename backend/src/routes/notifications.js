import { Router } from 'express'
import { supabase } from '../services/supabase.js'

const router = Router()

// Source of truth for what's toggleable — the frontend renders whatever
// this list returns rather than hardcoding it, so adding an event here is
// enough to surface a new switch. Nothing sends an email/push for these yet
// (Notifications tab is preference storage only) — enabled just means "this
// event should notify" for whenever delivery is wired up.
const NOTIFICATION_EVENTS = [
  { key: 'new_reply',           label: 'New reply',            description: 'A lead replies to an outreach message' },
  { key: 'meeting_booked',      label: 'Meeting booked',       description: 'A lead books a meeting' },
  { key: 'campaign_paused',     label: 'Campaign paused',      description: 'A campaign auto-pauses (e.g. account issue)' },
  { key: 'account_disconnected', label: 'Account disconnected', description: 'A connected LinkedIn account needs re-authentication' },
  { key: 'campaign_completed',  label: 'Campaign completed',   description: 'A campaign finishes running its sequence' },
  { key: 'low_credits',         label: 'Low credit balance',   description: 'Workspace credit balance drops below a low threshold' },
  { key: 'weekly_summary',      label: 'Weekly summary',       description: 'A weekly digest of campaign performance' },
]
const DEFAULT_ENABLED = true

function userId(req) { return req.user?.id }

async function loadPreferences(uid) {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('preferences')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) {
    console.warn('[notifications] load failed (migration not run?):', error.message)
    return {}
  }
  return data?.preferences || {}
}

function mergeEvents(stored) {
  return NOTIFICATION_EVENTS.map(e => ({
    ...e,
    enabled: e.key in stored ? !!stored[e.key] : DEFAULT_ENABLED,
  }))
}

// GET /api/notifications — this user's toggle list (defaults applied for anything unset)
router.get('/', async (req, res) => {
  const uid = userId(req)
  if (!uid) return res.status(401).json({ message: 'Unauthorized' })
  try {
    const stored = await loadPreferences(uid)
    res.json({ events: mergeEvents(stored) })
  } catch (err) {
    console.error('[notifications]', err)
    res.status(500).json({ message: err.message })
  }
})

// PUT /api/notifications — body: { key, enabled }. Upserts a single toggle
// (rather than requiring the full set on every save) so the UI can flip one
// switch at a time.
router.put('/', async (req, res) => {
  const uid = userId(req)
  if (!uid) return res.status(401).json({ message: 'Unauthorized' })
  if (!supabase) return res.status(503).json({ message: 'Supabase not configured' })

  const { key, enabled } = req.body || {}
  if (!NOTIFICATION_EVENTS.some(e => e.key === key)) {
    return res.status(400).json({ message: `Unknown notification key: ${key}` })
  }
  try {
    const stored = await loadPreferences(uid)
    const next = { ...stored, [key]: !!enabled }
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: uid, preferences: next }, { onConflict: 'user_id' })
    if (error) throw error
    res.json({ events: mergeEvents(next) })
  } catch (err) {
    console.error('[notifications]', err)
    res.status(500).json({ message: err.message })
  }
})

export default router
