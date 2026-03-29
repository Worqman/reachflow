import { Router } from 'express'
import { accounts, chats, linkedin, relations, isConfigured } from '../services/unipile.js'

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
router.get('/accounts', async (req, res) => {
  try {
    const data = await accounts.list()
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message })
  }
})

// POST /api/unipile/accounts/connect
// Starts hosted-auth flow. Returns { url } for the frontend to open.
router.post('/accounts/connect', async (req, res) => {
  try {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    const data = await accounts.startHostedAuth({
      successRedirectUrl: `${frontendUrl}/settings?unipile=connected`,
      failureRedirectUrl: `${frontendUrl}/settings?unipile=failed`,
      notifyUrl: `${backendUrl}/api/webhooks/unipile`,
      name: req.body.name,
    })
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message })
  }
})

// DELETE /api/unipile/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  try {
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
