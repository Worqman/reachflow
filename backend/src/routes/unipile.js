import { Router } from 'express'
import { accounts, chats, linkedin, relations, isConfigured } from '../services/unipile.js'
import { supabase } from '../services/supabase.js'
import { logSend, getDailyUsage } from '../services/usageLog.js'
import {
  getAccountSafety,
  checkAccountSendAllowed,
  getEffectiveLimits,
  DEFAULT_SAFETY_SETTINGS,
} from '../services/accountSafety.js'
import { withAccountLock } from '../services/accountLock.js'

function wsId(req) { return req.workspaceId || 'ws_default' }

// In-memory snapshot: workspaceId → Set of account IDs that existed BEFORE the user went to Unipile
const preConnectSnapshot = new Map()

// Extract name from a Unipile user/attendee object — tries every known field shape
function extractName(obj) {
  if (!obj) return null
  // Try nested user/author objects first (reactions/comments wrap the person)
  const inner = obj.user || obj.author || obj
  return (
    inner.name ||
    inner.display_name ||
    inner.displayName ||
    inner.full_name ||
    inner.fullName ||
    [inner.first_name || inner.firstName, inner.last_name || inner.lastName]
      .filter(Boolean).join(' ') ||
    inner.public_identifier || // LinkedIn slug as last resort
    null
  )
}

// Extract the actual company name from a Unipile user/attendee object — never the
// headline/occupation string, which is a free-text description (e.g. "Helping SaaS
// teams scale outbound") and must not be shown where a company name is expected.
function extractCompany(obj) {
  if (!obj) return null
  const inner = obj.user || obj.author || obj
  const pos = inner.current_positions?.[0]
  return pos?.company || inner.company_name || inner.company || inner.current_company || null
}

// Extract a display name from a Unipile attendee object (handles all known field shapes).
function extractAttendeeName(attendee) {
  if (!attendee) return null
  return (
    attendee.name ||
    attendee.display_name ||
    attendee.displayName ||
    attendee.full_name ||
    attendee.fullName ||
    [attendee.first_name || attendee.firstName, attendee.last_name || attendee.lastName]
      .filter(Boolean).join(' ') ||
    attendee.username ||
    attendee.public_identifier ||
    null
  )
}

// Extract names from the attendees[] array already present in the Unipile chat response.
// This costs zero extra API calls — the data is already in the chat list payload.
function extractNamesFromAttendees(chatList) {
  return chatList.map(chat => {
    if (chat._enrichedName && chat._enrichedCompany) return chat
    if (!chat.attendees?.length) return chat

    // For 1:1 chats find the attendee matching the known provider_id, else take first
    const attendee =
      chat.attendees.find(
        a => a.provider_id === chat.attendee_provider_id || a.id === chat.attendee_provider_id,
      ) || chat.attendees[0]

    if (chat._enrichedName) {
      const company = extractCompany(attendee)
      return company ? { ...chat, _enrichedCompany: company } : chat
    }

    const name = extractAttendeeName(attendee)
    if (!name) return chat

    const company = extractCompany(attendee)
    return {
      ...chat,
      _enrichedName: name,
      _enrichedHeadline: attendee.headline || attendee.occupation || attendee.job_title || '',
      ...(company && { _enrichedCompany: company }),
    }
  })
}

// In-memory profile name cache: provider_id → { name, headline, expiresAt }
const _profileCache = new Map()
const PROFILE_CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

