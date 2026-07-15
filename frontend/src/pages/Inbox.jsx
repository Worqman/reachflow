import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversations as conversationsApi,
  meetings as meetingsApi,
  unipile,
  agents as agentsApi,
  campaigns as campaignsApi,
} from "../lib/api";
import { SkeletonConvItems } from "../components/Skeleton";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
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

  // Try to extract name from attendees array (client-side fallback)
  const matchedAttendee =
    chat.attendees?.find(
      (a) => a.provider_id === personId || a.id === personId,
    ) || chat.attendees?.[0];
  const attendeeName = matchedAttendee
    ? (matchedAttendee.name ||
        matchedAttendee.display_name ||
        matchedAttendee.displayName ||
        matchedAttendee.full_name ||
        [matchedAttendee.first_name, matchedAttendee.last_name].filter(Boolean).join(" ") ||
        matchedAttendee.username ||
        null)
    : null;

  // Backend enrichment sets _enrichedName/_enrichedHeadline after profile lookup
  const name = chat._enrichedName || chat.name || attendeeName || "LinkedIn User";
  const company =
    chat._enrichedHeadline ||
    matchedAttendee?.headline ||
    matchedAttendee?.occupation ||
    "";
  const preview = chat.last_message?.text || chat.last_message?.content || "";
  const time = chat.last_message?.created_at
    ? formatRelativeTime(chat.last_message.created_at)
    : chat.updated_at
      ? formatRelativeTime(chat.updated_at)
      : "";
  const unread = (chat.unread_count || 0) > 0;

  const backend = backendConvMap[chat.id] || null;
  const status = backend?.status || "inbox";
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
    campaignId: backend?.campaignId || null,
    providerId: personId || null,
    bookedAt: backend?.bookedAt || null,
    picture: chat._enrichedPicture || null,
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

const LI_ICON = (
  <svg viewBox="0 0 24 24" width="8" height="8" fill="#fff">
    <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H6.477v-7H9v7zM7.694 8.717c-.771 0-1.286-.514-1.286-1.2s.514-1.2 1.371-1.2c.771 0 1.286.514 1.286 1.2s-.514 1.2-1.371 1.2zM18 17h-2.442v-3.826c0-1.058-.651-1.302-.895-1.302s-1.058.163-1.058 1.302V17h-2.523v-7h2.523v.977C13.93 10.407 14.581 10 15.802 10 17.023 10 18 10.977 18 13.174V17z" />
  </svg>
);

const WARN_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const PEOPLE_ICON = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const STATUS_FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI Active" },
  { key: "review", label: "Needs Review" },
  { key: "booked", label: "Booked" },
];

