import { Router } from 'express'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase.js'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function wsId(req) { return req.workspaceId || 'ws_default' }

// Fetch workspace company profile from Supabase
async function getWorkspaceProfile(workspaceId) {
  if (!supabase || !workspaceId || workspaceId === 'ws_default') return null
  try {
    const { data } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      companyName:  data.company_name,
      website:      data.website_url,
      valueProp:    data.value_proposition,
      services:     Array.isArray(data.services_offered) ? data.services_offered.join(', ') : (data.services_offered || ''),
      socialProof:  Array.isArray(data.social_proof) ? data.social_proof.join('. ') : (data.social_proof || ''),
      tone:         data.tone_preference,
      calendarLink: data.calendar_link,
    }
  } catch {
    return null
  }
}

function dbToApi(row) {
  if (!row) return null
  return {
    id:               row.id,
    workspaceId:      row.workspace_id,
    name:             row.name,
    status:           row.status,
    persona:          row.persona || {},
    icp:              row.icp || {},
    keywords:         row.keywords || [],
    signalTypes:      row.signal_types || [],
    icpFilters:       row.icp_filters || {},
    leadsFound:       row.leads_found || 0,
    signalsDetected:  row.signals_detected || 0,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
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
  if (!ws || ws === 'ws_default') return res.json([])
  query = query.eq('workspace_id', ws)

  const { data, error } = await query
  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(dbToApi))
})

// POST /api/agents
router.post('/', async (req, res) => {
  const { name, ...rest } = req.body
  if (!name) return res.status(400).json({ message: 'name required' })

  const row = {
    id:           `agent_${randomUUID().slice(0, 8)}`,
    workspace_id: wsId(req),
    name,
    status:       'active',
    persona:      rest.persona || {},
    icp:          rest.icp || {},
    keywords:     rest.keywords || [],
    signal_types: rest.signalTypes || [],
    icp_filters:  rest.icpFilters || {},
  }

  const { data, error } = await supabase.from('agents').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })
  res.status(201).json(dbToApi(data))
})

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('agents').select('*').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()

  if (error || !data) return res.status(404).json({ message: 'Agent not found' })
  res.json(dbToApi(data))
})

// PUT /api/agents/:id
router.put('/:id', async (req, res) => {
  const { name, status, persona, icp, keywords, signalTypes, icpFilters } = req.body
  const patch = {}
  if (name        !== undefined) patch.name         = name
  if (status      !== undefined) patch.status       = status
  if (persona     !== undefined) patch.persona      = persona
  if (icp         !== undefined) patch.icp          = icp
  if (keywords    !== undefined) patch.keywords     = keywords
  if (signalTypes !== undefined) patch.signal_types = signalTypes
  if (icpFilters  !== undefined) patch.icp_filters  = icpFilters

  const { data, error } = await supabase
    .from('agents').update(patch).eq('id', req.params.id).eq('workspace_id', wsId(req)).select().single()

  if (error || !data) return res.status(404).json({ message: error?.message || 'Agent not found' })
  res.json(dbToApi(data))
})

// DELETE /api/agents/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('agents').delete().eq('id', req.params.id).eq('workspace_id', wsId(req))
  if (error) return res.status(500).json({ message: error.message })
  res.json({ success: true })
})