// Layer 3: fetch names from Unipile's GET /users/{provider_id} for any still-unenriched chats.
// Results are cached for 6 hours so polls never re-fetch.
async function enrichWithProfileApi(chatList) {
  const unenriched = chatList.filter(c => c.attendee_provider_id && (!c._enrichedName || !c._enrichedCompany))
  if (!unenriched.length) return chatList

  const FAILURE_TTL = 60 * 60 * 1000 // cache failures for 1 hour to avoid repeated calls
  const now = Date.now()

  // Skip bogus placeholder IDs that will never resolve
  const isInvalidId = id =>
    !id || id === 'UNKNOWN' || id.startsWith('MEMBER_NOT_FOUND_')

  // Deduplicate by provider_id and skip already-cached / invalid IDs
  const seen = new Set()
  const toFetch = []
  for (const c of unenriched) {
    const pid = c.attendee_provider_id
    if (isInvalidId(pid) || seen.has(pid)) continue
    const hit = _profileCache.get(pid)
    if (hit && hit.expiresAt > now) continue
    seen.add(pid)
    toFetch.push(c)
  }

  // Batch fetch — cap at 20 concurrent to avoid rate-limiting
  const batch = toFetch.slice(0, 20)
  await Promise.allSettled(
    batch.map(async chat => {
      try {
        const profile = await linkedin.visitProfile(chat.account_id, chat.attendee_provider_id)
        const name = extractName(profile)
        _profileCache.set(chat.attendee_provider_id, {
          name: name || null,
          headline: profile.headline || profile.occupation || profile.job_title || '',
          company: extractCompany(profile) || null,
          picture: profile.profile_picture_url || profile.profile_picture_url_large || null,
          expiresAt: Date.now() + (name ? PROFILE_CACHE_TTL : FAILURE_TTL),
        })
      } catch {
        // Cache the failure so we don't retry until TTL expires
        _profileCache.set(chat.attendee_provider_id, { name: null, headline: '', company: null, expiresAt: Date.now() + FAILURE_TTL })
      }
    })
  )

  return chatList.map(chat => {
    if (chat._enrichedName && chat._enrichedCompany) return chat
    const hit = _profileCache.get(chat.attendee_provider_id)
    if (!hit || hit.expiresAt < Date.now()) return chat
    return {
      ...chat,
      ...(!chat._enrichedName && hit.name && { _enrichedName: hit.name }),
      ...(!chat._enrichedName && hit.headline && { _enrichedHeadline: hit.headline }),
      ...(!chat._enrichedCompany && hit.company && { _enrichedCompany: hit.company }),
      ...(hit.picture  && { _enrichedPicture: hit.picture }),
    }
  })
}

// Enrich a list of chats: look up names + companies from campaign_leads AND leads
// tables by provider_id. `company` is a real, separately-tracked column on both
// tables — it must never be backfilled from `title` (job title/headline), which
// is a free-text description, not the lead's company name.
async function enrichChats(chatList) {
  if (!supabase) return chatList

  // Collect all attendee provider IDs still missing a name and/or a company
  const pids = chatList
    .filter(c => c.attendee_provider_id && (!c._enrichedName || !c._enrichedCompany))
    .map(c => c.attendee_provider_id)

  if (!pids.length) return chatList

  const infoMap = {}

  // Query both tables in parallel
  const [campaignLeadsRes, leadsRes] = await Promise.all([
    supabase.from('campaign_leads').select('provider_id, name, title, company').in('provider_id', pids),
    supabase.from('leads').select('provider_id, name, title, company').in('provider_id', pids),
  ])

  for (const lead of [...(campaignLeadsRes.data || []), ...(leadsRes.data || [])]) {
    if (!lead.provider_id) continue
    const info = infoMap[lead.provider_id] || (infoMap[lead.provider_id] = {})
    if (lead.name && !info.name) info.name = lead.name
    if (lead.title && !info.headline) info.headline = lead.title
    if (lead.company && !info.company) info.company = lead.company
  }

  return chatList.map(chat => {
    const match = infoMap[chat.attendee_provider_id]
    if (!match) return chat
    return {
      ...chat,
      ...(!chat._enrichedName && match.name && { _enrichedName: match.name, _enrichedHeadline: match.headline || '' }),
      ...(!chat._enrichedCompany && match.company && { _enrichedCompany: match.company }),
    }
  })
}


const router = Router()

// Guard — 503 if Unipile env vars are missing
router.use((_req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({
      message: 'Unipile is not configured. Add UNIPILE_API_KEY and UNIPILE_DSN to .env',
    })
  }
  next()
})

// ── Accounts ──────────────────────────────────────────────────

