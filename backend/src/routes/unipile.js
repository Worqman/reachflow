import { Router } from 'express'
import { accounts, chats, linkedin, relations, isConfigured } from '../services/unipile.js'
import { supabase } from '../services/supabase.js'

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

// Enrich a list of chats: fetch LinkedIn profiles for chats missing a display name.
// Unipile chat list responses use a flat `attendee_provider_id` field (not an attendees array).
async function enrichChats(chatList, accountId) {
  const enriched = await Promise.all(chatList.map(async (chat) => {
    // Already enriched in a previous pass
    if (chat._enrichedName) return chat

    const pid = chat.attendee_provider_id
    if (!pid || !accountId) return chat

    try {
      const profile = await linkedin.visitProfile(accountId, pid)
      const fetchedName = extractName(profile)
      return {
        ...chat,
        _enrichedName:     fetchedName || null,
        _enrichedHeadline: profile?.headline || profile?.occupation || null,
      }
    } catch {
      return chat
    }
  }))
  return enriched
}


const router = Router()

// Guard — 503 if Unipile env vars are missing
router.use((req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({
      message: 'Unipile is not configured. Add UNIPILE_API_KEY and UNIPILE_DSN to .env',
    })
  }
  next()
})

// ── Accounts ──────────────────────────────────────────────────

// GET /api/unipile/accounts
// Returns only LinkedIn accounts associated with the current workspace.
router.get('/accounts', async (req, res) => {
  try {
    const ws = wsId(req)

    // Fetch all Unipile accounts first
    const data = await accounts.list()
    console.log('[unipile/accounts] raw response keys:', Object.keys(data || {}))
    console.log('[unipile/accounts] raw response:', JSON.stringify(data).slice(0, 500))
    const all = data?.items || data?.accounts || data?.objects || data?.data || (Array.isArray(data) ? data : [])

    // No DB / dev mode — return everything
    if (!supabase || ws === 'ws_default') {
      return res.json({ items: all, object: 'AccountList' })
    }

    // Fetch workspace account associations from DB
    const { data: rows, error: dbErr } = await supabase
      .from('workspace_linkedin_accounts')
      .select('unipile_account_id')
      .eq('workspace_id', ws)

    if (dbErr) {
      // Table likely not created yet — return all accounts so the UI isn't broken
      console.warn('[unipile/accounts] DB error (migration not run?):', dbErr.message)
      return res.json({ items: all, object: 'AccountList' })
    }

    const knownIds = (rows || []).map(r => r.unipile_account_id)
    console.log('[unipile/accounts] ws:', ws, '| all accounts:', all.length, '| db knownIds:', knownIds)

    const filtered = all.filter(a => knownIds.includes(a.id))
    res.json({ items: filtered, object: 'AccountList' })
  } catch (err) {
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

    // Enrich all chats that have an attendee_provider_id but no cached name yet
    const needsEnrich = items.filter(chat => chat.attendee_provider_id && !chat._enrichedName)
    let enrichedItems = items
    if (needsEnrich.length > 0 && account_id) {
      console.log(`[chats] enriching ${needsEnrich.length} chats`)
      enrichedItems = await enrichChats(items, account_id)
    }

    res.json({ ...data, items: enrichedItems })
  } catch (err) {
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
    res.status(err.status || 500).json({ message: err.message })
  }
})

// POST /api/unipile/chats/:chatId/messages
router.post('/chats/:chatId/messages', async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ message: 'text required' })
    const data = await chats.sendMessage(req.params.chatId, text)
    res.json(data)
  } catch (err) {
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

    const data = await linkedin.sendInvite({ accountId, providerUserId: pid, message })
    res.json(data)
  } catch (err) {
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
// Body: { account_id, url?, keywords?, title?, location_text?, industry?, seniority?, company_sizes?, cursor? }
router.post('/linkedin/search', async (req, res) => {
  const {
    account_id, url,
    keywords, title,
    location_text, location: locationAlt,
    industry, seniority, company_sizes,
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

    // Keywords: combine job title + industry as text (industry has no simple numeric mapping)
    const keywordParts = [title || keywords, industry].filter(Boolean)
    const allKeywords = keywordParts.join(' ').trim()

    const urlParams = new URLSearchParams()
    if (allKeywords) urlParams.set('keywords', allKeywords)
    urlParams.set('origin', 'FACETED_SEARCH')

    // geoUrn: JSON array of LinkedIn location IDs as strings
    if (locationIds.length) {
      urlParams.set('geoUrn', JSON.stringify(locationIds.map(String)))
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

    const data = await linkedin.sendMessage({ accountId, linkedinUrl, providerUserId, text })
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message })
  }
})

export default router
