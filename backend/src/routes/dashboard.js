import { Router } from 'express'
import { supabase } from '../services/supabase.js'

const router = Router()

function wsId(req) { return req.workspaceId || 'ws_default' }

// GET /api/dashboard
router.get('/', async (req, res) => {
  if (!supabase) return res.status(503).json({ message: 'Supabase not configured' })

  const ws = wsId(req)
  const now = new Date()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  try {
    // ── Campaigns ──────────────────────────────────────────────
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })

    const campIds = (campaigns || []).map(c => c.id)

    // ── Lead counts per campaign ───────────────────────────────
    let leadRows = []
    if (campIds.length) {
      const { data } = await supabase
        .from('campaign_leads')
        .select('campaign_id, status, name, company, updated_at')
        .in('campaign_id', campIds)
      leadRows = data || []
    }

    // Build per-campaign stats
    const campStats = {}
    for (const lead of leadRows) {
      const c = campStats[lead.campaign_id] || { sent: 0, accepted: 0, replied: 0, booked: 0 }
      c.sent++
      if (['connected', 'replied', 'booked'].includes(lead.status)) c.accepted++
      if (['replied', 'booked'].includes(lead.status)) c.replied++
      if (lead.status === 'booked') c.booked++
      campStats[lead.campaign_id] = c
    }

    const campaignsWithStats = (campaigns || []).map(c => ({
      id:       c.id,
      name:     c.name,
      status:   c.status,
      sent:     campStats[c.id]?.sent     || 0,
      accepted: campStats[c.id]?.accepted || 0,
      replied:  campStats[c.id]?.replied  || 0,
    }))

    // ── Stats ──────────────────────────────────────────────────
    const thisWeekLeads = leadRows.filter(l => l.updated_at >= weekAgo)
    const invitesSentThisWeek = thisWeekLeads.filter(l =>
      ['invited', 'pending', 'connected', 'replied', 'booked'].includes(l.status)
    ).length
    const connectedThisWeek = thisWeekLeads.filter(l =>
      ['connected', 'replied', 'booked'].includes(l.status)
    ).length
    const acceptanceRate = invitesSentThisWeek > 0
      ? Math.round((connectedThisWeek / invitesSentThisWeek) * 100)
      : 0

    const activeCampaigns = (campaigns || []).filter(c => c.status === 'active').length

    // ── Meetings this month ────────────────────────────────────
    const { data: meetings } = await supabase
      .from('meetings')
      .select('*')
      .gte('booked_at', monthStart)
      .order('booked_at', { ascending: false })

    const meetingsThisMonth = (meetings || []).length

    // ── Needs review: leads with status=replied, get names ─────
    const needsReview = leadRows
      .filter(l => l.status === 'replied')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5)
      .map(l => ({
        name:      l.name    || 'Unknown',
        company:   l.company || '',
        updatedAt: l.updated_at,
      }))

    res.json({
      stats: {
        invitesSentThisWeek,
        acceptanceRate,
        meetingsThisMonth,
        activeCampaigns,
      },
      campaigns: campaignsWithStats,
      meetings:  meetings || [],
      needsReview,
    })
  } catch (err) {
    console.error('[dashboard]', err)
    res.status(500).json({ message: err.message })
  }
})

export default router
