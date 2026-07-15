// ── Per-LinkedIn-account send lock ──────────────────────────────
// Serializes every outbound LinkedIn action (connection requests,
// messages, profile visits, likes, follows, comments) for a given
// account, no matter which code path triggers it — a queued campaign
// job, a wait/reply resume, a webhook-driven post-connection walk, or
// a manual send from routes/unipile.js. Without this, two concurrent
// callers for the same account can both pass a daily-limit check
// before either actually sends, exceeding the account's real limit —
// exactly the TOCTOU race accountSafety.js's checks are meant to
// prevent, just closed here at the point where the checks and the
// send actually need to be atomic together.
//
// Implemented as a plain Redis SET NX PX lock (not Redlock/multi-node
// quorum — a single Redis instance is what this project runs, so the
// added complexity isn't warranted). Held only around a check-then-act
// window that's normally a single Unipile API round-trip plus a
// couple of Supabase queries — seconds, not minutes.
import { randomUUID } from 'crypto'
import { requireRedis } from './redis.js'

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Runs `fn` while holding the lock for `accountId`. Blocks (polling)
// until the lock is free or `waitMs` elapses, in which case it throws
// — callers on the campaign-send path already treat a thrown error as
// a transient failure and leave the lead 'pending' for retry.
export async function withAccountLock(accountId, fn, { waitMs = 60_000, pollMs = 1_000, ttlMs = 30_000 } = {}) {
  const redis = requireRedis()
  const key = `lock:account:${accountId}`
  const token = randomUUID()
  const deadline = Date.now() + waitMs

  while (true) {
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX')
    if (acquired) break
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for LinkedIn account ${accountId} to become free for sending`)
    }
    await sleep(pollMs)
  }

  try {
    return await fn()
  } finally {
    await redis.eval(RELEASE_SCRIPT, 1, key, token).catch(err => {
      console.error(`[accountLock] release failed for ${accountId}:`, err.message)
    })
  }
}
