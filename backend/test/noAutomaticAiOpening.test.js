// Structural regression guard for the "AI never sends the first message"
// product rule. Rather than mocking Supabase/Unipile/Anthropic to exercise
// runNode() end-to-end, this asserts directly on the shipped source: the
// functions that run before a prospect has replied (runNode — which handles
// every sequence step type including message/message_open/inmail — and
// handleNewConnection, the connection-accepted entry point) must never
// reference the Anthropic client. If someone reintroduces an automatic
// AI-generated opening message, this fails loudly instead of silently.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const campaignsSrc = readFileSync(path.join(__dirname, '../src/routes/campaigns.js'), 'utf8')
const webhookSrc   = readFileSync(path.join(__dirname, '../src/webhooks/unipile.js'), 'utf8')

// Extracts the source of a top-level `async function <name>(...) { ... }`
// (or `function <name>`) by locating its signature and brace-matching to
// the closing `}`. Throws if the function can't be found, so a rename
// breaks the test loudly instead of the check silently passing on nothing.
function extractFunctionSource(source, functionName) {
  const sigMatch = source.match(new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`))
  if (!sigMatch) throw new Error(`Could not find function ${functionName} in source`)
  const start = sigMatch.index
  const braceStart = source.indexOf('{', start)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`Unbalanced braces extracting ${functionName}`)
}

test('runNode (handles every sequence step, incl. message/message_open/inmail) never calls the Anthropic client', () => {
  const runNodeSrc = extractFunctionSource(campaignsSrc, 'runNode')
  assert.doesNotMatch(runNodeSrc, /anthropic/i)
})

test('handleNewConnection (the connection-accepted entry point) never calls the Anthropic client', () => {
  const handleNewConnectionSrc = extractFunctionSource(webhookSrc, 'handleNewConnection')
  assert.doesNotMatch(handleNewConnectionSrc, /anthropic/i)
})

test('no route generates an AI opening message anymore', () => {
  assert.doesNotMatch(campaignsSrc, /generate-opening/)
  assert.doesNotMatch(campaignsSrc, /personalized_opening/)
  assert.doesNotMatch(campaignsSrc, /personalizedOpening/)
})

test('the only Anthropic call sites left in campaigns.js are user-triggered utilities, not sequence sends', () => {
  // fetchAndSummarizeProfile (lazy prospect brief, cached) and the
  // generate-message AI-writer endpoint (user clicks "Generate"). Neither
  // sends anything to a prospect by itself.
  const callSites = [...campaignsSrc.matchAll(/anthropic\.messages\.create/g)]
  assert.equal(callSites.length, 2, `expected exactly 2 anthropic.messages.create call sites in campaigns.js, found ${callSites.length}`)

  const fetchAndSummarizeProfileSrc = extractFunctionSource(campaignsSrc, 'fetchAndSummarizeProfile')
  assert.match(fetchAndSummarizeProfileSrc, /anthropic\.messages\.create/)
})