// POST /api/agents/:id/generate-persona
router.post('/:id/generate-persona', async (req, res) => {
  try {
    const { data: agentRow } = await supabase
      .from('agents').select('*').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()
    if (!agentRow) return res.status(404).json({ message: 'Agent not found' })

    const profile = await getWorkspaceProfile(wsId(req))
    const { serviceOffer, targetingBrief, tone } = req.body

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are an expert B2B sales coach. Create a LinkedIn AI Assistant persona for an outreach campaign.

Company Profile:
- Company: ${profile.companyName}
- Services: ${profile.services}
- Value Prop: ${profile.valueProp}
- Social Proof: ${profile.socialProof || 'Not provided'}
- Preferred Tone: ${tone || profile.tone || 'professional'}
- Calendar Link: ${profile.calendarLink || 'TBC'}

Service/Offer for this campaign: ${serviceOffer || 'General outreach'}
Target Audience: ${targetingBrief || 'B2B professionals'}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "roleAndObjective": "Description of the assistant's role and what it is trying to achieve...",
  "toneAndStyle": "How the assistant communicates — tone, word limits, style rules...",
  "movingToCall": "When and how to transition to suggesting a call or meeting...",
  "objectionHandling": "Specific scripts for handling: not right person, too small, what do you do, are you automated, need partner approval, not interested...",
  "exampleConversation": "A realistic example LinkedIn message exchange (3–5 turns) showing the ideal tone, objection handling, and how the agent moves toward booking a call. Format as:\\nAgent: ...\\nProspect: ...\\nAgent: ...",
  "finalRules": "Word limits, dos and don'ts, must-follow rules for every single message..."
}`
      }]
    })

    const persona = JSON.parse(message.content[0].text.trim())

    const { data: updated } = await supabase
      .from('agents').update({ persona }).eq('id', req.params.id).eq('workspace_id', wsId(req)).select().single()

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
      .from('agents').select('*').eq('id', req.params.id).eq('workspace_id', wsId(req)).single()
    if (!agentRow) return res.status(404).json({ message: 'Agent not found' })

    const profile = await getWorkspaceProfile(wsId(req))
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
      .from('agents').update({ icp }).eq('id', req.params.id).eq('workspace_id', wsId(req)).select().single()

    res.json({ icp, agent: dbToApi(updated) })
  } catch (err) {
    console.error('ICP generation error:', err)
    res.status(500).json({ message: 'ICP generation failed', error: err.message })
  }
})

// GET /api/agents/:id/signal-events
router.get('/:id/signal-events', async (req, res) => {
  const { data, error } = await supabase
    .from('signal_events')
    .select('*')
    .eq('agent_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ message: error.message })
  res.json(data.map(r => ({
    id:          r.id,
    agentId:     r.agent_id,
    workspaceId: r.workspace_id,
    type:        r.type,
    leadName:    r.lead_name,
    company:     r.company,
    signal:      r.signal,
    intentScore: r.intent_score,
    actioned:    r.actioned,
    createdAt:   r.created_at,
  })))
})

// POST /api/agents/:id/signal-events
router.post('/:id/signal-events', async (req, res) => {
  const { type, leadName, company, signal, intentScore = 0 } = req.body
  if (!type || !leadName) return res.status(400).json({ message: 'type and leadName required' })

  const row = {
    id:           `sig_${randomUUID().slice(0, 8)}`,
    workspace_id: wsId(req),
    agent_id:     req.params.id,
    type,
    lead_name:    leadName,
    company:      company || null,
    signal:       signal || null,
    intent_score: intentScore,
    actioned:     false,
  }

  const { data, error } = await supabase.from('signal_events').insert(row).select().single()
  if (error) return res.status(500).json({ message: error.message })

  // bump agent signals_detected counter
  const { data: agentRow } = await supabase.from('agents').select('signals_detected').eq('id', req.params.id).single()
  if (agentRow) {
    await supabase.from('agents').update({ signals_detected: (agentRow.signals_detected || 0) + 1 }).eq('id', req.params.id)
  }

  res.status(201).json({
    id:          data.id,
    agentId:     data.agent_id,
    workspaceId: data.workspace_id,
    type:        data.type,
    leadName:    data.lead_name,
    company:     data.company,
    signal:      data.signal,
    intentScore: data.intent_score,
    actioned:    data.actioned,
    createdAt:   data.created_at,
  })
})

// PATCH /api/agents/:id/signal-events/:eventId/action
router.patch('/:id/signal-events/:eventId/action', async (req, res) => {
  const { data, error } = await supabase
    .from('signal_events')
    .update({ actioned: true })
    .eq('id', req.params.eventId)
    .eq('agent_id', req.params.id)
    .select()
    .single()
  if (error || !data) return res.status(404).json({ message: 'Event not found' })
  res.json({ actioned: data.actioned })
})

export default router
