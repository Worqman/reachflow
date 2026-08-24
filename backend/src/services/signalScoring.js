// ── Signal-based lead scoring engine ─────────────────────────────
// Combines ICP fit (agents.icp) with stacked behavioural signal_events
// into a 0-100 intent score, a low_intent/warm/high_intent classification,
// a confidence figure, and a human-readable reason — persisted to
// signal_scores per (agent_id, provider_id).
//
// Core rule (per product brief): a single weak signal (e.g. one post like)
// must never alone read as buying intent. This is enforced two ways, not
// just via weighting — see applyWeakSignalCap() and qualifiesForHighIntent()
// below.
import { randomUUID } from 'crypto'
import { supabase } from './supabase.js'
import { enqueueAutoEnroll } from './campaignQueue.js'

// Pure function of `classification` — not stored, computed at read time so
// it can never drift from the classification actually persisted. Drives
// the primary action button in the Signal Feed.
export function recommendedActionFor(classification) {
  if (classification === 'high_intent') return { action: 'add_to_campaign', label: 'Add to campaign' }
  if (classification === 'warm') return { action: 'save_lead', label: 'Save & monitor' }
  return { action: 'dismiss', label: 'Dismiss or wait for more signal' }
}

const COMPANY_SIGNAL_TYPES = ['job_change', 'funding_round', 'company_growth']

// Short, single-clause description of one signal event — used for
// {triggerReason}. Deterministic (no AI), same philosophy as buildReason().
function describeTopSignal(sig) {
  const topic = sig.metadata?.postTopic
  if (sig.type === 'job_change') return `changed jobs${topic ? ` — ${topic}` : ''}`
  if (sig.type === 'funding_round') return `their company raised funding${topic ? ` — ${topic}` : ''}`
  if (sig.type === 'company_growth') return `their company is growing${topic ? ` — ${topic}` : ''}`
  if (sig.metadata?.engagementType === 'comment') return `commented on ${topic ? `a post about ${topic}` : 'your post'}`
  if (sig.metadata?.engagementType === 'like') return `liked ${topic ? `a post about ${topic}` : 'your post'}`
  return (SIGNAL_TYPE_LABELS[sig.type] || sig.type || '').toLowerCase()
}

// Resolves the 7 signal-based sequence variables ({signalType},
// {signalSummary}, {triggerReason}, {recentPostTopic}, {painPoint},
// {companySignal}, {sourceUrl}) from a signal_scores row + a campaign_leads
// row. Never throws and always returns every key (defaulting to '') so
// interpolateVars() can blank-substitute a missing variable instead of
// failing a send — the no-signal-history case (the common one) is just
// `buildSignalVars(null, lead)`.
//
// Deliberately excludes any AI-generated text: every one of these values is
// either a deterministic label or copied straight from stored data, never
// produced by a model call. Campaign sequence steps are 100% user-authored —
// the AI only ever writes text in generateAIReply(), after a prospect
// replies. Don't add an AI-generated variable here.
export function buildSignalVars(scoreRow, lead = {}) {
  const empty = {
    signalType: '', signalSummary: '', triggerReason: '', recentPostTopic: '',
    painPoint: '', companySignal: '', sourceUrl: lead?.linkedin_url || '',
  }
  if (!scoreRow) return empty

  const signals = scoreRow.breakdown?.signals || []
  const top = [...signals].sort((a, b) => (b.decayedPoints || 0) - (a.decayedPoints || 0))[0] || null
  const postSignal = signals.find((s) => s.metadata?.postTopic) || null
  const painSignal = signals.find((s) => s.type === 'keyword_post' && s.metadata?.postTopic) || null
  const companySignalEvent = [...signals].reverse().find((s) => COMPANY_SIGNAL_TYPES.includes(s.type) && s.signal) || null

  return {
    signalType: top ? (SIGNAL_TYPE_LABELS[top.type] || top.type) : '',
    signalSummary: scoreRow.reason || '',
    triggerReason: top ? describeTopSignal(top) : '',
    recentPostTopic: postSignal?.metadata?.postTopic || '',
    painPoint: painSignal?.metadata?.postTopic || '',
    companySignal: companySignalEvent?.signal || '',
    sourceUrl: top?.metadata?.postUrl || scoreRow.linkedin_url || lead?.linkedin_url || '',
  }
}

