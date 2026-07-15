import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSignalVars } from '../src/services/signalScoring.js'

test('buildSignalVars with no score row returns all-empty deterministic defaults', () => {
  const vars = buildSignalVars(null, { linkedin_url: 'https://linkedin.com/in/jane' })
  assert.deepEqual(vars, {
    signalType: '',
    signalSummary: '',
    triggerReason: '',
    recentPostTopic: '',
    painPoint: '',
    companySignal: '',
    sourceUrl: 'https://linkedin.com/in/jane',
  })
})

test('buildSignalVars never returns a personalizedOpening key — that AI-generated-opening path is removed', () => {
  const vars = buildSignalVars({ reason: 'test', breakdown: { signals: [] } }, {})
  assert.equal('personalizedOpening' in vars, false)
})

test('buildSignalVars is a pure function of scoreRow + lead — no AI/network calls', () => {
  const scoreRow = {
    reason: 'Changed jobs recently',
    breakdown: { signals: [{ type: 'job_change', decayedPoints: 10, metadata: {} }] },
  }
  const a = buildSignalVars(scoreRow, { linkedin_url: 'https://linkedin.com/in/x' })
  const b = buildSignalVars(scoreRow, { linkedin_url: 'https://linkedin.com/in/x' })
  assert.deepEqual(a, b)
  assert.equal(a.signalType, 'Job Change')
  assert.equal(a.signalSummary, 'Changed jobs recently')
})