// Attaches today's real send counts (connection requests + messages) to each
// account — counted from unipile_send_log, which every send call site logs to
// regardless of whether the send came from a campaign or a manual/standalone
// endpoint. Falls back to leaving accounts unchanged if usage lookup fails.
async function withUsage(items) {
  const ids = items.map(a => a.id).filter(Boolean)
  const usage = await getDailyUsage(ids)
  return items.map(a => ({
    ...a,
    daily_requests_used: usage[a.id]?.requests ?? 0,
    daily_messages_used: usage[a.id]?.messages ?? 0,
  }))
}

// Attaches each account's safety settings (paused + daily limits/active
// hours/delay/warm-up) so the LinkedIn Accounts page can render status and
// usage limits without a separate round trip per account. Falls back to
// defaults (paused: false, DEFAULT_SAFETY_SETTINGS) when there's no DB or
// the row/migration doesn't exist yet.
async function withSafety(items) {
  if (!supabase || !items.length) {
    return items.map(a => ({ paused: false, safety: DEFAULT_SAFETY_SETTINGS, ...a }))
  }
  const ids = items.map(a => a.id).filter(Boolean)
  const { data, error } = await supabase
    .from('workspace_linkedin_accounts')
    .select('unipile_account_id, paused, safety_settings')
    .in('unipile_account_id', ids)

  const byId = {}
  if (!error) {
    for (const row of data || []) {
      byId[row.unipile_account_id] = {
        paused: !!row.paused,
        safety: { ...DEFAULT_SAFETY_SETTINGS, ...(row.safety_settings || {}) },
      }
    }
  }
  return items.map(a => ({
    ...a,
    paused: byId[a.id]?.paused ?? false,
    safety: byId[a.id]?.safety ?? DEFAULT_SAFETY_SETTINGS,
  }))
}

// In-memory cache for the connected account's own LinkedIn profile picture:
// accountId → { picture, expiresAt }. Avoids re-fetching on every page load.
const _accountPictureCache = new Map()
const ACCOUNT_PICTURE_TTL = 24 * 60 * 60 * 1000 // 24 hours
const ACCOUNT_PICTURE_FAILURE_TTL = 60 * 60 * 1000 // retry failures after 1 hour

// Attaches the connected LinkedIn user's own profile picture to each account,
// fetched via their own provider_id (connection_params.im.id) and cached.
async function withPicture(items) {
  const now = Date.now()
  const toFetch = items.filter(a => {
    const providerId = a.connection_params?.im?.id
    if (!providerId) return false
    const hit = _accountPictureCache.get(a.id)
    return !hit || hit.expiresAt <= now
  })

  await Promise.allSettled(
    toFetch.map(async a => {
      const providerId = a.connection_params.im.id
      try {
        const profile = await linkedin.visitProfile(a.id, providerId)
        _accountPictureCache.set(a.id, {
          picture: profile.profile_picture_url || profile.profile_picture_url_large || null,
          expiresAt: now + ACCOUNT_PICTURE_TTL,
        })
      } catch {
        _accountPictureCache.set(a.id, { picture: null, expiresAt: now + ACCOUNT_PICTURE_FAILURE_TTL })
      }
    })
  )

  return items.map(a => ({
    ...a,
    picture_url: _accountPictureCache.get(a.id)?.picture || null,
  }))
}

