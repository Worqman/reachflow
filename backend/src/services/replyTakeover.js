// ── Campaign reply takeover rule ─────────────────────────────────
// Single source of truth for "is the AI allowed to write outbound text right
// now". Product rule: the AI never initiates a conversation — every campaign
// sequence step (connection note, message, InMail) is sent verbatim from
// what the user wrote in the builder. The AI only takes over a conversation
// once the prospect has sent the most recent message.
//
// Four independent paths can trigger a reply (webhook message_received,
// POST /conversations/:id/sync, the scheduler's syncAIConversations poll,
// and POST /campaigns/:id/sync-messages) — each polling Unipile or receiving
// events slightly differently. Centralizing the gate here means they can't
// drift from each other or from this rule. See replyTakeover.test.js.

// Unipile's chat-message list marks the account holder's own messages with
// is_sender: 1/true; the prospect's messages are 0/false.
export function isProspectMessage(unipileMsg) {
  return unipileMsg?.is_sender === 0 || unipileMsg?.is_sender === false
}

// The only condition under which the AI may generate/schedule a reply.
export function canAiTakeOver({ isFromProspect, aiPaused }) {
  return !!isFromProspect && !aiPaused
}
