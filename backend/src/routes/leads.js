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
    createdAt:         row.created_at,
  }
}

// GET /api/leads
router.get('/', async (req, res) => {
  if (!supabase) return res.json(leadStore.list())

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', wsId(req))
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(dbToApi))
})

// POST /api/leads
router.post('/', async (req, res) => {
  if (!supabase) {
    const lead = leadStore.create(undefined, req.body)
    return res.status(201).json(lead)
  }

  const row = {
    id:                `lead_${randomUUID().slice(0, 8)}`,
    workspace_id:      wsId(req),
    name:              req.body.name || null,
    title:             req.body.title || null,
    company:           req.body.company || null,
    location:          req.body.location || null,
    linkedin_url:      req.body.linkedinUrl || null,
    provider_id:       req.body.providerId || null,
    profile_picture_url: req.body.profilePictureUrl || null,
    status:            req.body.status || 'Not contacted',
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

  const rows = leads.map(l => ({
    id:                `lead_${randomUUID().slice(0, 8)}`,
    workspace_id:      wsId(req),
    name:              l.name || null,
    title:             l.title || null,
    company:           l.company || null,
    location:          l.location || null,
    linkedin_url:      l.linkedinUrl || null,
    provider_id:       l.providerId || null,
    profile_picture_url: l.profilePictureUrl || null,
    status:            l.status || 'Not contacted',
  }))

  const { data, error } = await supabase.from('leads').insert(rows).select()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(data.map(dbToApi))
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
