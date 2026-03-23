import { useEffect, useRef, useState } from 'react'
import { unipile } from '../lib/api'
import './Inbox.css'

const STATUS_META = {
  review: { label: 'Needs Review', class: 'badge-warning' },
  ai:     { label: 'AI Active',    class: 'badge-signal'  },
  booked: { label: 'Booked',       class: 'badge-info'    },
}

function chatToConversation(chat) {
  const prospect = chat.attendees?.find(a => !a.is_me)
  const name = prospect?.name || 'Unknown'
  const company = prospect?.headline || ''
  const preview = chat.last_message?.text || ''
  const time = chat.last_message?.created_at
    ? formatRelativeTime(chat.last_message.created_at)
    : ''
  return {
    id: chat.id,
    accountId: chat.account_id,
    name,
    company,
    preview,
    time,
    status: chat.unread_count > 0 ? 'review' : 'ai',
    unread: chat.unread_count > 0,
    providerId: prospect?.provider_id,
  }
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function messageFrom(msg, myAccountId) {
  if (msg.is_me) return 'ai'
  return 'prospect'
}

export default function Inbox() {
  const [conversations, setConversations] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [filter, setFilter] = useState('all')
  const [aiPaused, setAiPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  // Load chats on mount
  useEffect(() => {
    async function loadChats() {
      setLoading(true)
      setError('')
      try {
        const data = await unipile.getChats()
        const items = data?.items || []
        setConversations(items.map(chatToConversation))
      } catch (err) {
        setError(err.message || 'Failed to load conversations')
      } finally {
        setLoading(false)
      }
    }
    loadChats()
  }, [])

  // Load messages when active conversation changes
  useEffect(() => {
    if (!active) return
    async function loadMessages() {
      setLoadingMessages(true)
      try {
        const data = await unipile.getMessages(active.id)
        const items = (data?.items || []).map(m => ({
          id: m.id,
          from: messageFrom(m, active.accountId),
          text: m.text || '',
          time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        }))
        setMessages(items)
      } catch (err) {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
    loadMessages()
  }, [active?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!reply.trim() || !active) return
    setSending(true)
    try {
      await unipile.sendChatMessage(active.id, reply.trim())
      setMessages(prev => [...prev, {
        id: Date.now(),
        from: 'ai',
        text: reply.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
      setReply('')
    } catch (err) {
      // keep text so user can retry
    } finally {
      setSending(false)
    }
  }

  const filtered = filter === 'all'
    ? conversations
    : conversations.filter(c => c.status === filter)

  const needsReview = conversations.filter(c => c.status === 'review').length

  return (
    <div className="inbox-layout">
      {/* Left: conversation list */}
      <div className="inbox-list">
        <div className="inbox-list-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Inbox</h2>
          {needsReview > 0 && (
            <span className="badge badge-warning">{needsReview} need review</span>
          )}
        </div>
        <div className="inbox-filters">
          {['all', 'ai', 'review', 'booked'].map(f => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_META[f]?.label || f}
            </button>
          ))}
        </div>

        <div className="conv-list">
          {loading ? (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading conversations…
            </div>
          ) : error ? (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: 'var(--danger, #e55)' }}>{error}</div>
              <div>Add UNIPILE_API_KEY and UNIPILE_DSN to your .env file.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              No conversations found.
            </div>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                className={`conv-item ${active?.id === c.id ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
                onClick={() => setActive(c)}
              >
                <div className="conv-avatar">{c.name[0]}</div>
                <div className="conv-info">
                  <div className="conv-name-row">
                    <span className="conv-name">{c.name}</span>
                    <span className="conv-time">{c.time}</span>
                  </div>
                  <div className="conv-company">{c.company}</div>
                  <div className="conv-preview">{c.preview}</div>
                </div>
                <span
                  className={`badge ${STATUS_META[c.status]?.class || 'badge-muted'}`}
                  style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {c.status === 'ai' ? '◆' : c.status === 'review' ? '!' : '✓'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: thread */}
      {active ? (
        <div className="inbox-thread">
          {/* Thread header */}
          <div className="thread-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="conv-avatar" style={{ width: 40, height: 40, fontSize: 16 }}>
                {active.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{active.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{active.company}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className={`btn btn-sm ${aiPaused ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAiPaused(p => !p)}
              >
                {aiPaused ? '▶ Resume AI' : '⏸ Pause AI'}
              </button>
              <button className="btn btn-sm btn-secondary">Meeting Booked</button>
            </div>
          </div>

          {/* Messages */}
          <div className="thread-messages">
            {loadingMessages ? (
              <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                No messages yet.
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`message-wrap ${m.from}`}>
                  {m.from === 'ai' && (
                    <div className="message-sender-label">
                      <span className="badge badge-signal" style={{ fontSize: 10 }}>◆ AI</span>
                    </div>
                  )}
                  <div className={`message-bubble ${m.from}`}>{m.text}</div>
                  <div className="message-time">{m.time}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          <div className="thread-input">
            {aiPaused ? (
              <>
                <textarea
                  className="input"
                  placeholder="Type your reply..."
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={3}
                  style={{ resize: 'none' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAiPaused(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!reply.trim() || sending}
                    onClick={handleSend}
                  >
                    {sending ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </>
            ) : (
              <div className="ai-handling">
                <div className="signal-dot" />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  AI Assistant is handling this conversation
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setAiPaused(true)}>
                  Take over
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="inbox-empty">
          <div className="empty-state">
            <div className="empty-icon">✉</div>
            <h3>Select a conversation</h3>
            <p>Choose a conversation from the list to view the thread</p>
          </div>
        </div>
      )}
    </div>
  )
}
