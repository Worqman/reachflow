import { useEffect, useState } from "react";
import { campaigns as campaignsApi, unipile } from "../lib/api";
import { normaliseProfile } from "./LeadFinderModal";

export default function ProfileUrlModal({ open, onClose, onImport, campaignId }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [searchUrl, setSearchUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);

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
      setSearchUrl(""); setResults([]); setSearched(false);
      setError(""); setSelected([]);
    }
  }, [open]);

  async function handleSearch() {
    if (!searchUrl.trim() || !accountId) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelected([]);
    try {
      const allItems = [];
      let cursor = undefined;
      for (let i = 0; i < 5; i++) {
        const data = await unipile.searchPeople(accountId, { url: searchUrl.trim(), cursor });
        const items = data?.items || data?.objects || data?.users || data?.results || [];
        allItems.push(...items);
        const nextCursor = data?.cursor || data?.next_cursor || data?.nextCursor;
        if (!nextCursor || items.length === 0) break;
        cursor = nextCursor;
      }

      const uniqueById = new Map();
      allItems.forEach((item) => {
        const key = item?.provider_id || item?.member_id || item?.id || Math.random().toString(36);
        if (!uniqueById.has(key)) uniqueById.set(key, item);
      });

      setResults(Array.from(uniqueById.values()).map(normaliseProfile));
      setSearched(true);
    } catch (err) {
      setError(err.message || "Search failed");
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
    try {
      await campaignsApi.importLeads(campaignId, { leads: leadsToAdd });
      onImport();
      onClose();
    } catch {}
    setImporting(false);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 760, width: "100%", display: "flex", flexDirection: "column", maxHeight: "85vh" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">◈ LinkedIn Search URL</h2>
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

          {/* URL input */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              placeholder="Paste a LinkedIn people search URL…"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!searchUrl.trim() || !accountId || loading}
              onClick={handleSearch}
            >
              {loading ? "↻ Searching…" : "Search"}
            </button>
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--danger, #e55)" }}>{error}</div>}

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
              ↻ Searching LinkedIn…
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{results.length} results found</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selected.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.length} selected</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() =>
                    setSelected(selected.length === results.length ? [] : results.map((r) => r.id))
                  }>
                    {selected.length === results.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: "auto" }}>
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
              No results found. Try a different search URL.
            </div>
          )}
        </div>

        <div className="modal-footer">
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
