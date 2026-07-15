import { useEffect, useState } from "react";
import { agents as agentsApi, campaigns as campaignsApi, unipile } from "../lib/api";
import { normaliseProfile } from "./LeadFinderModal";

// Signal types that have a real, automatic detection path today (post
// engagement via Unipile). job_change/funding_round/company_growth also
// exist in the model but have no data source yet — not offered here.
const SIGNAL_TYPE_OPTIONS = [
  { value: "keyword_post", label: "Pain-point post" },
  { value: "competitor_follow", label: "Competitor engagement" },
  { value: "post_activity", label: "General post activity" },
];

export default function PostEngagersModal({ open, onClose, onImport, campaignId, agentId }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [engagerType, setEngagerType] = useState("likers");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [signalType, setSignalType] = useState("keyword_post");
  const [signalTopic, setSignalTopic] = useState("");
  const [markingSignal, setMarkingSignal] = useState(false);
  const [signalResult, setSignalResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    unipile.getAccounts()
      .then((data) => {
        const items = data?.items || [];
        setAccounts(items);
        if (items.length > 0) setAccountId(items[0].id);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPostUrl(""); setResults([]); setSearched(false);
      setError(""); setSelected([]); setSignalResult(null); setSignalTopic("");
    }
  }, [open]);

  async function handleSearch() {
    if (!postUrl.trim() || !accountId) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelected([]);
    try {
      const data = await unipile.getPostEngagers(accountId, postUrl.trim(), engagerType);
      const items = data?.items || data?.objects || data?.reactions || data?.comments || data?.users || [];
      setResults(items.map(normaliseProfile));
      setSearched(true);
    } catch (err) {
      setError(err.message || "Could not fetch post engagers");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleImport() {
    const leadsToAdd = selected.map((id) => results.find((r) => r.id === id)).filter(Boolean);
    if (!leadsToAdd.length) return;
    setImporting(true);
    setError("");
    try {
      await campaignsApi.importLeads(campaignId, { leads: leadsToAdd });
      onImport();
      onClose();
    } catch (err) {
      setError(err.message || "Import failed");
    }
    setImporting(false);
  }

  async function handleMarkAsSignal() {
    const chosen = selected.map((id) => results.find((r) => r.id === id)).filter(Boolean);
    if (!chosen.length || !agentId) return;
    setMarkingSignal(true);
    setSignalResult(null);
    try {
      const events = chosen.map((r) => ({
        providerId: r.providerId,
        leadName: r.name,
        company: r.company,
        title: r.title,
        location: r.location,
        linkedinUrl: r.linkedinUrl,
        profilePictureUrl: r.profilePictureUrl,
        type: signalType,
        metadata: {
          engagementType: engagerType === "comments" ? "comment" : "like",
          postUrl: postUrl.trim(),
          ...(signalTopic.trim() ? { postTopic: signalTopic.trim() } : {}),
        },
      }));
      const data = await agentsApi.createSignalEventsBulk(agentId, events);
      setSignalResult({ count: data?.inserted || events.length });
    } catch (err) {
      setSignalResult({ error: err.message || "Could not log signal" });
    }
    setMarkingSignal(false);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 680, width: "100%", display: "flex", flexDirection: "column", maxHeight: "85vh" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">◆ Post Engagers</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div
          className="modal-body"
          style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Account selector */}
          {accounts.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              No LinkedIn accounts connected. Go to Settings → Workspace.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>Account:</span>
              <select
                className="input"
                style={{ fontSize: 13, padding: "5px 10px", height: "auto", maxWidth: 260 }}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* Post URL + type */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              placeholder="https://www.linkedin.com/feed/update/urn:li:activity:…"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1 }}
            />
            <select
              className="input"
              style={{ width: 150, fontSize: 13, padding: "6px 10px", height: "auto" }}
              value={engagerType}
              onChange={(e) => setEngagerType(e.target.value)}
            >
              <option value="likers">👍 Likers</option>
              <option value="comments">💬 Comments</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              disabled={!postUrl.trim() || !accountId || loading}
              onClick={handleSearch}
            >
              {loading ? "↻ Fetching…" : "Get Engagers"}
            </button>
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--danger, #e55)" }}>{error}</div>}

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
              ↻ Fetching post engagers…
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {results.length} {engagerType} found
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selected.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.length} selected</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() =>
                    setSelected(selected.length === results.length ? [] : results.map((r) => r.id))
                  }>
                    {selected.length === results.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th style={{ width: 36 }}></th>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Company</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.id}
                        style={{ cursor: "pointer", background: selected.includes(r.id) ? "var(--signal-subtle)" : undefined }}
                        onClick={() => toggleSelect(r.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td>
                          {r.profilePictureUrl ? (
                            <img src={r.profilePictureUrl} alt={r.name} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)", display: "block" }} />
                          ) : (
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--signal-subtle)", color: "var(--signal)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>
                              {r.name?.[0] || "?"}
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{r.title || "—"}</td>
                        <td style={{ fontSize: 13 }}>{r.company || "—"}</td>
                        <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "24px 0" }}>
              No engagers found for this post.
            </div>
          )}
        </div>

        {signalResult && (
          <div style={{ padding: "0 20px", fontSize: 12, color: signalResult.error ? "var(--danger, #e55)" : "var(--text-secondary)" }}>
            {signalResult.error ? signalResult.error : `Logged ${signalResult.count} signal event(s) — intent scores updated.`}
          </div>
        )}

        <div className="modal-footer" style={{ flexWrap: "wrap", gap: 8 }}>
          {agentId && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: "auto" }}>
              <select
                className="input"
                style={{ fontSize: 12, padding: "5px 8px", height: "auto" }}
                value={signalType}
                onChange={(e) => setSignalType(e.target.value)}
              >
                {SIGNAL_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Topic (optional) — e.g. pricing"
                style={{ fontSize: 12, padding: "5px 8px", height: "auto", width: 160 }}
                value={signalTopic}
                onChange={(e) => setSignalTopic(e.target.value)}
                title="What was the post about? Powers the {recentPostTopic}/{painPoint} sequence variables — leave blank if unsure."
              />
              <button
                className="btn btn-ghost btn-sm"
                disabled={selected.length === 0 || markingSignal}
                onClick={handleMarkAsSignal}
                title="Log selected engagers as a buying-intent signal for this campaign's agent"
              >
                {markingSignal ? "Marking…" : `Mark as Signal${selected.length > 0 ? ` (${selected.length})` : ""}`}
              </button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={selected.length === 0 || importing || !accountId}
            onClick={handleImport}
          >
            {importing ? "Importing…" : `Add ${selected.length > 0 ? selected.length : ""} to Campaign →`}
          </button>
        </div>
      </div>
    </div>
  );
}
