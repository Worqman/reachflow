import { Router } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../services/supabase.js'

const router = Router()

function wsId(req) { return req.workspaceId || 'ws_default' }

// In-memory fallback
const memLists = new Map()

// GET /api/lead-lists
router.get('/', async (req, res) => {
  if (!supabase) {
    const ws = wsId(req)
    return res.json([...memLists.values()].filter(l => l.workspace_id === ws))
  }
  const { data, error } = await supabase
    .from('lead_lists')
    .select('*')
    .eq('workspace_id', wsId(req))
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ message: error.message })
  res.json(data)
})

// POST /api/lead-lists
router.post('/', async (req, res) => {
  const name = req.body?.name?.trim()
  if (!name) return res.status(400).json({ message: 'name is required' })

  if (!supabase) {
    const list = {
      id: `list_${randomUUID().slice(0, 8)}`,
      workspace_id: wsId(req),
      name,
      created_at: new Date().toISOString(),
    }
    memLists.set(list.id, list)
    return res.status(201).json(list)
  }

  const row = { id: `list_${randomUUID().slice(0, 8)}`, workspace_id: wsId(req), name }
  const { data, error } = await supabase.from('lead_lists').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(data)
})

// PUT /api/lead-lists/:id
router.put('/:id', async (req, res) => {
  const name = req.body?.name?.trim()
  if (!name) return res.status(400).json({ message: 'name is required' })

  if (!supabase) {
    const list = memLists.get(req.params.id)
    if (!list) return res.status(404).json({ message: 'List not found' })
    list.name = name
    return res.json(list)
  }

  const { data, error } = await supabase
    .from('lead_lists')
    .update({ name })
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))
    .select()
    .single()
  if (error || !data) return res.status(404).json({ message: 'List not found' })
  res.json(data)
})

// DELETE /api/lead-lists/:id
router.delete('/:id', async (req, res) => {
  if (!supabase) {
    memLists.delete(req.params.id)
    return res.json({ success: true })
  }

  // Unassign leads before deleting the list
  await supabase.from('leads').update({ list_id: null }).eq('list_id', req.params.id)

  const { error } = await supabase
    .from('lead_lists')
    .delete()
    .eq('id', req.params.id)
    .eq('workspace_id', wsId(req))
  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

export default router
