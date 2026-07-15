import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConnectionDelayRange, randomDelayMs, SENDING_DELAY_PRESETS } from '../src/routes/campaigns.js'

test('resolveConnectionDelayRange falls back to the normal preset (15-20) when unconfigured — matches the old hardcoded default', () => {
  assert.deepEqual(resolveConnectionDelayRange({}), SENDING_DELAY_PRESETS.normal)
  assert.deepEqual(resolveConnectionDelayRange(undefined), SENDING_DELAY_PRESETS.normal)
  assert.deepEqual(resolveConnectionDelayRange({ sendingDelay: {} }), SENDING_DELAY_PRESETS.normal)
})

test('resolveConnectionDelayRange respects a configured min/max', () => {
  assert.deepEqual(
    resolveConnectionDelayRange({ sendingDelay: { min: 5, max: 10 } }),
    { min: 5, max: 10 },
  )
})

test('resolveConnectionDelayRange repairs an inverted min/max instead of producing a broken range', () => {
  assert.deepEqual(
    resolveConnectionDelayRange({ sendingDelay: { min: 30, max: 10 } }),
    { min: 10, max: 30 },
  )
})

test('resolveConnectionDelayRange clamps non-numeric or negative values to a safe floor', () => {
  assert.deepEqual(
    resolveConnectionDelayRange({ sendingDelay: { min: -5, max: 'oops' } }),
    { min: 1, max: 20 },
  )
})

test('resolveConnectionDelayRange never returns a delay below the absolute safety floor', () => {
  const { min, max } = resolveConnectionDelayRange({ sendingDelay: { min: 0, max: 0 } })
  assert.ok(min >= 1)
  assert.ok(max >= min)
})

test('the warmup/normal/cautious presets are ordered from slowest to fastest and each is internally valid', () => {
  const { warmup, normal, cautious } = SENDING_DELAY_PRESETS
  for (const p of [warmup, normal, cautious]) assert.ok(p.min <= p.max)
  assert.ok(warmup.min > cautious.min, 'warmup should be more cautious (slower) than cautious mode')
  assert.ok(cautious.min > normal.min, 'cautious should be slower than normal')
})

test('randomDelayMs always lands within [min, max] minutes, inclusive of both ends over many draws', () => {
  const min = 15, max = 20
  const seen = new Set()
  for (let i = 0; i < 500; i++) {
    const ms = randomDelayMs(min, max)
    assert.ok(ms >= min * 60 * 1000)
    assert.ok(ms <= max * 60 * 1000)
    assert.equal(ms % 60000, 0, 'should be a whole number of minutes')
    seen.add(ms / 60000)
  }
  // With 500 draws over a 6-value range (15..20), every value should appear.
  assert.deepEqual([...seen].sort((a, b) => a - b), [15, 16, 17, 18, 19, 20])
})

test('randomDelayMs handles min === max (fixed delay, no configured range)', () => {
  assert.equal(randomDelayMs(10, 10), 10 * 60 * 1000)
})