// Ordering used to detect a classification *upgrade* (see recomputeScore's
// auto-enroll trigger and campaigns.runSignalAutoEnroll's rule matching) —
// not just a threshold compare, since 'warm' and 'high_intent' aren't
// numeric.
const CLASSIFICATION_RANK = { low_intent: 0, warm: 1, high_intent: 2 }
export function classificationRank(classification) {
  return CLASSIFICATION_RANK[classification] ?? -1
}

export const SIGNAL_TYPE_LABELS = {
  job_change:        'Job Change',
  funding_round:     'Funding Round',
  company_growth:    'Company Growth',
  competitor_follow: 'Competitor Follow',
  keyword_post:      'Keyword Post',
  post_activity:      'Post Activity',
}

// Every weight/threshold below is overridable per-workspace via
// scoring_config.config (deep-merged on top of this). Values are tuned to
// be reasonable defaults, not derived from real data — that's the point of
// making them configurable.
export const DEFAULT_CONFIG = {
  icpFit: {
    titleFullMatchPoints:  20,
    titlePartialMatchPoints: 10,
    locationMatchPoints:   10,
    // industries/companySizes are captured in agent.icp today but there's
    // no company-enrichment data source to compare against yet — reserved
    // at 0 until Apollo/Crunchbase/PDL is wired up.
    maxPoints: 40,
  },
  // tier drives the weak-signal guard; points drive the raw contribution.
  signalWeights: {
    job_change:        { tier: 'strong',   points: 35 },
    funding_round:      { tier: 'strong',   points: 30 },
    company_growth:      { tier: 'moderate', points: 20 },
    competitor_follow: {
      comment: { tier: 'moderate', points: 18 },
      like:     { tier: 'weak',     points: 8 },
      default:  { tier: 'weak',     points: 8 },
    },
    keyword_post: {
      comment: { tier: 'moderate', points: 22 },
      like:     { tier: 'weak',     points: 10 },
      default:  { tier: 'weak',     points: 10 },
    },
    post_activity: { tier: 'weak', points: 6 },
  },
  defaultSignalWeight: { tier: 'weak', points: 5 },
  decayHalfLifeDays: 21,
  stackingWindowDays: 30,
  signalScoreRatio: 0.65,
  icpFitScoreRatio: 0.35,
  weakOnly: {
    highFitThreshold: 0.75,
    minCountForHigherCap: 2,
    capWithHighFit: 55,
    capOtherwise: 35,
  },
  highIntent: {
    fitThreshold: 0.5,
    minQualifyingEvents: 2, // non-weak events, within the stacking window
  },
  classification: {
    highThreshold: 70,
    warmThreshold: 40,
  },
  confidence: {
    base: 30,
    perSignal: 15,
    fitBonus: 20,
    fitBonusThreshold: 0.5,
  },
  campaignGateThreshold: 40,
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const key of Object.keys(override)) {
    const overrideVal = override[key]
    const baseVal = base?.[key]
    if (overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal) &&
        baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)) {
      out[key] = deepMerge(baseVal, overrideVal)
    } else {
      out[key] = overrideVal
    }
  }
  return out
}

export async function loadScoringConfig(workspaceId) {
  if (!supabase || !workspaceId) return DEFAULT_CONFIG
  try {
    const { data } = await supabase
      .from('scoring_config')
      .select('config')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    return data?.config ? deepMerge(DEFAULT_CONFIG, data.config) : DEFAULT_CONFIG
  } catch (err) {
    console.warn('[signalScoring] failed to load scoring_config, using defaults:', err.message)
    return DEFAULT_CONFIG
  }
}

function norm(s) {
  return String(s || '').toLowerCase().trim()
}

