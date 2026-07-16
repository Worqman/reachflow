import { Router } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../services/supabase.js'
import { leadStore } from '../services/store.js'

const router = Router()

function wsId(req) { return req.workspaceId || 'ws_default' }

function dbToApi(row) {
  if (!row) return null
  return {
    id:                row.id,
    workspaceId:       row.workspace_id,
    name:              row.name,
    title:             row.title,
    company:           row.company,
    location:          row.location,
    linkedinUrl:       row.linkedin_url,
    providerId:        row.provider_id,
    profilePictureUrl: row.profile_picture_url,
    status:            row.status,
    listId:            row.list_id || null,
    createdAt:         row.created_at,
  }
}

// GET /api/leads
router.get('/', async (req, res) => {
  if (!supabase) return res.json(leadStore.list())

  let query = supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', wsId(req))
    .order('created_at', { ascending: false })

  if (req.query.list_id) query = query.eq('list_id', req.query.list_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(dbToApi))
})

// Finds an existing lead in this workspace with the same provider_id or
// linkedin_url, so we never create two rows for the same LinkedIn profile.
async function findDuplicateLead(workspaceId, providerId, linkedinUrl) {
  if (providerId) {
    const { data } = await supabase.from('leads').select('*')
      .eq('workspace_id', workspaceId).eq('provider_id', providerId).maybeSingle()
    if (data) return data
  }
  if (linkedinUrl) {
    const { data } = await supabase.from('leads').select('*')
      .eq('workspace_id', workspaceId).eq('linkedin_url', linkedinUrl).maybeSingle()
    if (data) return data
  }
  return null
}

// POST /api/leads
router.post('/', async (req, res) => {
  if (!supabase) {
    const lead = leadStore.create(undefined, req.body)
    return res.status(201).json(lead)
  }

  const providerId = req.body.providerId || null
  const linkedinUrl = req.body.linkedinUrl || null

  if (providerId || linkedinUrl) {
    const existing = await findDuplicateLead(wsId(req), providerId, linkedinUrl)
    if (existing) return res.status(200).json({ ...dbToApi(existing), duplicate: true })
  }

  const row = {
    id:                `lead_${randomUUID().slice(0, 8)}`,
    workspace_id:      wsId(req),
    name:              req.body.name || null,
    title:             req.body.title || null,
    company:           req.body.company || null,
    location:          req.body.location || null,
    linkedin_url:      linkedinUrl,
    provider_id:       providerId,
    profile_picture_url: req.body.profilePictureUrl || null,
    status:            req.body.status || 'Not contacted',
    list_id:           req.body.listId || null,
  }

  const { data, error } = await supabase.from('leads').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(dbToApi(data))
})

// POST /api/leads/bulk
router.post('/bulk', async (req, res) => {
  const { leads } = req.body
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ message: 'leads must be a non-empty array' })
  }

  if (!supabase) {
    const created = leads.map(l => leadStore.create(undefined, l))
    return res.status(201).json(created)
  }

  const listId = req.body.list_id || null
  const workspaceId = wsId(req)

  // Dedupe against leads already saved in this workspace, and against
  // duplicates within the incoming batch itself (e.g. a CSV with repeats).
  const providerIds = [...new Set(leads.map(l => l.providerId).filter(Boolean))]
  const linkedinUrls = [...new Set(leads.map(l => l.linkedinUrl).filter(Boolean))]

  const [byProvider, byUrl] = await Promise.all([
    providerIds.length
      ? supabase.from('leads').select('provider_id').eq('workspace_id', workspaceId).in('provider_id', providerIds)
      : Promise.resolve({ data: [] }),
    linkedinUrls.length
      ? supabase.from('leads').select('linkedin_url').eq('workspace_id', workspaceId).in('linkedin_url', linkedinUrls)
      : Promise.resolve({ data: [] }),
  ])

  const existingProviderIds = new Set((byProvider.data || []).map(r => r.provider_id))
  const existingUrls = new Set((byUrl.data || []).map(r => r.linkedin_url))
  const seenProviderIds = new Set()
  const seenUrls = new Set()
  let skipped = 0

  const rows = []
  for (const l of leads) {
    const providerId = l.providerId || null
    const linkedinUrl = l.linkedinUrl || null
    const isDuplicate =
      (providerId && (existingProviderIds.has(providerId) || seenProviderIds.has(providerId))) ||
      (linkedinUrl && (existingUrls.has(linkedinUrl) || seenUrls.has(linkedinUrl)))

    if (isDuplicate) { skipped++; continue }
    if (providerId) seenProviderIds.add(providerId)
    if (linkedinUrl) seenUrls.add(linkedinUrl)

    rows.push({
      id:                `lead_${randomUUID().slice(0, 8)}`,
      workspace_id:      workspaceId,
      name:              l.name || null,
      title:             l.title || null,
      company:           l.company || null,
      location:          l.location || null,
      linkedin_url:      linkedinUrl,
      provider_id:       providerId,
      profile_picture_url: l.profilePictureUrl || null,
      status:            l.status || 'Not contacted',
      list_id:           listId,
    })
  }

  if (!rows.length) {
    return res.status(201).json({ leads: [], added: 0, skipped })
  }

  const { data, error } = await supabase.from('leads').insert(rows).select()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json({ leads: data.map(dbToApi), added: data.length, skipped })
})

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  if (!supabase) {
    const lead = leadStore.get(req.params.id)
    if (!lead) return res.status(404).json({ message: 'Lead not found' })
    return res.json(lead)
  }

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !data) return res.status(404).json({ message: 'Lead not found' })
  res.json(dbToApi(data))
})

// PUT /api/leads/:id
router.put('/:id', async (req, res) => {
  if (!supabase) {
    const updated = leadStore.update(req.params.id, req.body)
    if (!updated) return res.status(404).json({ message: 'Lead not found' })
    return res.json(updated)
  }

  const { data, error } = await supabase
    .from('leads')
    .update({
      name:              req.body.name,
      title:             req.body.title,
      company:           req.body.company,
      location:          req.body.location,
      linkedin_url:      req.body.linkedinUrl,
      provider_id:       req.body.providerId,
      profile_picture_url: req.body.profilePictureUrl,
      status:            req.body.status,
      list_id:           req.body.listId !== undefined ? req.body.listId : undefined,
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error || !data) return res.status(404).json({ message: 'Lead not found' })
  res.json(dbToApi(data))
})

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  if (!supabase) {
    const deleted = leadStore.delete(req.params.id)
    if (!deleted) return res.status(404).json({ message: 'Lead not found' })
    return res.json({ success: true })
  }

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

export default router
