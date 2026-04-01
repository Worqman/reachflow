// ─────────────────────────────────────────────────────────────────────────────
// Unipile API client
// Env vars required: UNIPILE_API_KEY, UNIPILE_DSN (e.g. api3.unipile.com:13465)
// ─────────────────────────────────────────────────────────────────────────────

function getBaseUrl() {
  const dsn = process.env.UNIPILE_DSN
  if (!dsn) throw new Error('UNIPILE_DSN is not configured')
  const base = dsn.startsWith('http') ? dsn : `https://${dsn}`
  return `${base}/api/v1`
}

async function request(method, path, body) {
  const apiKey = process.env.UNIPILE_API_KEY
  if (!apiKey) throw new Error('UNIPILE_API_KEY is not configured')

  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = data?.message || data?.error || `Unipile API error ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export function isConfigured() {
  return !!(process.env.UNIPILE_API_KEY && process.env.UNIPILE_DSN)
}

// ── Relations ─────────────────────────────────────────────────────────────────
export const relations = {
  /** List all connections for an account */
  list: ({ accountId, limit = 100, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (accountId) params.append('account_id', accountId)
    if (cursor) params.append('cursor', cursor)
    return request('GET', `/users/relations?${params}`)
  },

  /** Search connections by keyword — fetches up to 200 and filters by name/headline client-side */
  search: async ({ accountId, keywords, limit = 200 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (accountId) params.append('account_id', accountId)
    const data = await request('GET', `/users/relations?${params}`)
    console.log('[relations.search] raw response keys:', Object.keys(data || {}))

    // Unipile may return items under different keys — try all known ones
    const items =
      data?.items ||
      data?.objects ||
      data?.results ||
      data?.users ||
      data?.data ||
      (Array.isArray(data) ? data : [])

    console.log('[relations.search] total connections found:', items.length)
    if (items[0]) {
      console.log('[relations.search] first item keys:', Object.keys(items[0]))
      console.log('[relations.search] first item:', JSON.stringify(items[0]).slice(0, 300))
    }

    if (!keywords || !items.length) return { items, total: items.length }

    // Split into individual words so "Marketing Manager" matches "Marketing Director" too
    const words = keywords.toLowerCase().split(/\s+/).filter(Boolean)
    const filtered = items.filter(u => {
      const text = [
        u.name, u.full_name, u.first_name, u.last_name,
        u.headline, u.occupation, u.job_title, u.title,
        u.company_name, u.company, u.current_company,
        u.location, u.geo_location,
      ].filter(Boolean).join(' ').toLowerCase()
      return words.some(w => text.includes(w))
    })

    console.log('[relations.search] after filter:', filtered.length, 'results for', JSON.stringify(keywords))
    // If no matches after filtering, return all connections so the user sees something
    return filtered.length > 0
      ? { items: filtered, total: filtered.length }
      : { items, total: items.length, unfiltered: true }
  },
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export const accounts = {
  /** List all connected LinkedIn accounts */
  list: () => request('GET', '/accounts'),

  /** Start hosted-auth flow to connect a new LinkedIn account */
  startHostedAuth: ({ successRedirectUrl, failureRedirectUrl, notifyUrl, name } = {}) => {
    const dsn = process.env.UNIPILE_DSN
    const apiUrl = dsn ? (dsn.startsWith('http') ? dsn : `https://${dsn}`) : undefined
    // Link expires in 1 hour
    const expiresOn = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    return request('POST', '/hosted/accounts/link', {
      type: 'create',
      providers: ['LINKEDIN'],
      api_url: apiUrl,
      expiresOn,
      ...(successRedirectUrl && { success_redirect_url: successRedirectUrl }),
      ...(failureRedirectUrl && { failure_redirect_url: failureRedirectUrl }),
      ...(notifyUrl && { notify_url: notifyUrl }),
      ...(name && { name }),
    })
  },

  /** Disconnect / delete a connected account */
  delete: (accountId) => request('DELETE', `/accounts/${accountId}`),
}

