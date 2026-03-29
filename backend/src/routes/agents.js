import { Router } from 'express'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase.js'
import { workspaceStore } from '../services/store.js'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function wsId(req) { return req.workspaceId || 'ws_default' }

function dbToApi(row) {
  if (!row) return null
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    name:        row.name,
    type:        row.type,
    status:      row.status,
    persona:     row.persona || {},
    icp:         row.icp || {},
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

// Exported so conversations.js can resolve agents without in-memory store
export async function getAgentById(id) {
  if (!supabase || !id) return null
  const { data } = await supabase.from('agents').select('*').eq('id', id).single()
  return data ? dbToApi(data) : null
}

// GET /api/agents
router.get('/', async (req, res) => {
  const ws = wsId(req)
  let query = supabase.from('agents').select('*').order('created_at', { ascending: false })
  // Only filter by workspace_id if it's a real ID (not the fallback default)
  if (ws !== 'ws_default') query = query.eq('workspace_id', ws)

  const { data, error } = await query
  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(dbToApi))
})

// POST /api/agents
router.post('/', async (req, res) => {
  const { name, type = 'assistant', ...rest } = req.body
  if (!name) return res.status(400).json({ message: 'name required' })

  const row = {
    id:           `agent_${randomUUID().slice(0, 8)}`,
    workspace_id: wsId(req),
    name,
    type,
    status:       'active',
    persona:      rest.persona || {},
    icp:          rest.icp || {},
  }

  const { data, error } = await supabase.from('agents').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(dbToApi(data))
})

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('agents').select('*').eq('id', req.params.id).single()

  if (error || !data) return res.status(404).json({ message: 'Agent not found' })
  res.json(dbToApi(data))
})

// PUT /api/agents/:id
router.put('/:id', async (req, res) => {
  const { name, type, status, persona, icp } = req.body
  const patch = {}
  if (name    !== undefined) patch.name    = name
  if (type    !== undefined) patch.type    = type
  if (status  !== undefined) patch.status  = status
  if (persona !== undefined) patch.persona = persona
  if (icp     !== undefined) patch.icp     = icp

  const { data, error } = await supabase
    .from('agents').update(patch).eq('id', req.params.id).select().single()

  if (error || !data) return res.status(404).json({ message: error?.message || 'Agent not found' })
  res.json(dbToApi(data))
})

// DELETE /api/agents/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('agents').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

// POST /api/agents/:id/generate-persona
router.post('/:id/generate-persona', async (req, res) => {
  try {
    const { data: agentRow } = await supabase
      .from('agents').select('*').eq('id', req.params.id).single()
    if (!agentRow) return res.status(404).json({ message: 'Agent not found' })

    const profile = workspaceStore.getProfile()
    const { serviceOffer, targetingBrief } = req.body

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an expert B2B sales coach. Create a LinkedIn AI Assistant persona for an outreach campaign.

Company Profile:
- Company: ${profile.companyName}
- Services: ${profile.services}
- Value Prop: ${profile.valueProp}
- Social Proof: ${profile.socialProof || 'Not provided'}
- Tone: ${profile.tone}
- Calendar Link: ${profile.calendarLink || 'TBC'}

Service/Offer for this campaign: ${serviceOffer || 'General outreach'}
Target Audience: ${targetingBrief || 'B2B professionals'}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "roleAndObjective": "Description of the assistant's role and what it is trying to achieve...",
  "toneAndStyle": "How the assistant communicates — tone, word limits, style rules...",
  "movingToCall": "When and how to transition to suggesting a call...",
  "objectionHandling": "How to handle: not right person, too small, what do you do, are you automated, need partner approval...",
  "finalRules": "Word limits, dos and don'ts, must-follow rules for every message..."
}`
      }]
    })

    const persona = JSON.parse(message.content[0].text.trim())

    const { data: updated } = await supabase
      .from('agents').update({ persona }).eq('id', req.params.id).select().single()

    res.json({ persona, agent: dbToApi(updated) })
  } catch (err) {
    console.error('Persona generation error:', err)
    res.status(500).json({ message: 'Persona generation failed', error: err.message })
  }
})

// POST /api/agents/:id/generate-icp
router.post('/:id/generate-icp', async (req, res) => {
  try {
    const { data: agentRow } = await supabase
      .from('agents').select('*').eq('id', req.params.id).single()
    if (!agentRow) return res.status(404).json({ message: 'Agent not found' })

    const profile = workspaceStore.getProfile()
    const { targetingBrief } = req.body

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a B2B sales strategist. Generate an Ideal Customer Profile (ICP) for a LinkedIn outreach campaign.

Company Profile:
- Company: ${profile.companyName}
- Services: ${profile.services}
- Value Prop: ${profile.valueProp}

Targeting Brief: ${targetingBrief}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "jobTitles": ["title1", "title2", "title3"],
  "industries": ["industry1", "industry2"],
  "locations": ["location1", "location2"],
  "companySizes": ["1-10", "11-50", "51-200"],
  "matchingMode": "discovery"
}`
      }]
    })

    const icp = JSON.parse(message.content[0].text.trim())

    const { data: updated } = await supabase
      .from('agents').update({ icp }).eq('id', req.params.id).select().single()

    res.json({ icp, agent: dbToApi(updated) })
  } catch (err) {
    console.error('ICP generation error:', err)
    res.status(500).json({ message: 'ICP generation failed', error: err.message })
  }
})

export default router