// GET /api/unipile/accounts
// Returns only LinkedIn accounts associated with the current workspace.
router.get('/accounts', async (req, res) => {
  try {
    const ws = wsId(req)

    // Fetch all Unipile accounts first
    const data = await accounts.list()
    const all = data?.items || data?.accounts || data?.objects || data?.data || (Array.isArray(data) ? data : [])

    // No DB / dev mode — return everything
    if (!supabase || ws === 'ws_default') {
      return res.json({ items: await withSafety(await withPicture(await withUsage(all))), object: 'AccountList' })
    }

    // Fetch workspace account associations from DB
    const { data: rows, error: dbErr } = await supabase
      .from('workspace_linkedin_accounts')
      .select('unipile_account_id')
      .eq('workspace_id', ws)

    if (dbErr) {
      // Table likely not created yet — return all accounts so the UI isn't broken
      console.warn('[unipile/accounts] DB error (migration not run?):', dbErr.message)
      return res.json({ items: await withSafety(await withPicture(await withUsage(all))), object: 'AccountList' })
    }

    const knownIds = (rows || []).map(r => r.unipile_account_id)
    const filtered = all.filter(a => knownIds.includes(a.id))
    res.json({ items: await withSafety(await withPicture(await withUsage(filtered))), object: 'AccountList' })
  } catch (err) {
    console.error('[unipile/accounts] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// POST /api/unipile/accounts/connect
// Starts Unipile hosted-auth flow. Snapshots current account IDs first so sync
// can detect exactly which account is new when the user returns.
router.post('/accounts/connect', async (req, res) => {
  try {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const ws = wsId(req)

    // Snapshot current Unipile account IDs before the user leaves
    try {
      const existing = await accounts.list()
      const all = existing?.items || existing?.accounts || existing?.objects || existing?.data || (Array.isArray(existing) ? existing : [])
      preConnectSnapshot.set(ws, new Set(all.map(a => a.id)))
      console.log('[unipile/connect] snapshot for ws', ws, ':', preConnectSnapshot.get(ws).size, 'accounts')
    } catch {
      preConnectSnapshot.set(ws, new Set())
    }

    const returnTo = req.body.returnTo || '/settings'
    const data = await accounts.startHostedAuth({
      successRedirectUrl: `${frontendUrl}${returnTo}?unipile=connected`,
      failureRedirectUrl: `${frontendUrl}${returnTo}?unipile=failed`,
      notifyUrl: `${backendUrl}/api/webhooks/unipile`,
      name: ws,
    })
    res.json(data)
  } catch (err) {
    console.error('[unipile/connect] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// POST /api/unipile/accounts/sync
// Called after the hosted-auth redirect returns.
// Compares current Unipile accounts against the pre-connect snapshot to detect
// exactly which account was just added, then associates it with this workspace.
router.post('/accounts/sync', async (req, res) => {
  try {
    const ws = wsId(req)

    // Fetch current Unipile accounts
    const data = await accounts.list()
    console.log('[unipile/sync] raw response:', JSON.stringify(data).slice(0, 500))
    const all = data?.items || data?.accounts || data?.objects || data?.data || (Array.isArray(data) ? data : [])
    console.log('[unipile/sync] ws:', ws, '| accounts found:', all.length)

    if (!supabase || ws === 'ws_default') {
      return res.json({ items: all, synced: 0 })
    }

    // Accounts that existed before the user went to Unipile
    const snapshot = preConnectSnapshot.get(ws) || new Set()
    preConnectSnapshot.delete(ws) // consume the snapshot

    // Accounts already saved in DB for any workspace
    const { data: claimed, error: claimErr } = await supabase
      .from('workspace_linkedin_accounts')
      .select('unipile_account_id')

    if (claimErr) {
      console.warn('[unipile/sync] DB error:', claimErr.message)
      return res.json({ items: all, synced: 0 })
    }

    const claimedIds = new Set((claimed || []).map(r => r.unipile_account_id))

    // New account = not in pre-connect snapshot AND not already claimed by any workspace
    const newAccounts = all.filter(a => !snapshot.has(a.id) && !claimedIds.has(a.id))
    console.log('[unipile/sync] new accounts to claim:', newAccounts.map(a => a.id))

    if (newAccounts.length > 0) {
      const { error: insertErr } = await supabase.from('workspace_linkedin_accounts').insert(
        newAccounts.map(a => ({
          workspace_id:       ws,
          unipile_account_id: a.id,
          name:               extractName(a) || a.username || null,
        }))
      )
      if (insertErr) console.warn('[unipile/sync] Insert error:', insertErr.message)
    }

    // Return this workspace's full account list
    const { data: myRows } = await supabase
      .from('workspace_linkedin_accounts')
      .select('unipile_account_id')
      .eq('workspace_id', ws)
    const myIds = new Set((myRows || []).map(r => r.unipile_account_id))
    const myAccounts = all.filter(a => myIds.has(a.id))

    res.json({ items: myAccounts, synced: newAccounts.length })
  } catch (err) {
    console.error('[unipile/accounts/sync] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// DELETE /api/unipile/accounts/:id
// Disconnects from Unipile and removes the workspace association.
router.delete('/accounts/:id', async (req, res) => {
  try {
    const ws = wsId(req)

    // Verify this account belongs to the current workspace
    if (supabase && ws !== 'ws_default') {
      const { data: row } = await supabase
        .from('workspace_linkedin_accounts')
        .select('id')
        .eq('workspace_id', ws)
        .eq('unipile_account_id', req.params.id)
        .maybeSingle()
      if (!row) return res.status(403).json({ message: 'Account does not belong to this workspace' })

      // Remove workspace association
      await supabase
        .from('workspace_linkedin_accounts')
        .delete()
        .eq('unipile_account_id', req.params.id)
    }

    // Delete from Unipile
    const data = await accounts.delete(req.params.id)
    res.json(data)
  } catch (err) {
    console.error('[unipile/accounts/delete] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// Verifies the account belongs to the current workspace before any
// safety-settings read/write — same check DELETE /accounts/:id uses.
async function assertOwnsAccount(req, res) {
  const ws = wsId(req)
  if (!supabase || ws === 'ws_default') return true // dev mode — no workspace scoping
  const { data: row } = await supabase
    .from('workspace_linkedin_accounts')
    .select('id')
    .eq('workspace_id', ws)
    .eq('unipile_account_id', req.params.id)
    .maybeSingle()
  if (!row) {
    res.status(403).json({ message: 'Account does not belong to this workspace' })
    return false
  }
  return true
}

// GET /api/unipile/accounts/:id/safety
router.get('/accounts/:id/safety', async (req, res) => {
  try {
    if (!(await assertOwnsAccount(req, res))) return
    const safety = await getAccountSafety(req.params.id)
    const usage = await getDailyUsage([req.params.id])
    res.json({
      ...safety,
      effective: getEffectiveLimits(safety),
      usage: usage[req.params.id] || { requests: 0, messages: 0 },
    })
  } catch (err) {
    console.error('[unipile/accounts/safety/get] error:', err.status, err.message)
    res.status(err.status || 500).json({ message: err.message })
  }
})

// PATCH /api/unipile/accounts/:id/safety
// Body may include: paused, dailyConnectionLimit, dailyMessageLimit,
// activeDays, activeHours, timezone, sendingDelay, warmupMode.
// Merges over the account's existing safety_settings (partial update).
router.patch('/accounts/:id/safety', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ message: 'Supabase not configured' })
    if (!(await assertOwnsAccount(req, res))) return

    const { paused, ...settingsPatch } = req.body || {}
    const current = await getAccountSafety(req.params.id)
    const { paused: _currentPaused, ...currentSettings } = current
    const nextSettings = { ...currentSettings, ...settingsPatch }
    const nextPaused = typeof paused === 'boolean' ? paused : current.paused

    const { error } = await supabase
      .from('workspace_linkedin_accounts')
      .update({ paused: nextPaused, safety_settings: nextSettings })
      .eq('unipile_account_id', req.params.id)

    if (error) throw Object.assign(new Error(error.message), { status: 500 })

    res.json({ paused: nextPaused, ...nextSettings })
  } catch (err) {
    console.error('[unipile/accounts/safety/patch] error:', err.status, err.message)
    res.status(err.status || 500).json({ message: err.message })
  }
})

// ── Chats ─────────────────────────────────────────────────────

// GET /api/unipile/chats?account_id=...&limit=...&cursor=...
router.get('/chats', async (req, res) => {
  try {
    const { account_id, limit, cursor } = req.query
    const data = await chats.list({
      accountId: account_id,
      limit: limit ? Number(limit) : 30,
      cursor,
    })

    const items = data?.items || data?.objects || []

    // Layer 1: extract names from attendees[] if present (free — data already in response)
    const withAttendeeNames = extractNamesFromAttendees(items)

    // Layer 2: fill remaining gaps from campaign_leads + leads DB tables
    const afterDb = withAttendeeNames.some(c => c.attendee_provider_id && (!c._enrichedName || !c._enrichedCompany))
      ? await enrichChats(withAttendeeNames)
      : withAttendeeNames

    // Layer 3: for any still-unenriched chats, fetch profile from Unipile API (cached 6h)
    const enrichedItems = await enrichWithProfileApi(afterDb)

    res.json({ ...data, items: enrichedItems })
  } catch (err) {
    console.error('[unipile/chats] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// GET /api/unipile/chats/:chatId/messages
router.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const { limit, cursor } = req.query
    const data = await chats.getMessages(req.params.chatId, {
      limit: limit ? Number(limit) : 50,
      cursor,
    })
    res.json(data)
  } catch (err) {
    console.error('[unipile/chats/messages] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// POST /api/unipile/chats/:chatId/messages
router.post('/chats/:chatId/messages', async (req, res) => {
  try {
    const { text, accountId } = req.body
    if (!text) return res.status(400).json({ message: 'text required' })
    // Locked so this manual send can't race a queued campaign send on the
    // same account past the account's daily message limit.
    const data = accountId
      ? await withAccountLock(accountId, async () => {
          const acctCheck = await checkAccountSendAllowed(accountId, 'message')
          if (acctCheck.allowed === false) {
            const err = new Error(acctCheck.reason)
            err.status = 429
            throw err
          }
          const result = await chats.sendMessage(req.params.chatId, text)
          logSend(accountId, 'message')
          return result
        })
      : await chats.sendMessage(req.params.chatId, text)
    res.json(data)
  } catch (err) {
    console.error('[unipile/chats/send] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// ── Outreach ──────────────────────────────────────────────────

// POST /api/unipile/invite  — send a LinkedIn connection request
router.post('/invite', async (req, res) => {
  try {
    const { accountId, linkedinUrl, providerUserId, message } = req.body
    if (!accountId) return res.status(400).json({ message: 'accountId required' })

    let pid = providerUserId
    // Resolve provider_id from URL if not provided
    if (!pid && linkedinUrl) {
      const slug = linkedinUrl.split('/in/')[1]?.replace(/\/$/, '') || linkedinUrl
      const profile = await linkedin.getProfileByUrl(accountId, slug)
      pid = profile?.provider_id || profile?.id
    }
    if (!pid) return res.status(400).json({ message: 'Could not resolve providerUserId from linkedinUrl' })

    // Locked so this manual send can't race a queued campaign send on the
    // same account past the account's daily connection-request limit.
    const data = await withAccountLock(accountId, async () => {
      const acctCheck = await checkAccountSendAllowed(accountId, 'connection_request')
      if (!acctCheck.allowed) {
        const err = new Error(acctCheck.reason)
        err.status = 429
        throw err
      }
      const result = await linkedin.sendInvite({ accountId, providerUserId: pid, message })
      logSend(accountId, 'connection_request')
      return result
    })
    res.json(data)
  } catch (err) {
    console.error('[unipile/invite] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// ── Lead Finder ───────────────────────────────────────────────

// Extracts the LinkedIn username slug from a profile URL.
// e.g. https://www.linkedin.com/in/lorikramaa/ → lorikramaa
function extractLinkedInSlug(input) {
  // Already just a slug (no slashes or protocol)
  if (!input.includes('/') && !input.includes(':')) return input.trim()
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`)
    // /in/slug or /pub/slug
    const match = url.pathname.match(/^\/(?:in|pub)\/([^/]+)/)
    if (match) return match[1]
  } catch {
    // fallback: grab last non-empty path segment
    const parts = input.replace(/\/$/, '').split('/')
    return parts[parts.length - 1]
  }
  return input.trim()
}

// GET /api/unipile/linkedin/profile?account_id=...&linkedin_url=...
// Returns a single LinkedIn profile. Accepts full URL or just username slug.
router.get('/linkedin/profile', async (req, res) => {
  try {
    const { account_id, linkedin_url } = req.query
    if (!account_id) return res.status(400).json({ message: 'account_id required' })
    if (!linkedin_url) return res.status(400).json({ message: 'linkedin_url required' })

    const slug = extractLinkedInSlug(linkedin_url)
    const data = await linkedin.getProfileByUrl(account_id, slug)
    res.json(data)
  } catch (err) {
    console.error('[unipile/linkedin/profile] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// Extracts the numeric activity ID from a LinkedIn post URL.
// Handles formats like:
//   https://www.linkedin.com/posts/user_activity-7332661864792854528-hcGT
//   https://www.linkedin.com/feed/update/urn:li:activity:7332661864792854528
function extractPostId(url) {
  // urn:li:activity:DIGITS or activity-DIGITS
  const match = url.match(/activity[:\-](\d{10,})/)
  if (match) return match[1]
  // ugcPost or share URNs
  const ugc = url.match(/ugcPost[:\-](\d{10,})/)
  if (ugc) return ugc[1]
  // fallback: last long numeric sequence
  const nums = url.match(/(\d{15,})/)
  return nums ? nums[1] : null
}

// GET /api/unipile/post-engagers?account_id=...&post_url=...&type=likers|comments
// Returns people who liked or commented on a LinkedIn post.
// Workflow: extract numeric ID → fetch post to get social_id → fetch reactions/comments
router.get('/post-engagers', async (req, res) => {
  try {
    const { account_id, post_url, type = 'likers' } = req.query
    if (!account_id) return res.status(400).json({ message: 'account_id required' })
    if (!post_url) return res.status(400).json({ message: 'post_url required' })

    // Step 1: extract post ID from URL
    const rawPostId = extractPostId(post_url)
    if (!rawPostId) {
      return res.status(400).json({
        message: 'Could not extract post ID from URL. Make sure it is a valid LinkedIn post URL.',
      })
    }

    // Step 2: fetch the post to get the reliable social_id
    let postId = rawPostId
    try {
      const post = await linkedin.getPost(account_id, rawPostId)
      postId = post?.social_id || post?.id || rawPostId
    } catch {
      // If post lookup fails, try using the raw ID directly
    }

    // Step 3: fetch reactions or comments using postId
    const data = type === 'comments'
      ? await linkedin.getPostComments(account_id, postId)
      : await linkedin.getPostReactions(account_id, postId)

    res.json(data)
  } catch (err) {
    console.error('[unipile/post-engagers] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

// Company size letter codes used by LinkedIn's faceted search URL
const LINKEDIN_SIZE_CODES = {
  '1–10': 'A', '11–50': 'B', '51–200': 'C', '201–500': 'D',
  '501–1000': 'E', '1001–5000': 'F', '5001+': 'G',
}

// Seniority level IDs used by LinkedIn's faceted search URL
const LINKEDIN_SENIORITY_CODES = {
  'Owner': [10], 'C-Suite': [8, 9], 'VP / Director': [6, 7],
  'Manager': [5], 'Senior IC': [4, 5], 'IC': [3],
}

// POST /api/unipile/linkedin/search
// Body: { account_id, url?, keywords?, title?, location_text?, industry?, industry_id?, seniority?, company_sizes?, cursor? }
router.post('/linkedin/search', async (req, res) => {
  const {
    account_id, url,
    keywords, title,
    location_text, location: locationAlt,
    industry, industry_id, seniority, company_sizes,
    cursor,
  } = req.body
  if (!account_id) return res.status(400).json({ message: 'account_id required' })

  try {
    // Direct LinkedIn URL provided — use it as-is (user pasted their own URL)
    if (url) {
      const data = await linkedin.searchPeople(account_id, { url, cursor })
      const items = data?.items || []
      return res.json({ items, cursor: data?.cursor, source: 'linkedin_search' })
    }

    // Build a LinkedIn people search URL from filter params
    const loc = location_text || locationAlt || ''

    // Resolve location text → LinkedIn geoUrn IDs
    let locationIds = []
    if (loc) {
      try {
        const locData = await linkedin.resolveLocation(account_id, loc)
        locationIds = (locData?.items || []).slice(0, 3).map(l => Number(l.id)).filter(Boolean)
        console.log('[linkedin/search] resolved location', JSON.stringify(loc), '→', locationIds)
      } catch {
        console.log('[linkedin/search] location resolution failed, continuing without location filter')
      }
    }

    // Keywords: job title + any free-text keywords (industry now handled via facetIndustry)
    const keywordParts = [title || keywords].filter(Boolean)
    const allKeywords = keywordParts.join(' ').trim()

    const urlParams = new URLSearchParams()
    if (allKeywords) urlParams.set('keywords', allKeywords)
    urlParams.set('origin', 'FACETED_SEARCH')

    // geoUrn: JSON array of LinkedIn location IDs as strings
    if (locationIds.length) {
      urlParams.set('geoUrn', JSON.stringify(locationIds.map(String)))
    }

    // Industry — use numeric ID if available (more accurate), else fall back to text keyword
    if (industry_id) {
      urlParams.set('facetIndustry', JSON.stringify([String(industry_id)]))
    } else if (industry) {
      // Legacy text fallback: append to keywords
      const withIndustry = [allKeywords, industry].filter(Boolean).join(' ')
      if (withIndustry) urlParams.set('keywords', withIndustry)
    }

    // Company sizes
    const sizeCodes = (company_sizes || []).map(s => LINKEDIN_SIZE_CODES[s]).filter(Boolean)
    if (sizeCodes.length) urlParams.set('facetCompanySize', JSON.stringify(sizeCodes))

    // Seniority
    const seniorityCodes = [...new Set((seniority || []).flatMap(s => LINKEDIN_SENIORITY_CODES[s] || []))]
    if (seniorityCodes.length) urlParams.set('facetSeniority', JSON.stringify(seniorityCodes.map(String)))

    const searchUrl = `https://www.linkedin.com/search/results/people/?${urlParams.toString()}`
    console.log('[linkedin/search] built URL:', searchUrl)

    const data = await linkedin.searchPeople(account_id, { url: searchUrl, cursor })
    const items = data?.items || []
    console.log('[linkedin/search] results:', items.length)
    if (items[0]) console.log('[linkedin/search] first item:', JSON.stringify(items[0]).slice(0, 300))
    return res.json({ items, cursor: data?.cursor, source: 'linkedin_search' })
  } catch (err) {
    console.error('[linkedin/search] error status:', err.status)
    console.error('[linkedin/search] error message:', err.message)
    console.error('[linkedin/search] error data:', JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message, detail: err.data })
  }
})

// POST /api/unipile/message  — send a LinkedIn message to a user
router.post('/message', async (req, res) => {
  try {
    const { accountId, linkedinUrl, providerUserId, text } = req.body
    if (!accountId) return res.status(400).json({ message: 'accountId required' })
    if (!linkedinUrl && !providerUserId)
      return res.status(400).json({ message: 'linkedinUrl or providerUserId required' })
    if (!text) return res.status(400).json({ message: 'text required' })

    // Locked so this manual send can't race a queued campaign send on the
    // same account past the account's daily message limit.
    const data = await withAccountLock(accountId, async () => {
      const acctCheck = await checkAccountSendAllowed(accountId, 'message')
      if (!acctCheck.allowed) {
        const err = new Error(acctCheck.reason)
        err.status = 429
        throw err
      }
      const result = await linkedin.sendMessage({ accountId, linkedinUrl, providerUserId, text })
      logSend(accountId, 'message')
      return result
    })
    res.json(data)
  } catch (err) {
    console.error('[unipile/message] error:', err.status, err.message, JSON.stringify(err.data || {}))
    res.status(err.status || 500).json({ message: err.message })
  }
})

export default router