// ── Chats (Inbox) ─────────────────────────────────────────────────────────────
export const chats = {
  /** List conversations. Filter by accountId, paginate with cursor. */
  list: ({ accountId, limit = 20, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (accountId) params.append('account_id', accountId)
    if (cursor) params.append('cursor', cursor)
    return request('GET', `/chats?${params}`)
  },

  /** Get messages for a specific chat thread */
  getMessages: (chatId, { limit = 50, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.append('cursor', cursor)
    return request('GET', `/chats/${chatId}/messages?${params}`)
  },

  /** Send a message in an existing chat */
  sendMessage: (chatId, text) =>
    request('POST', `/chats/${chatId}/messages`, { text }),
}

// ── LinkedIn Outreach ─────────────────────────────────────────────────────────
export const linkedin = {
  /**
   * Send a LinkedIn connection request.
   * Requires accountId + providerUserId (LinkedIn member URN, e.g. ACoAABc...).
   * To get provider_id from a URL, first call getProfileByUrl().
   */
  sendInvite: ({ accountId, providerUserId, message } = {}) =>
    request('POST', '/users/invite', {
      account_id:  accountId,
      provider_id: providerUserId,
      ...(message && { message }),
    }),

  /**
   * Send a LinkedIn message to a user (creates or uses existing chat).
   * Uses multipart/form-data as required by Unipile POST /chats.
   * Requires accountId + providerUserId (LinkedIn member URN).
   * Note: can only message existing connections on standard LinkedIn.
   */
  sendMessage: async ({ accountId, providerUserId, text } = {}) => {
    const apiKey = process.env.UNIPILE_API_KEY
    if (!apiKey) throw new Error('UNIPILE_API_KEY is not configured')
    const url = `${getBaseUrl()}/chats`
    const form = new FormData()
    form.append('account_id', accountId)
    form.append('attendees_ids', providerUserId)
    form.append('text', text)
    form.append('linkedin[api]', 'classic')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.message || data?.error || `Unipile API error ${res.status}`
      const err = new Error(msg)
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  },

  /**
   * Fetch (visit) a LinkedIn user profile by their Unipile provider_id.
   * This triggers a profile view on LinkedIn from the connected account.
   */
  visitProfile: (accountId, providerUserId) => {
    const params = new URLSearchParams({ account_id: accountId })
    return request('GET', `/users/${encodeURIComponent(providerUserId)}?${params}`)
  },

  /** Fetch a LinkedIn user profile by their Unipile provider_user_id */
  getProfile: (providerUserId) => request('GET', `/users/${providerUserId}`),

  /**
   * Fetch a LinkedIn profile by username slug (e.g. "lorikramaa").
   * The identifier is a path param — pass just the slug, not the full URL.
   * account_id is included in case the server requires it, but docs say it's optional.
   */
  getProfileByUrl: (accountId, slug) => {
    const params = new URLSearchParams({ account_id: accountId })
    return request('GET', `/users/${encodeURIComponent(slug)}?${params}`)
  },

  /**
   * Fetch a post by its Unipile post_id to retrieve the social_id.
   * The social_id should be used for reactions/comments calls.
   */
  getPost: (accountId, postId) => {
    const params = new URLSearchParams({ account_id: accountId })
    return request('GET', `/posts/${encodeURIComponent(postId)}?${params}`)
  },

  /**
   * Get reactions (likers) for a post.
   * postId: the post's social_id from a prior getPost() call, or the raw numeric activity ID.
   */
  getPostReactions: (accountId, postId, { limit = 50, cursor } = {}) => {
    const params = new URLSearchParams({ account_id: accountId, limit: String(limit) })
    if (cursor) params.append('cursor', cursor)
    return request('GET', `/posts/${encodeURIComponent(postId)}/reactions?${params}`)
  },

  /**
   * Get comments for a post.
   */
  getPostComments: (accountId, postId, { limit = 50, cursor } = {}) => {
    const params = new URLSearchParams({ account_id: accountId, limit: String(limit) })
    if (cursor) params.append('cursor', cursor)
    return request('GET', `/posts/${encodeURIComponent(postId)}/comments?${params}`)
  },

  /**
   * Search LinkedIn people via Unipile POST /linkedin/search.
   * Supports URL-based search (paste a LinkedIn search URL) or keyword-based.
   * Uses classic LinkedIn API — all terms combined into `keywords`.
   */
  searchPeople: (accountId, { url, cursor, keywords, title, locationIds = [], api = 'classic' } = {}) => {
    const params = new URLSearchParams({ account_id: accountId })

    if (url) {
      const body = { api, url }
      if (cursor) body.cursor = cursor
      return request('POST', `/linkedin/search?${params}`, body)
    }

    const body = { api, category: 'people' }
    if (keywords) body.keywords = keywords
    if (title && title !== keywords) body.advanced_keywords = { title }
    if (locationIds.length) body.location = locationIds.map(String)
    if (cursor) body.cursor = cursor

    console.log('[searchPeople] body:', JSON.stringify(body))
    return request('POST', `/linkedin/search?${params}`, body)
  },

  /**
   * Resolve a plain-text location name to LinkedIn location IDs.
   * e.g. "United Kingdom" → [101165590]
   */
  resolveLocation: (accountId, query) => {
    const params = new URLSearchParams({ account_id: accountId, type: 'LOCATION', keywords: query, limit: '5' })
    return request('GET', `/linkedin/search/parameters?${params}`)
  },
}

export default { accounts, chats, linkedin, isConfigured }
