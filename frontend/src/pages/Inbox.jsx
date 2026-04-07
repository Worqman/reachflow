import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversations as conversationsApi,
  meetings as meetingsApi,
  unipile,
  agents as agentsApi,
} from "../lib/api";
import { setInboxUnreadCount } from "../lib/inboxState";
import "./Inbox.css";

const STATUS_META = {
  review: { label: "Needs Review", class: "badge-warning" },
  ai_active: { label: "AI Active", class: "badge-signal" },
  booked: { label: "Booked", class: "badge-info" },
};

const FILTER_STATUS = {
  ai: "ai_active",
  review: "review",
  booked: "booked",
};

function extractName(a) {
  if (!a) return null;
  return (
    a.name ||
    a.display_name ||
    a.displayName ||
    a.full_name ||
    a.fullName ||
    [a.first_name || a.firstName, a.last_name || a.lastName]
      .filter(Boolean)
      .join(" ") ||
    null
  );
}

// LinkedIn system/notification sender IDs — filter these out
const LINKEDIN_SYSTEM_IDS = new Set([
  "urn:li:organization:1337", // LinkedIn official
  "linkedin",
  "jobs",
]);

function chatToConversation(chat, backendConvMap) {
  // Unipile chat list uses a flat attendee_provider_id field, not an attendees array
  const personId = chat.attendee_provider_id;

  // Skip known LinkedIn system accounts
  if (personId && LINKEDIN_SYSTEM_IDS.has(personId)) return null;

  // Must have a person ID to identify this conversation
  if (!personId) return null;

  // Backend enrichment sets _enrichedName/_enrichedHeadline after profile lookup
  const name = chat._enrichedName || chat.name || "LinkedIn User";
  const company = chat._enrichedHeadline || "";
  const preview = chat.last_message?.text || chat.last_message?.content || "";
  const time = chat.last_message?.created_at
    ? formatRelativeTime(chat.last_message.created_at)
    : chat.updated_at
      ? formatRelativeTime(chat.updated_at)
      : "";
  const unread = (chat.unread_count || 0) > 0;

  const backend = backendConvMap[chat.id] || null;
  const status = backend?.status || "review";
  const aiPaused = backend?.aiPaused ?? true;

  return {
    id: chat.id,
    accountId: chat.account_id,
    name: name,
    company,
    preview,
    time,
    status,
    aiPaused,
    unread,
    convId: backend?.id || null,
    agentId: backend?.agentId || null,
    providerId: personId || null,
    bookedAt: backend?.bookedAt || null,
  };
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function messageFrom(msg) {
  // Unipile uses is_sender: 1 for messages sent by the connected account
  if (msg.is_sender === 1 || msg.is_sender === true) return "ai";
  return "prospect";
}

export default function Inbox() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const [agentPicker, setAgentPicker] = useState(false); // show agent picker modal
  const messagesEndRef = useRef(null);
  const accountIdRef = useRef(null);

  // Keep ref in sync so the interval can read current accountId
  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);

  const loadConversations = useCallback(async (accId, silent = false) => {
    if (!accId) return;
    if (!silent) setRefreshing(true);
    try {
      const [backendConvs, chatData, meetingsData] = await Promise.all([
        conversationsApi.list().catch(() => []),
        unipile.getChats(accId),
        meetingsApi.list().catch(() => []),
      ]);

      const backendMap = {};
      for (const c of backendConvs || []) {
        if (c.linkedinChatId) backendMap[c.linkedinChatId] = c;
      }

      // Build lookup maps from meetings for cross-referencing — scoped to current account
      const accountMeetings = (meetingsData || []).filter(
        (m) => !m.account_id || m.account_id === accId
      );
      const meetingByChatId = {};
      const meetingByName = {};
      for (const m of accountMeetings) {
        if (m.linkedin_chat_id) meetingByChatId[m.linkedin_chat_id] = m;
        if (m.prospect_name) {
          meetingByName[m.prospect_name.toLowerCase().trim()] = m;
        }
      }

      const items = chatData?.items || chatData?.objects || [];
      const merged = items
        .map((chat) => {
          const conv = chatToConversation(chat, backendMap);
          if (!conv) return null;
          // Cross-reference with meetings: match by chat ID or by prospect name
          const bookedMeeting =
            meetingByChatId[chat.id] ||
            meetingByName[conv.name.toLowerCase().trim()] ||
            null;
          if (bookedMeeting && conv.status !== "booked") {
            return {
              ...conv,
              status: "booked",
              aiPaused: true,
              bookedAt: bookedMeeting.booked_at || null,
            };
          }
          if (conv.status === "booked") {
            // Enrich with booked date if we have it
            const m =
              meetingByChatId[chat.id] ||
              accountMeetings.find(
                (mtg) =>
                  mtg.prospect_name?.toLowerCase().trim() ===
                  conv.name.toLowerCase().trim()
              );
            return { ...conv, bookedAt: m?.booked_at || conv.bookedAt || null };
          }
          return conv;
        })
        .filter(Boolean);
      setConversations(merged);
      setInboxUnreadCount(merged.filter((c) => c.unread).length);

      // If active conversation is open, refresh its messages quietly
      setActive((prev) => {
        if (!prev) return prev;
        const updated = merged.find((c) => c.id === prev.id);
        return updated ? { ...prev, ...updated } : prev;
      });
    } catch (err) {
      if (!silent) setError(err.message || "Failed to load conversations");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  // Initial load: get accounts then chats
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");
      try {
        const [accData, agentData] = await Promise.all([
          unipile.getAccounts(),
          agentsApi.list().catch(() => ({ items: [] })),
        ]);
        const accs = accData?.items || [];
        setAccounts(accs);
        setAgentsList(agentData?.items || agentData || []);
        const firstId = accs[0]?.id || null;
        setAccountId(firstId);
        if (!firstId) {
          setError(
            "No LinkedIn account connected. Go to Settings → Workspace.",
          );
          return;
        }
        await loadConversations(firstId);
      } catch (err) {
        setError(err.message || "Failed to load conversations");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Auto-refresh every 30s silently
  useEffect(() => {
    const interval = setInterval(() => {
      if (accountIdRef.current) loadConversations(accountIdRef.current, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  async function loadChatsForAccount(id) {
    setAccountId(id);
    setLoading(true);
    setError("");
    setActive(null);
    try {
      await loadConversations(id);
    } catch (err) {
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  function applyConvUpdate(chatId, patch) {
    setConversations((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
    );
    setActive((prev) => (prev?.id === chatId ? { ...prev, ...patch } : prev));
  }

  // Create backend conversation record and enable AI
  async function handleEnableAI(agentId) {
    if (!active || actionLoading) return;
    setActionLoading(true);
    setAgentPicker(false);
    try {
      let convId = active.convId;
      if (!convId) {
        // Create a new conversation record linking this chat to an agent
        const conv = await conversationsApi.create({
          linkedinChatId: active.id,
          linkedinAccountId: active.accountId,
          prospectId: active.providerId,
          agentId: agentId || agentsList[0]?.id || null,
        });
        convId = conv.id;
      } else {
        await conversationsApi.resumeAI(convId);
      }
      applyConvUpdate(active.id, {
        convId,
        aiPaused: false,
        status: "ai_active",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePauseAI() {
    if (!active || actionLoading) return;
    setActionLoading(true);
    try {
      if (active.convId) await conversationsApi.pauseAI(active.convId);
      applyConvUpdate(active.id, { aiPaused: true, status: "review" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkBooked() {
    if (!active || actionLoading) return;
    setActionLoading(true);
    try {
      let convId = active.convId;
      // Create conversation record if one doesn't exist yet
      if (!convId) {
        const conv = await conversationsApi.create({
          linkedinChatId: active.id,
          linkedinAccountId: active.accountId,
          prospectId: active.providerId,
          agentId: agentsList[0]?.id || null,
        });
        convId = conv.id;
      }
      await conversationsApi.markBooked(convId, { prospectName: active.name });
      applyConvUpdate(active.id, { convId, status: "booked", aiPaused: true });
    } finally {
      setActionLoading(false);
    }
  }

  // Keep a ref to active so the interval can read current AI state
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function loadMessages(silent = false) {
      if (!silent) setLoadingMessages(true);
      try {
        const data = await unipile.getMessages(active.id);
        if (cancelled) return;
        const items = (data?.items || data?.objects || [])
          .map((m) => ({
            id: m.id,
            from: messageFrom(m),
            text: m.text || m.content || "",
            time:
              m.timestamp || m.created_at
                ? new Date(m.timestamp || m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
          }))
          .reverse(); // Unipile returns newest-first; we want oldest-first
        setMessages(items);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled && !silent) setLoadingMessages(false);
      }
    }

    async function pollAndSync() {
      const current = activeRef.current;
      if (!current || cancelled) return;
      // If AI is active and conversation is tracked, sync to trigger AI replies
      if (!current.aiPaused && current.convId) {
        try {
          await conversationsApi.sync(current.convId);
        } catch {
          /* ignore */
        }
      }
      // Always reload messages to show any new ones (AI reply or prospect)
      await loadMessages(true);
    }

    loadMessages();
    // Poll every 10s: sync for AI reply triggering + refresh messages
    const interval = setInterval(pollAndSync, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!reply.trim() || !active) return;
    setSending(true);
    try {
      await unipile.sendChatMessage(active.id, reply.trim());
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          from: "ai",
          text: reply.trim(),
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      setReply("");
    } catch {
      // keep text so user can retry
    } finally {
      setSending(false);
    }
  }

  const filtered =
    filter === "all"
      ? conversations
      : conversations.filter(
          (c) => c?.status === (FILTER_STATUS[filter] || filter),
        );

  const needsReview = conversations.filter(
    (c) => c?.status === "review",
  ).length;
  const aiPaused = active?.aiPaused ?? true;

  return (
    <div className="inbox-layout">
      {/* Left: conversation list */}
      <div className="inbox-list">
        <div className="inbox-list-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Inbox</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {needsReview > 0 && (
              <span className="badge badge-warning">
                {needsReview} need review
              </span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 16, padding: "2px 6px" }}
              disabled={refreshing}
              onClick={() => accountId && loadConversations(accountId)}
              title="Refresh"
            >
              {refreshing ? "…" : "↻"}
            </button>
          </div>
        </div>

        {accounts.length > 1 && (
          <div style={{ padding: "0 12px 8px" }}>
            <select
              className="input"
              style={{
                fontSize: 12,
                padding: "4px 8px",
                height: "auto",
                cursor: "pointer",
              }}
              value={accountId || ""}
              onChange={(e) => loadChatsForAccount(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.username || a.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="inbox-filters">
          {["all", "ai", "review", "booked"].map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : STATUS_META[FILTER_STATUS[f]]?.label || f}
            </button>
          ))}
        </div>

        <div className="conv-list">
          {loading ? (
            <div
              style={{
                padding: "24px 16px",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Loading conversations…
            </div>
          ) : error ? (
            <div
              style={{
                padding: "16px",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              <div style={{ marginBottom: 4, color: "var(--danger, #e55)" }}>
                {error}
              </div>
              <div>Add UNIPILE_API_KEY and UNIPILE_DSN to your .env file.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No conversations found.
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className={`conv-item ${active?.id === c.id ? "active" : ""} ${c.unread ? "unread" : ""}`}
                onClick={() => setActive(c)}
              >
                <div className="conv-avatar">{c.name[0]?.toUpperCase()}</div>
                <div className="conv-info">
                  <div className="conv-name-row">
                    <span className="conv-name">{c.name}</span>
                    <span className="conv-time">{c.time}</span>
                  </div>
                  {c.company && <div className="conv-company">{c.company}</div>}
                  {c.preview && <div className="conv-preview">{c.preview}</div>}
                </div>
                <span
                  className={`badge ${STATUS_META[c.status]?.class || "badge-muted"}`}
                  style={{
                    flexShrink: 0,
                    alignSelf: "flex-start",
                    marginTop: 4,
                  }}
                >
                  {c.status === "ai_active"
                    ? "◆"
                    : c.status === "review"
                      ? "!"
                      : "✓"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: thread */}
      {active ? (
        <div className="inbox-thread">
          <div className="thread-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                className="conv-avatar"
                style={{ width: 40, height: 40, fontSize: 16 }}
              >
                {active.name[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {active.name}
                </div>
                {active.company && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {active.company}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* {active.status !== "booked" &&
                (aiPaused ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={actionLoading}
                    onClick={() => {
                      if (agentsList.length > 1) setAgentPicker(true);
                      else handleEnableAI(agentsList[0]?.id);
                    }}
                  >
                    ◆ Enable AI
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={actionLoading}
                    onClick={handlePauseAI}
                  >
                    ⏸ Pause AI
                  </button>
                ))} */}
              {active.status !== "booked" ? (
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={actionLoading}
                  onClick={handleMarkBooked}
                >
                  ✓ Meeting Booked
                </button>
              ) : (
                <span className="badge badge-info">✓ Booked</span>
              )}
            </div>
          </div>

          {active.status === "ai_active" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                background: "var(--surface-2, #1a1f2e)",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <div className="signal-dot" style={{ width: 7, height: 7 }} />
              <span>
                AI Assistant is handling this conversation autonomously
              </span>
            </div>
          )}

          {active.status === "booked" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                background: "rgba(99,102,241,.08)",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>
                ✓ Meeting booked
                {active.bookedAt
                  ? ` on ${new Date(active.bookedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                  : ""}
                {" — conversation complete"}
              </span>
            </div>
          )}

          <div className="thread-messages">
            {loadingMessages ? (
              <div
                style={{
                  padding: 24,
                  color: "var(--text-muted)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  color: "var(--text-muted)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                No messages yet.
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`message-wrap ${m.from}`}>
                  {m.from === "ai" && (
                    <div className="message-sender-label">
                      <span
                        className="badge badge-signal"
                        style={{ fontSize: 10 }}
                      >
                        ◆ AI
                      </span>
                    </div>
                  )}
                  <div className={`message-bubble ${m.from}`}>{m.text}</div>
                  <div className="message-time">{m.time}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="thread-input">
            {aiPaused && active.status !== "booked" ? (
              <>
                <textarea
                  className="input"
                  placeholder="Type your reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  style={{ resize: "none" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      handleSend();
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      handleEnableAI(active.agentId || agentsList[0]?.id)
                    }
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!reply.trim() || sending}
                    onClick={handleSend}
                  >
                    {sending ? "Sending…" : "Send Reply"}
                  </button>
                </div>
              </>
            ) : (
              <div className="ai-handling">
                <div className="signal-dot" />
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {active.status === "booked"
                    ? "Conversation complete — meeting booked"
                    : "AI Assistant is handling this conversation"}
                </span>
                {active.status !== "booked" && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={actionLoading}
                    onClick={handlePauseAI}
                  >
                    Take over
                  </button>
                )}
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

      {/* Agent picker modal — shown when user clicks Enable AI and has multiple agents */}
      {agentPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="card"
            style={{
              width: 360,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>Select AI Agent</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Choose which agent will handle this conversation:
            </div>
            {agentsList.map((a) => (
              <button
                key={a.id}
                className="btn btn-secondary"
                style={{ justifyContent: "flex-start" }}
                onClick={() => handleEnableAI(a.id)}
              >
                <span style={{ fontWeight: 600 }}>
                  {a.name || "Unnamed Agent"}
                </span>
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAgentPicker(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