// Title/location match against agent.icp — see DEFAULT_CONFIG.icpFit for
// point values. Industries/companySizes are not scored (no enrichment
// data source yet).
export function computeIcpFit(lead, icp, config = DEFAULT_CONFIG) {
  const w = config.icpFit
  const leadTitle = norm(lead?.title)
  const leadLocation = norm(lead?.location)

  let titleMatch = 0
  for (const wanted of icp?.jobTitles || []) {
    const wantedNorm = norm(wanted)
    if (!wantedNorm) continue
    if (leadTitle === wantedNorm || (leadTitle && leadTitle.includes(wantedNorm)) || wantedNorm.includes(leadTitle)) {
      titleMatch = w.titleFullMatchPoints
      break
    }
    const wantedWords = wantedNorm.split(/\s+/).filter(Boolean)
    const overlap = wantedWords.some((word) => word.length > 2 && leadTitle.includes(word))
    if (overlap) titleMatch = Math.max(titleMatch, w.titlePartialMatchPoints)
  }

  let locationMatch = 0
  for (const wanted of icp?.locations || []) {
    const wantedNorm = norm(wanted)
    if (wantedNorm && leadLocation && (leadLocation.includes(wantedNorm) || wantedNorm.includes(leadLocation))) {
      locationMatch = w.locationMatchPoints
      break
    }
  }

  const icpFitScore = titleMatch + locationMatch
  const icpFitRatio = w.maxPoints > 0 ? icpFitScore / w.maxPoints : 0
  return { titleMatch, locationMatch, icpFitScore, icpFitRatio }
}

function classifyEvent(event, config) {
  const weightDef = config.signalWeights[event.type]
  if (!weightDef) return config.defaultSignalWeight
  if (weightDef.tier) return weightDef
  const engagementType = event.metadata?.engagementType
  return weightDef[engagementType] || weightDef.default || config.defaultSignalWeight
}

function decay(points, ageDays, halfLifeDays) {
  if (halfLifeDays <= 0) return points
  return points * Math.pow(0.5, ageDays / halfLifeDays)
}

// The "one weak signal ≠ intent" guard, expressed as an explicit cap
// rather than relying on weighting alone — a small ICP-fit contribution
// could otherwise let a single like sneak into "warm" territory.
function applyWeakSignalCap(finalScoreRaw, contributingEvents, icpFitRatio, config) {
  if (!contributingEvents.length) return finalScoreRaw
  const weakOnly = contributingEvents.every((e) => e.tier === 'weak')
  if (!weakOnly) return finalScoreRaw
  const w = config.weakOnly
  const cap = (icpFitRatio >= w.highFitThreshold && contributingEvents.length >= w.minCountForHigherCap)
    ? w.capWithHighFit
    : w.capOtherwise
  return Math.min(finalScoreRaw, cap)
}

// High intent requires either one strong signal backed by real ICP fit, or
// multiple non-weak signals stacked — a boolean gate, not just a score
// cutoff, so a borderline score alone can't read as "high intent".
function qualifiesForHighIntent(contributingEvents, icpFitRatio, config) {
  const h = config.highIntent
  const hasStrongWithFit = contributingEvents.some((e) => e.tier === 'strong' && icpFitRatio >= h.fitThreshold)
  const nonWeakCount = contributingEvents.filter((e) => e.tier !== 'weak').length
  const hasStacking = nonWeakCount >= h.minQualifyingEvents
  return hasStrongWithFit || hasStacking
}

function buildReason({ contributingEvents, icpFitRatio, qualifies, classification, cappedByWeakSignal }) {
  if (!contributingEvents.length) {
    return 'No recent signal activity — score reflects ICP fit only.'
  }
  const top = [...contributingEvents].sort((a, b) => b.decayed - a.decayed).slice(0, 2)
  const parts = top.map((e) => {
    const label = SIGNAL_TYPE_LABELS[e.type] || e.type
    const ageLabel = e.ageDays < 1 ? 'today' : `${Math.round(e.ageDays)}d ago`
    return `${label.toLowerCase()} ${ageLabel}`
  })
  const fitPct = Math.round(icpFitRatio * 100)
  const stackNote = contributingEvents.length >= 2 ? ' — stacked signals' : ''

  if (cappedByWeakSignal) {
    return `Weak signal only (${parts.join(' + ')}), ICP fit ${fitPct}% — not enough on its own to read as buying intent.`
  }
  const label = classification === 'high_intent' ? 'High intent' : classification === 'warm' ? 'Warm' : 'Low intent'
  return `${label}: ${parts.join(' + ')}${stackNote}, ICP fit ${fitPct}%${qualifies ? '' : ' (below high-intent threshold)'}.`
}