function ConvItem({ c, active, onSelect }) {
  const chipType = c.status === 'booked' ? 'booked' : c.status === 'review' ? 'review' : c.status === 'ai_active' ? 'ai' : c.convId ? 'lead' : null;
  const chipLabel = chipType === 'booked' ? 'Booked' : chipType === 'review' ? 'Review' : chipType === 'ai' ? 'AI' : chipType === 'lead' ? 'Lead' : null;
  return (
    <div
      className={`conv-item ${active?.id === c.id ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
      onClick={() => onSelect(c)}
    >
      <div className="conv-avatar" style={c.picture ? { padding: 0 } : {}}>
        {c.picture
          ? <img src={c.picture} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
          : c.name[0]?.toUpperCase()}
        <div className="conv-avatar-badge">{LI_ICON}</div>
      </div>
      <div className="conv-info">
        <div className="conv-name-row">
          <span className="conv-name">{c.name}</span>
          <span className="conv-time">{c.time}</span>
        </div>
        {c.company && <div className="conv-company">{c.company}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 1 }}>
          {c.preview && <div className="conv-preview" style={{ flex: 1, minWidth: 0 }}>{c.preview}</div>}
          {chipLabel && <span className={`conv-status-chip ${chipType}`}>{chipLabel}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Inbox() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [reply, setReply] = useState("");
  const draftsRef = useRef({});
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
  const [hidingId, setHidingId] = useState(null);
  const [campaignsList, setCampaignsList] = useState([]);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [onlyCampaignLeads, setOnlyCampaignLeads] = useState(false); // on = only leads from campaigns
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const accountIdRef = useRef(null);
  const statusMenuRef = useRef(null);

  // Close the Lead Status popover when clicking outside it
  useEffect(() => {
    if (!statusMenuOpen) return;
    function onDocClick(e) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [statusMenuOpen]);

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
      const hiddenChatIds = new Set();
      for (const c of backendConvs || []) {
        if (c.linkedinChatId) {
          backendMap[c.linkedinChatId] = c;
          if (c.hidden) hiddenChatIds.add(c.linkedinChatId);
        }
      }

      // Build lookup maps from meetings for cross-referencing — scoped to current account
      const accountMeetings = (meetingsData || []).filter(
        (m) => !m.account_id || m.account_id === accId
      );
      const meetingByChatId = {};
      const meetingByProspectId = {};
      const meetingByName = {};
      for (const m of accountMeetings) {
        if (m.linkedin_chat_id) meetingByChatId[m.linkedin_chat_id] = m;
        if (m.prospect_id) meetingByProspectId[m.prospect_id] = m;
        if (m.prospect_name) {
          meetingByName[m.prospect_name.toLowerCase().trim()] = m;
        }
      }

      const items = chatData?.items || chatData?.objects || [];
      const merged = items
        .map((chat) => {
          const conv = chatToConversation(chat, backendMap);
          if (!conv) return null;
          // Cross-reference with meetings: match by chat ID, prospect ID, or name (last resort)
          const bookedMeeting =
            meetingByChatId[chat.id] ||
            (conv.providerId && meetingByProspectId[conv.providerId]) ||
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
              (conv.providerId && meetingByProspectId[conv.providerId]) ||
              meetingByName[conv.name.toLowerCase().trim()] ||
              null;
            return { ...conv, bookedAt: m?.booked_at || conv.bookedAt || null };
          }
          return conv;
        })
        .filter(Boolean)
        .filter(c => !hiddenChatIds.has(c.id));
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
        const [accData, agentData, campaignData] = await Promise.all([
          unipile.getAccounts(),
          agentsApi.list().catch(() => ({ items: [] })),
          campaignsApi.list().catch(() => []),
        ]);
        const accs = accData?.items || [];
        setAccounts(accs);
        setAgentsList(agentData?.items || agentData || []);
        setCampaignsList(campaignData?.items || campaignData || []);
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

  // Auto-refresh every 60s silently
  useEffect(() => {
    const interval = setInterval(() => {
      if (accountIdRef.current) loadConversations(accountIdRef.current, true);
    }, 60000);
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

  function handleSelectConv(c) {
    if (active) draftsRef.current[active.id] = reply;
    setReply(draftsRef.current[c.id] || "");
    setActive(c);
  }

  function applyConvUpdate(chatId, patch) {
    setConversations((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
    );
    setActive((prev) => (prev?.id === chatId ? { ...prev, ...patch } : prev));
  }

  async function handleHide(c, e) {
    e.stopPropagation();
    setHidingId(c.id);
    try {
      if (c.convId) await conversationsApi.hide(c.convId);
      setConversations(prev => prev.filter(x => x.id !== c.id));
      if (active?.id === c.id) setActive(null);
    } catch {}
    setHidingId(null);
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
      }
      // Always call resumeAI — pass the selected agentId so backend uses it even if conv already existed
      await conversationsApi.resumeAI(convId, agentId || agentsList[0]?.id || null);
      applyConvUpdate(active.id, {
        convId,
        agentId: agentId || active.agentId,
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
    // Poll every 20s: sync for AI reply triggering + refresh messages
    const interval = setInterval(pollAndSync, 20000);
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
    const text = reply.trim();
    try {
      await unipile.sendChatMessage(active.id, text, active.accountId);
      // Record in backend store so AI context includes this human reply
      if (active.convId) {
        conversationsApi.reply(active.convId, { text }).catch(() => {});
      }
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          from: "ai",
          text,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      setReply("");
    } catch (err) {
      // keep text so user can retry
      toast?.(err.message || "Failed to send message", "danger");
    } finally {
      setSending(false);
    }
  }

  const filtered = conversations
    .filter((c) => filter === "all" || c?.status === (FILTER_STATUS[filter] || filter))
    .filter((c) => campaignFilter === "all" || c.campaignId === campaignFilter)
    .filter((c) => !onlyCampaignLeads || !!c.campaignId)
    .filter((c) => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.preview?.toLowerCase().includes(search.toLowerCase()));

  const needsReview = conversations.filter(
    (c) => c?.status === "review",
  ).length;
  const aiPaused = active?.aiPaused ?? true;

  return (
    <div className="inbox-layout">
      {/* Full-width toolbar: title/accounts/toggle row + search/campaign/status row */}
      <div className="inbox-toolbar">
        <div className="inbox-toolbar-row">
          <div className="inbox-list-title">Inbox</div>
          <div className="inbox-header-actions">
            {accounts.length > 1 && (
              <select
                className="inbox-select"
                value={accountId || ""}
                onChange={(e) => loadChatsForAccount(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>
                ))}
              </select>
            )}
            <label
              className="inbox-toggle-wrap"
              title={
                onlyCampaignLeads
                  ? "Only showing messages from leads in your campaigns"
                  : "Showing all messages, including personal ones."
              }
            >
              <span className={`inbox-toggle-icon ${onlyCampaignLeads ? "on" : ""}`}>{WARN_ICON}</span>
              <span className="inbox-toggle">
                <input
                  type="checkbox"
                  checked={onlyCampaignLeads}
                  onChange={(e) => setOnlyCampaignLeads(e.target.checked)}
                />
                <span className="inbox-toggle-track" />
              </span>
            </label>
            <button
              className="inbox-refresh-btn"
              disabled={refreshing}
              onClick={() => accountId && loadConversations(accountId)}
              title="Refresh"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="inbox-toggle-message">
          {onlyCampaignLeads
            ? "Only showing messages from leads in your campaigns."
            : "Showing all messages, including personal ones."}
        </div>

        <div className="inbox-toolbar-row">
          {/* Search */}
          <div className="inbox-search-wrap">
            <div className="inbox-search-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                placeholder="Search messages…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="inbox-header-actions">
            <select
              className="inbox-select"
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
            >
              <option value="all">All Campaigns</option>
              {campaignsList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div className="inbox-status-dropdown" ref={statusMenuRef}>
              <button
                className={`inbox-status-btn ${filter !== "all" ? "active" : ""}`}
                onClick={() => setStatusMenuOpen((o) => !o)}
              >
                {PEOPLE_ICON}
                Lead Status
                {filter !== "all" && <span className="inbox-status-dot" />}
              </button>
              {statusMenuOpen && (
                <div className="inbox-status-menu">
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      className={filter === opt.key ? "active" : ""}
                      onClick={() => {
                        setFilter(opt.key);
                        setStatusMenuOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="inbox-body">
      {/* Left: conversation list */}
      <div className="inbox-list">
        <div className="conv-list">
          {loading ? (
            <SkeletonConvItems rows={8} />
          ) : error ? (
            <div style={{ padding: "16px", color: "#9ca3af", fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: "#ef4444" }}>{error}</div>
              <div>Add UNIPILE_API_KEY and UNIPILE_DSN to your .env file.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "24px 16px", color: "var(--text-muted)", fontSize: 13 }}>
              No conversations found.
            </div>
          ) : (
            <>
              {filtered.length > 0 && <div className="conv-section-label">Conversations</div>}
              {filtered.map((c) => (
                <ConvItem key={c.id} c={c} active={active} onSelect={handleSelectConv} />
              ))}
            </>)
          }
        </div>
      </div>

      {/* Right: thread */}
      {active ? (
        <div className="inbox-thread">
          <div className="thread-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
              {active.picture
                ? <img src={active.picture} alt={active.name} className="thread-avatar" style={{ objectFit: 'cover' }} />
                : <div className="thread-avatar">{active.name[0]?.toUpperCase()}</div>
              }
              <div className="thread-header-info">
                <div className="thread-header-name">{active.name}</div>
                <div className="thread-header-meta">
                  {active.company && <span className="thread-header-company">{active.company}</span>}
                  {active.company && <span className="thread-header-sep" />}
                  {active.status === 'booked' && <span className="thread-badge booked">✓ Booked</span>}
                  {active.status === 'ai_active' && !aiPaused && <span className="thread-badge ai">AI Active</span>}
                  {active.status === 'review' && <span className="thread-badge review">Needs Review</span>}
                  {active.convId && active.status !== 'booked' && active.status !== 'review' && <span className="thread-badge lead">Lead</span>}
                </div>
              </div>
            </div>
            <div className="thread-header-actions">
              {active.status !== "booked" &&
                (aiPaused ? (
                  <button
                    className="thread-action-btn primary"
                    disabled={actionLoading}
                    onClick={() => {
                      if (agentsList.filter(a => a.status === 'active').length > 1) setAgentPicker(true);
                      else handleEnableAI(agentsList.find(a => a.status === 'active')?.id || agentsList[0]?.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    Enable AI
                  </button>
                ) : (
                  <button className="thread-action-btn secondary" disabled={actionLoading} onClick={handlePauseAI}>
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    Pause AI
                  </button>
                ))}
              {active.status !== "booked" && (
                <button className="thread-action-btn secondary" disabled={actionLoading} onClick={handleMarkBooked}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><polyline points="20 6 9 17 4 12"/></svg>
                  Mark Booked
                </button>
              )}
            </div>
          </div>

          {active.status === "ai_active" && !aiPaused && (
            <div className="inbox-status-bar ai">
              <div className="signal-dot" />
              <span>AI Assistant is handling this conversation autonomously</span>
            </div>
          )}

          {active.status === "booked" && (
            <div className="inbox-status-bar booked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              <span>
                Meeting booked{active.bookedAt ? ` · ${new Date(active.bookedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}` : ""} — conversation complete
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
                      <span className="message-ai-tag">◆ You</span>
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
              <div className="thread-input-box">
                <textarea
                  className="thread-textarea"
                  placeholder="Write a reply… (⌘↵ to send)"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
                  }}
                />
                <button
                  className="thread-send-btn"
                  disabled={!reply.trim() || sending}
                  onClick={handleSend}
                  title="Send (⌘↵)"
                >
                  {sending
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </button>
              </div>
            ) : (
              <div className="ai-handling">
                {active.status !== "booked" && <div className="signal-dot" style={{ color: '#7c3aed' }} />}
                <span style={{ flex: 1 }}>
                  {active.status === "booked"
                    ? "Conversation complete — meeting booked"
                    : "AI is handling this conversation"}
                </span>
                {active.status !== "booked" && (
                  <button
                    className="thread-action-btn secondary"
                    style={{ fontSize: 12 }}
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
          <div className="inbox-empty-inner">
            <div className="inbox-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="inbox-empty-title">No conversation selected</div>
            <div className="inbox-empty-desc">Pick a conversation from the list to view messages</div>
          </div>
        </div>
      )}
      </div>

      {/* Agent picker modal */}
      <Modal
        open={agentPicker}
        onClose={() => setAgentPicker(false)}
        title="Select AI Agent"
        width={420}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            Choose which agent will handle this conversation:
          </p>
          {agentsList.filter(a => a.status === 'active').map((a) => (
            <button
              key={a.id}
              onClick={() => handleEnableAI(a.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "12px 16px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                textAlign: "left",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "var(--signal)";
                e.currentTarget.style.background = "var(--signal-subtle)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--surface-2)";
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "var(--surface)",
                  border: "1.5px solid var(--border-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700, color: "var(--text-primary)",
                }}>
                  {(a.name || "A")[0].toUpperCase()}
                </div>
                <div style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "var(--signal)", border: "2px solid var(--surface)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a2 2 0 0 1 2-2zM6 4h4V3a2 2 0 0 0-4 0v1zM5.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="#080c14"/>
                  </svg>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                  {a.name || "Unnamed Agent"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  AI Agent · {a.status === "active" ? "Active" : "Paused"}
                </div>
              </div>
              <svg style={{ marginLeft: "auto", color: "var(--text-muted)", flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
