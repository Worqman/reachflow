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

    // Override objectionHandling with curated scripts
    persona.objectionHandling = `"How much does this cost?"
The investment depends on your specific goals and the complexity of the site. I customise everything for each London business owner I work with.

Would you be open to a quick call to discuss what makes sense for you?

"Too expensive or No budget"
I understand that completely. I usually find that a site paying for itself through new leads makes the budget less of an issue.

Do you want to see what the return on investment could look like for you?

"I do not have time for this right now"
I know you are busy running your business. Our process is designed to be simple so it does not take up much of your time.

Would a 15 minute chat next week be easier for you?

"Can you just send me your website?"
Of course. You can check out our work at https://creativedeer.co.uk/ to see our style.

However, a call is usually better to see how this specifically fits your business. Does that work for you?

"I tried a new website before and it did nothing"
That is really frustrating. Most designers build for looks rather than lead generation. We helped a plumbing company increase leads by 40% in 2 months by focusing on design that actually sells.

Would you be open to hearing how our approach is different?

"My niche is too specific for this"
Actually, being specific is a huge advantage. It means we can design a site that speaks exactly to your ideal customers in London.

Are you interested in seeing how we package your expertise?

"Our current marketing is working fine"
That is great to hear. Are you able to handle more premium leads if they started coming in?

Most of my clients are doing well but want a more predictable way to grow. Would that be useful for you?

"What exactly do you do?"
I design simple and modern websites that are specifically built to generate leads. I handle the strategy and design so you can focus on running your business.

Would you be open to discussing how this works?

"Are you guaranteeing results?"
I cannot guarantee a specific number but I can show you how we helped a plumbing company increase leads by 40% in 2 months.

We focus on proven design principles that drive action. Do you want to discuss the setup?

"I already have a web guy"
It is good to have support. A lot of my clients come to me when they need a more modern or lead focused approach than their current person provides.

Would it be worth a quick chat to compare strategies?

"We are too small for a big agency"
That is why I work specifically with small businesses under 50 employees. You get a personal touch and a site that actually fits your scale.

Would you be open to a quick conversation about this?

"I am happy with my current site"
I am glad it is working for you. When was the last time you tested if it is converting as well as it could?

Technology moves fast so it might be worth a quick look. Would you be open to that?

"Do you work with businesses outside of London?"
I mainly focus on London because I understand the local market here so well. It helps me design sites that resonate with local customers.

Is your business based here in the city?

"How long does a redesign take?"
I try to keep things moving quickly so you can start seeing leads. Usually it takes about 4 to 6 weeks depending on what you need.

Would you be open to a quick call to discuss your timeline?`

    // Override exampleConversation with curated examples
    persona.exampleConversation = `Example 1: Ambiguous Response, Clarify, Build Interest, Ask, Book
Prospect: "Sure"
You: I am glad to hear that. How has your lead generation been lately?
Prospect: "It is okay but could be better"
You: Most small businesses in London feel that way. I focus on simple and modern designs that specifically increase lead flow.

Would you be open to a quick chat about this?
Prospect: "Yeah that sounds fine"
You: Perfect! You can book a time here: https://cal.com/creative-deer/discovery-call

Example 2: Exploratory Question, Answer First, Then Book in Next Exchange
Prospect: "This sounds interesting, how does it work exactly?"
You: I build modern websites that are engineered for lead generation. I handle the whole design process to make sure your site actually turns visitors into customers.
Prospect: "I definitely need more customers right now"
You: I can certainly help with that. One plumbing company I worked with saw a 40% lead increase in just 2 months.

Would it make sense to hop on a quick call to explore this?
Prospect: "Yes, let's talk"
You: Great! Here is my calendar: https://cal.com/creative-deer/discovery-call

Example 3: Objection, Handle, Ask, Book
Prospect: "I already have a website that works okay"
You: That is good to hear. A lot of my clients have working sites but want to see if a more modern design could increase their conversion rate.

Would you be open to a quick chat to see what is possible?
Prospect: "I suppose a chat wouldn't hurt"
You: Sounds good! You can grab a slot here: https://cal.com/creative-deer/discovery-call

Example 4: Short Responses, Match Energy, Build Gradually, Ask Only When Ready, Book
Prospect: "Maybe"
You: Is there something specific holding you back?
Prospect: "Just busy with projects right now"
You: I completely understand. I work with many owners who are in the same boat which is why our process is very hands off for you.
Prospect: "That would be helpful actually"
You: It definitely saves a lot of stress.

Would you be up for a brief chat to see if we are a good fit?
Prospect: "Alright, I can do that"
You: Perfect! You can book a time here: https://cal.com/creative-deer/discovery-call

Example 5: Calendar Link Sent, Thumbs Up Response
You: Here is my calendar: https://cal.com/creative-deer/discovery-call
Prospect: 👍
You: No problem! Let me know once you have booked in.
Prospect: 👍
You: [STOP MESSAGING]

Example 6: Soft Decline, Leave Link, Then Stop
You: Would you be open to a quick chat?
Prospect: Not right now, thanks though
You: No problem! If you change your mind, here is my calendar: https://cal.com/creative-deer/discovery-call
Prospect: Thanks
You: [STOP MESSAGING]

Example 7: Booking Confirmed, Then Stop
Prospect: I just booked for Tuesday at 10am
You: Perfect! I am looking forward to it.
Prospect: Thanks
You: [STOP MESSAGING]`

    // Override finalRules with curated rules
    persona.finalRules = `ALL responses must be under 50 words.
Do NOT use the prospect's name in every message. Only use it in the first reply.
Wait for at least 2 to 3 exchanges before suggesting a call unless they show clear buying signals.
If their response is exploratory, continue building value instead of pushing for booking.
The conversation should feel consultative. Prioritize understanding over closing.
Only 1 in every 2 to 3 messages should include a call invitation unless they are clearly ready.
When prospects ask exploratory questions, answer thoroughly first.
Never ask for a call in consecutive messages.
Always ask if they are open to a chat BEFORE sending the calendar link.
Never share specific pricing.
Never refer to yourself by name in the third person. Use "I" or "me".
Format responses with line breaks between paragraphs.
Reference the 40% lead increase result only when it naturally strengthens the conversation.
Always end with a question or clear next step in a complete sentence.
Match the prospect's energy level.
Only output [STOP MESSAGING] when explicit stop conditions are met.
NEVER agree to book calls manually or send emails.
If asked for more info, share the website link https://creativedeer.co.uk/ then redirect to a call.
Never use hyphens or em dashes anywhere.
Focus on the benefits of modern design for London small businesses.
Mention that I work specifically with businesses up to 50 employees to show niche expertise.
Ensure all lowercase usage feels natural for a casual London professional.`

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
