import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAiTakeOver, isProspectMessage } from '../src/services/replyTakeover.js'

test('isProspectMessage: true for is_sender 0 or false', () => {
  assert.equal(isProspectMessage({ is_sender: 0 }), true)
  assert.equal(isProspectMessage({ is_sender: false }), true)
})

test('isProspectMessage: false for is_sender 1 or true (our own message)', () => {
  assert.equal(isProspectMessage({ is_sender: 1 }), false)
  assert.equal(isProspectMessage({ is_sender: true }), false)
})

test('isProspectMessage: false for missing/undefined message', () => {
  assert.equal(isProspectMessage(undefined), false)
  assert.equal(isProspectMessage({}), false)
})

test('canAiTakeOver: only true when prospect sent the latest message and AI is not paused', () => {
  assert.equal(canAiTakeOver({ isFromProspect: true, aiPaused: false }), true)
})

test('canAiTakeOver: false when the latest message is ours, even if AI is unpaused — AI never initiates', () => {
  assert.equal(canAiTakeOver({ isFromProspect: false, aiPaused: false }), false)
})

test('canAiTakeOver: false when AI is paused, even if the prospect just replied', () => {
  assert.equal(canAiTakeOver({ isFromProspect: true, aiPaused: true }), false)
})

test('canAiTakeOver: false when both conditions fail', () => {
  assert.equal(canAiTakeOver({ isFromProspect: false, aiPaused: true }), false)
})
