import { Router } from 'express'
import { supabase } from '../services/supabase.js'
import { meetingStore } from '../services/store.js'

const router = Router()

// GET /api/meetings
router.get('/', async (req, res) => {
  const ws = req.workspaceId
  if (supabase) {
    const query = supabase.from('meetings').select('*').order('booked_at', { ascending: false })
    const { data, error } = await query
    if (error) return res.status(500).json({ message: error.message })
    return res.json(data || [])
  }
  res.json(meetingStore.list(ws))
})

export default router
