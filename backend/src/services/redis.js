import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL

let redis = null

if (!REDIS_URL) {
  console.warn('⚠️  Redis not configured. Set REDIS_URL in backend/.env — campaign sending (BullMQ queue + account lock) will not work without it.')
} else {
  // maxRetriesPerRequest: null is required by BullMQ's blocking connections
  // (Worker/QueueEvents) — without it ioredis gives up on commands that are
  // meant to block indefinitely.
  redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  redis.on('error', (err) => console.error('[redis] connection error:', err.message))
  // Idle connections shouldn't be what keeps a process alive — the running
  // server already stays up via its own HTTP listener, and this stops an
  // otherwise-idle Redis socket from hanging short-lived scripts/tests that
  // happen to import a module which pulls this file in without ever
  // actually using Redis.
  redis.on('connect', () => redis.stream?.unref?.())
}

// Same nullable-singleton shape as services/supabase.js — callers check
// truthiness where Redis is optional, or go through requireRedis() where
// it's load-bearing (queue enqueue, account lock).
export { redis }

export function requireRedis() {
  if (!redis) throw new Error('Redis is not configured (REDIS_URL missing) — required for campaign sending')
  return redis
}