// Pure function — computes a score from a lead snapshot + its signal
// events + an ICP, without touching the DB. Exported mainly for testing;
// recomputeScore() is the DB-aware entry point routes should call.
export function scoreLead({ lead, icp, events, config = DEFAULT_CONFIG, now = new Date() }) {
  const { icpFitRatio, icpFitScore, titleMatch, locationMatch } = computeIcpFit(lead, icp, config)

  const windowMs = config.stackingWindowDays * 24 * 60 * 60 * 1000
  const withinWindow = (events || []).filter((e) => {
    const createdAt = new Date(e.created_at || e.createdAt).getTime()
    return Number.isFinite(createdAt) && (now.getTime() - createdAt) <= windowMs
  })

  const enriched = withinWindow.map((e) => {
    const createdAt = new Date(e.created_at || e.createdAt).getTime()
    const ageDays = Math.max(0, (now.getTime() - createdAt) / (24 * 60 * 60 * 1000))
    const { tier, points } = classifyEvent(e, config)
    return { ...e, tier, points, ageDays, decayed: decay(points, ageDays, config.decayHalfLifeDays) }
  })

  // Stacking: group by type so repeated same-type events (e.g. 5 likes)
  // don't just linearly add up — the strongest one counts in full, the
  // rest count at half weight.
  const byType = new Map()
  for (const e of enriched) {
    if (!byType.has(e.type)) byType.set(e.type, [])
    byType.get(e.type).push(e)
  }
  let signalScore = 0
  for (const group of byType.values()) {
    const sorted = [...group].sort((a, b) => b.decayed - a.decayed)
    const [strongest, ...rest] = sorted
    signalScore += strongest.decayed + 0.5 * rest.reduce((sum, e) => sum + e.decayed, 0)
  }
  signalScore = Math.min(100, signalScore)

  let finalScoreRaw = signalScore * config.signalScoreRatio + icpFitRatio * 100 * config.icpFitScoreRatio

  const preCapScore = finalScoreRaw
  finalScoreRaw = applyWeakSignalCap(finalScoreRaw, enriched, icpFitRatio, config)
  const cappedByWeakSignal = finalScoreRaw < preCapScore

  const score = Math.max(0, Math.min(100, Math.round(finalScoreRaw)))
  const qualifies = qualifiesForHighIntent(enriched, icpFitRatio, config)

  const c = config.classification
  let classification
  if (score >= c.highThreshold) classification = qualifies ? 'high_intent' : 'warm'
  else if (score >= c.warmThreshold) classification = 'warm'
  else classification = 'low_intent'

  const conf = config.confidence
  const confidence = Math.max(0, Math.min(100,
    conf.base + enriched.length * conf.perSignal + (icpFitRatio >= conf.fitBonusThreshold ? conf.fitBonus : 0)
  ))

  const reason = buildReason({ contributingEvents: enriched, icpFitRatio, qualifies, classification, cappedByWeakSignal })

  const breakdown = {
    icpFit: { titleMatch, locationMatch, icpFitScore, icpFitRatio },
    // createdAt/metadata (e.g. metadata.postUrl) let the Signal Feed render
    // a source link + date detected per contributing signal without a
    // separate join back to signal_events.
    signals: enriched.map((e) => ({
      id: e.id, type: e.type, tier: e.tier, rawPoints: e.points,
      decayedPoints: Math.round(e.decayed * 10) / 10, ageDays: Math.round(e.ageDays * 10) / 10,
      createdAt: e.created_at, metadata: e.metadata || {}, signal: e.signal || null,
    })),
    signalScore: Math.round(signalScore * 10) / 10,
    weakOnly: enriched.length > 0 && enriched.every((e) => e.tier === 'weak'),
    qualifiesForHighIntent: qualifies,
    cappedByWeakSignal,
    finalScore: score,
  }

  return { score, classification, confidence, reason, breakdown, signalCount: enriched.length }
}

