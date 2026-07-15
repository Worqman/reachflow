// ── Durable campaign-sequence queue ─────────────────────────────
// BullMQ-backed replacement for the old in-process IIFE + setTimeout
// timers in routes/campaigns.js. One queue, three job kinds:
//
//   send-batch          — advances one campaign's pending-lead invite
//                          chain. Uses job.moveToDelayed (see below)
//                          to pace itself between leads instead of
//                          completing and re-adding a new job — this
//                          keeps a single, stable jobId
//                          (`send-batch:${campaignId}`) alive for the
//                          whole chain, which is both the durability
//                          mechanism (the delayed job survives a
//                          restart in Redis) and the dedup mechanism
//                          (a second `send-invites` call for the same
//                          campaign sees the existing job and no-ops —
//                          replaces the old in-process _runningCampaigns
//                          Set, but works across process restarts and,
//                          if this is ever run with multiple backend
//                          instances, across instances too).
//   resume-pending-step — wait/reply-timeout resumption (was a raw
//                          setTimeout) and webhook-triggered reply
//                          resumption.
//   post-connection     — webhook-triggered post-connection sequence
//                          steps (new_relation).
//
// Processors are wired up via a lazy `import('../routes/campaigns.js')`
// inside the worker callback rather than a static top-level import —
// campaigns.js statically imports the enqueue helpers below, so a
// static import here would be circular. This mirrors the dynamic
// `import()` pattern already used elsewhere in this codebase (e.g.
// campaigns.js's own `await import('../webhooks/unipile.js')`) to
// break the same kind of cycle.
import { Queue, Worker, DelayedError } from 'bullmq'
import { requireRedis } from './redis.js'

const QUEUE_NAME = 'campaign-sequence'

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
}

const ACTIVE_STATES = new Set(['waiting', 'active', 'delayed', 'waiting-children', 'prioritized'])

let queue = null
let worker = null

function getQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: requireRedis() })
  return queue
}

// BullMQ rejects custom jobIds containing ':' (reserved as its own Redis-key
// separator) — use '_' instead.
function sendBatchJobId(campaignId) {
  return `send-batch_${campaignId}`
}

// True if a send-batch chain is already live for this campaign.
export async function isSendBatchRunning(campaignId) {
  const job = await getQueue().getJob(sendBatchJobId(campaignId))
  if (!job) return false
  return ACTIVE_STATES.has(await job.getState())
}

// Starts a send-batch chain. No-ops (returns the existing job) if one
// is already running for this campaign — call isSendBatchRunning()
// first if the caller needs to distinguish "started" from "already
// running" for its own response.
export async function enqueueSendBatch(campaignId, workspaceId) {
  return getQueue().add('send-batch', { campaignId, workspaceId }, {
    ...JOB_OPTS,
    jobId: sendBatchJobId(campaignId),
  })
}

// jobId defaults to the pending_step's claimId when given — dedupes
// against the scheduler's resumePendingSteps backstop picking up the
// same deadline independently.
export async function enqueueResumePendingStep(providerUserId, campaignId, { outcome = null, claimId = null, delayMs = 0 } = {}) {
  return getQueue().add('resume-pending-step', { providerUserId, campaignId, outcome }, {
    ...JOB_OPTS,
    ...(claimId ? { jobId: `resume_${claimId}` } : {}),
    delay: delayMs,
  })
}

export async function enqueuePostConnection({ providerUserId, accountId, campaignId, workspaceId }) {
  return getQueue().add('post-connection', { providerUserId, accountId, campaignId, workspaceId }, JOB_OPTS)
}

// Lightweight status read for GET /api/campaigns/:id/queue-status.
export async function getCampaignQueueStatus(campaignId) {
  const job = await getQueue().getJob(sendBatchJobId(campaignId))
  if (!job) return { state: 'none' }
  const state = await job.getState()
  const delay = job.opts?.delay || 0
  return {
    state,
    delayMs: delay,
    nextRunAt: state === 'delayed' ? new Date(job.timestamp + delay).toISOString() : null,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason || null,
  }
}

export function startCampaignQueueWorker() {
  if (worker) return worker

  const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '') || 10

  worker = new Worker(QUEUE_NAME, async (job, token) => {
    const campaigns = await import('../routes/campaigns.js')

    switch (job.name) {
      case 'send-batch': {
        const { campaignId, workspaceId } = job.data
        // processSendBatchJob processes exactly one lead and returns
        // either the delay (ms) until the next lead should be
        // attempted, or null once the chain has nothing left to do.
        const nextDelayMs = await campaigns.processSendBatchJob(campaignId, workspaceId)
        if (nextDelayMs != null) {
          await job.moveToDelayed(Date.now() + nextDelayMs, token)
          throw new DelayedError()
        }
        return
      }
      case 'resume-pending-step': {
        const { providerUserId, campaignId, outcome } = job.data
        await campaigns.resumeFromPendingStep(providerUserId, campaignId, outcome)
        return
      }
      case 'post-connection': {
        const { providerUserId, accountId, campaignId, workspaceId } = job.data
        await campaigns.executePostConnectionSteps(providerUserId, accountId, campaignId, workspaceId)
        return
      }
      default:
        console.warn(`[campaign-queue] unknown job name: ${job.name}`)
    }
  }, { connection: requireRedis(), concurrency })

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) return // expected — send-batch pacing itself, not a real failure
    console.error(`[campaign-queue] job ${job?.id} (${job?.name}) failed:`, err.message)
  })

  console.log(`[campaign-queue] worker started — concurrency=${concurrency}`)
  return worker
}

export async function closeCampaignQueue() {
  await worker?.close()
  await queue?.close()
}
