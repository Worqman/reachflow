import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { withAccountLock } from '../src/services/accountLock.js'
import { redis } from '../src/services/redis.js'

// Requires a real Redis (REDIS_URL) — accountLock talks to Redis directly,
// there's no in-memory fallback (see services/redis.js). Skips cleanly if
// Redis isn't configured, matching how other tests in this repo skip when
// their backing service isn't available.
const hasRedis = !!process.env.REDIS_URL

// The shared ioredis connection (services/redis.js) stays open indefinitely
// by design (it's meant to live for the process's whole lifetime) — close it
// here so `node --test` can exit instead of hanging on an open socket.
after(async () => { await redis?.quit() })

test('withAccountLock serializes two concurrent callers on the same account', { skip: !hasRedis && 'REDIS_URL not set' }, async () => {
  const order = []
  let inside = 0

  async function job(label) {
    return withAccountLock('acct-serialize-test', async () => {
      inside++
      assert.equal(inside, 1, 'a second caller must not enter while the first still holds the lock')
      order.push(`${label}-start`)
      await new Promise(resolve => setTimeout(resolve, 150))
      order.push(`${label}-end`)
      inside--
    })
  }

  await Promise.all([job('a'), job('b')])

  // Whichever ran first, it must fully finish (both start and end) before
  // the other starts — that's what "serialized" means here.
  assert.deepEqual(order.slice(0, 2), [order[0], `${order[0].split('-')[0]}-end`])
})

test('withAccountLock lets two different accounts run concurrently', { skip: !hasRedis && 'REDIS_URL not set' }, async () => {
  let concurrentPeak = 0
  let active = 0

  async function job(accountId) {
    return withAccountLock(accountId, async () => {
      active++
      concurrentPeak = Math.max(concurrentPeak, active)
      await new Promise(resolve => setTimeout(resolve, 100))
      active--
    })
  }

  await Promise.all([job('acct-a'), job('acct-b')])
  assert.equal(concurrentPeak, 2, 'locks on different accounts should not block each other')
})

test('withAccountLock times out and throws if the lock stays held past waitMs', { skip: !hasRedis && 'REDIS_URL not set' }, async () => {
  const holder = withAccountLock('acct-timeout-test', () => new Promise(resolve => setTimeout(resolve, 500)))

  await assert.rejects(
    () => withAccountLock('acct-timeout-test', async () => {}, { waitMs: 100, pollMs: 20 }),
    /Timed out waiting for LinkedIn account/,
  )

  await holder
})

test('withAccountLock releases the lock after fn throws, so the next caller can proceed', { skip: !hasRedis && 'REDIS_URL not set' }, async () => {
  await assert.rejects(
    withAccountLock('acct-release-on-error-test', async () => { throw new Error('boom') }),
    /boom/,
  )

  // If the lock wasn't released, this would time out.
  let ran = false
  await withAccountLock('acct-release-on-error-test', async () => { ran = true }, { waitMs: 500 })
  assert.ok(ran)
})