// DB-aware entry point: loads signal_events + agent ICP + workspace config,
// scores, and upserts into signal_scores. Call this after inserting new
// signal_events for a (agent_id, provider_id) pair.
export async function recomputeScore({ workspaceId, agentId, providerId, leadSnapshot = {} }) {
  if (!supabase || !agentId || !providerId) return null

  const [{ data: agent }, { data: events }, config] = await Promise.all([
    supabase.from('agents').select('icp').eq('id', agentId).maybeSingle(),
    supabase.from('signal_events').select('*').eq('agent_id', agentId).eq('provider_id', providerId).order('created_at', { ascending: false }),
    loadScoringConfig(workspaceId),
  ])

  const lead = {
    title: leadSnapshot.title, location: leadSnapshot.location,
  }
  // Fall back to the most recent event's lead_name/company for display —
  // signal_events don't carry title/location today, so ICP fit only uses
  // whatever the caller passed in leadSnapshot for this recompute.
  const latestEvent = events?.[0]

  const result = scoreLead({ lead, icp: agent?.icp || {}, events: events || [], config, now: new Date() })

  const { data: existing } = await supabase
    .from('signal_scores').select('id, status, status_updated_at, classification')
    .eq('agent_id', agentId).eq('provider_id', providerId).maybeSingle()

  // A dismissed/not-relevant lead should stay hidden from the feed until a
  // signal newer than the dismissal itself lands — otherwise every
  // recompute (including ones triggered by the same stale event set) would
  // do nothing, which is correct, but a genuinely new signal should
  // resurface it rather than staying silently hidden forever.
  let status = existing?.status || 'new'
  const latestEventAt = events?.[0]?.created_at
  if (existing && ['dismissed', 'not_relevant'].includes(existing.status) &&
      existing.status_updated_at && latestEventAt &&
      new Date(latestEventAt) > new Date(existing.status_updated_at)) {
    status = 'new'
  }

  const row = {
    workspace_id: workspaceId || 'ws_default',
    agent_id: agentId,
    provider_id: providerId,
    lead_name: leadSnapshot.leadName || latestEvent?.lead_name || null,
    company: leadSnapshot.company || latestEvent?.company || null,
    title: leadSnapshot.title || null,
    location: leadSnapshot.location || null,
    linkedin_url: leadSnapshot.linkedinUrl || null,
    profile_picture_url: leadSnapshot.profilePictureUrl || null,
    score: result.score,
    classification: result.classification,
    confidence: result.confidence,
    reason: result.reason,
    breakdown: result.breakdown,
    signal_count: result.signalCount,
    last_evaluated_at: new Date().toISOString(),
    status,
  }

  const { data, error } = await supabase
    .from('signal_scores')
    .upsert(existing ? { id: existing.id, ...row } : { id: `score_${randomUUID().slice(0, 8)}`, ...row }, { onConflict: 'agent_id,provider_id' })
    .select()
    .single()

  if (error) {
    console.error('[signalScoring] failed to upsert signal_scores:', error.message)
    return null
  }

  // Auto-enroll trigger: fire only on the transition *into* a higher tier,
  // not on every recompute while already there — otherwise a lead sitting
  // at high_intent would re-enqueue a job on every subsequent weak signal.
  // Queue enqueue is fire-and-forget so a slow/unavailable Redis never adds
  // latency to (or fails) the scoring call itself; requireRedis() throws
  // synchronously if REDIS_URL isn't set, so skip the check entirely in
  // that case rather than let campaignQueue.getQueue() throw here (Redis
  // is optional for scoring — it's only required for campaign sending).
  const newRank = classificationRank(result.classification)
  if (process.env.REDIS_URL && newRank > 0 && newRank > classificationRank(existing?.classification)) {
    enqueueAutoEnroll({ workspaceId: workspaceId || 'ws_default', agentId, providerId }).catch(err => {
      console.error('[signalScoring] enqueueAutoEnroll failed:', err.message)
    })
  }

  return data
}

export async function getScore(agentId, providerId) {
  if (!supabase || !agentId || !providerId) return null
  const { data } = await supabase.from('signal_scores').select('*').eq('agent_id', agentId).eq('provider_id', providerId).maybeSingle()
  return data || null
}

export async function listScoresForAgent(agentId, workspaceId) {
  if (!supabase || !agentId) return []
  let query = supabase.from('signal_scores').select('*').eq('agent_id', agentId).order('score', { ascending: false })
  if (workspaceId && workspaceId !== 'ws_default') query = query.eq('workspace_id', workspaceId)
  const { data, error } = await query
  if (error) {
    console.error('[signalScoring] listScoresForAgent failed:', error.message)
    return []
  }
  return data || []
}

// Batch lookup used by the campaign-entry gate and campaign_leads score
// display — one query for many provider_ids instead of N+1.
export async function getScoresForProviderIds(agentId, providerIds) {
  if (!supabase || !agentId || !providerIds?.length) return {}
  const { data, error } = await supabase
    .from('signal_scores').select('*').eq('agent_id', agentId).in('provider_id', providerIds)
  if (error) {
    console.error('[signalScoring] getScoresForProviderIds failed:', error.message)
    return {}
  }
  const byProviderId = {}
  for (const row of data || []) byProviderId[row.provider_id] = row
  return byProviderId
}
