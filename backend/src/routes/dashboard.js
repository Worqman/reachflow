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
        .select('campaign_id, status, name, company, updated_at, created_at')
        .in('campaign_id', campIds)
      leadRows = data || []
    }

    // Build per-campaign stats
    const campStats = {}
    for (const lead of leadRows) {
      const c = campStats[lead.campaign_id] || { sent: 0, accepted: 0, replied: 0, booked: 0 }
      if (['invited', 'connected', 'replied', 'booked', 'rejected'].includes(lead.status)) c.sent++
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
    // Invites sent this week: leads created (added to campaign) this week that got an invite sent
    const invitesSentThisWeek = leadRows.filter(l =>
      ['invited', 'connected', 'replied', 'booked', 'rejected'].includes(l.status) &&
      l.created_at >= weekAgo
    ).length

    // Acceptance rate: all-time (total connected / total invited)
    const totalSent = leadRows.filter(l =>
      ['invited', 'connected', 'replied', 'booked', 'rejected'].includes(l.status)
    ).length
    const totalConnected = leadRows.filter(l =>
      ['connected', 'replied', 'booked'].includes(l.status)
    ).length
    const acceptanceRate = totalSent > 0
      ? Math.round((totalConnected / totalSent) * 100)
      : 0

    const activeCampaigns = (campaigns || []).filter(c => c.status === 'active').length

    // ── Meetings: use booked leads from campaigns ──────────────
    const bookedLeads = leadRows.filter(l => l.status === 'booked')
    const meetingsThisMonth = bookedLeads.filter(l => l.updated_at >= monthStart).length

    const meetingRows = bookedLeads
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 10)
      .map(l => ({
        id:            l.name + l.updated_at,
        prospect_name: l.name    || 'Unknown',
        booked_at:     l.updated_at,
        notes:         l.company || '',
      }))

    // ── Needs review: leads with status=replied ────────────────
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
      meetings:  meetingRows,
      needsReview,
    })
  } catch (err) {
    console.error('[dashboard]', err)
    res.status(500).json({ message: err.message })
  }
})

export default router
