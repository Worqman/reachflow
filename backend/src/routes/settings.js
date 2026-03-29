import { Router } from 'express'
import { workspaceStore } from '../services/store.js'

const router = Router()

// GET /api/settings/profile
router.get('/profile', (req, res) => {
  const profile = workspaceStore.getProfile()
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  res.json(profile)
})

// PUT /api/settings/profile
router.put('/profile', (req, res) => {
  const updated = workspaceStore.updateProfile(undefined, req.body)
  if (!updated) return res.status(404).json({ message: 'Profile not found' })
  res.json(updated)
})

// GET /api/settings/integrations
router.get('/integrations', (req, res) => {
  res.json({
    unipile:   { connected: !!process.env.UNIPILE_API_KEY,   name: 'Unipile'   },
    apollo:    { connected: !!process.env.APOLLO_API_KEY,    name: 'Apollo.io' },
    trigify:   { connected: !!process.env.TRIGIFY_API_KEY,   name: 'Trigify'   },
    anthropic: { connected: !!process.env.ANTHROPIC_API_KEY, name: 'Anthropic' },
    redis:     { connected: !!process.env.REDIS_URL,         name: 'Redis'     },
    supabase:  { connected: !!process.env.SUPABASE_URL,      name: 'Supabase'  },
  })
})

export default router
