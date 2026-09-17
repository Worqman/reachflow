import { useEffect, useState } from "react";
import { campaigns as campaignsApi, unipile } from "../lib/api";
import { normaliseProfile } from "./LeadFinderModal";

// LinkedIn has no API for event attendees or group members (Unipile doesn't
// expose one either), so this is the manual fallback: paste the profile
// URLs you copied by hand off the event/group page, and each gets resolved
// through Unipile's single-profile lookup (same call LinkedInProfileModal
// uses for one URL — just looped, with a small concurrency cap so it
// doesn't fire 50 requests at once).
const CONCURRENCY = 3;

function parseUrls(text) {
  const seen = new Set();
  return String(text || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && /linkedin\.com\/(in|pub)\//i.test(s))
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
}

export default function ManualProfilesModal({ open, onClose, onImport, campaignId, title, icon, placeholder, sourceTag }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [rows, setRows] = useState([]); // [{ url, status: 'pending'|'ok'|'error', profile?, error? }]
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

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
      setUrlsText(""); setRows([]); setSelected([]); setImportError("");
    }
  }, [open]);

  async function handleResolve() {
    const urls = parseUrls(urlsText);
    if (!urls.length || !accountId) return;
    setResolving(true);
    setImportError("");
    const initial = urls.map((url) => ({ url, status: "pending" }));
    setRows(initial);
    setSelected([]);

    let cursor = 0;
    async function worker() {
      while (cursor < urls.length) {
        const i = cursor++;
        const url = urls[i];
        try {
          const data = await unipile.getLinkedInProfile(accountId, url);
          const profile = normaliseProfile(data);
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "ok", profile } : r));
          setSelected((prev) => [...prev, profile.id]);
        } catch (err) {
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: err.message || "Could not resolve" } : r));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
    setResolving(false);
  }

  function toggleSelect(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const resolvedRows = rows.filter((r) => r.status === "ok");

  async function handleImport() {
    const leadsToAdd = resolvedRows
      .map((r) => r.profile)
      .filter((p) => selected.includes(p.id));
    if (!leadsToAdd.length) return;
    setImporting(true);
    setImportError("");
    try {
      await campaignsApi.importLeads(campaignId, { leads: leadsToAdd, source: sourceTag });
      onImport();
      onClose();
    } catch (err) {
      setImportError(err.message || "Import failed");
    }
    setImporting(false);
  }

  if (!open) return null;

  const errorRows = rows.filter((r) => r.status === "error");

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 680, width: "100%", display: "flex", flexDirection: "column", maxHeight: "85vh" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">{icon} {title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div
          className="modal-body"
          style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}
        >
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

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{placeholder}</div>

          <textarea
            className="input"
            rows={6}
            placeholder={"https://www.linkedin.com/in/jane-doe\nhttps://www.linkedin.com/in/john-smith\n…"}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {parseUrls(urlsText).length} profile URL{parseUrls(urlsText).length === 1 ? "" : "s"} detected
            </span>
            <button
              className="btn btn-primary btn-sm"
              disabled={!parseUrls(urlsText).length || !accountId || resolving}
              onClick={handleResolve}
            >
              {resolving ? "↻ Resolving…" : "Resolve Profiles"}
            </button>
          </div>

          {rows.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {resolvedRows.length} resolved{errorRows.length > 0 ? `, ${errorRows.length} failed` : ""}
                  {resolving ? " — resolving…" : ""}
                </span>
                {resolvedRows.length > 0 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {selected.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.length} selected</span>}
                    <button className="btn btn-ghost btn-sm" onClick={() =>
                      setSelected(selected.length === resolvedRows.length ? [] : resolvedRows.map((r) => r.profile.id))
                    }>
                      {selected.length === resolvedRows.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                )}
              </div>
              <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Name / URL</th>
                      <th>Title</th>
                      <th>Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.url}
                        style={{
                          cursor: r.status === "ok" ? "pointer" : "default",
                          background: r.profile && selected.includes(r.profile.id) ? "var(--signal-subtle)" : undefined,
                          opacity: r.status === "error" ? 0.6 : 1,
                        }}
                        onClick={() => r.status === "ok" && toggleSelect(r.profile.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          {r.status === "ok" && (
                            <input type="checkbox" checked={selected.includes(r.profile.id)} onChange={() => toggleSelect(r.profile.id)} />
                          )}
                          {r.status === "pending" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>↻</span>}
                          {r.status === "error" && <span style={{ fontSize: 11, color: "var(--danger, #e55)" }}>✕</span>}
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          {r.status === "ok" ? r.profile.name : r.url}
                          {r.status === "error" && (
                            <div style={{ fontWeight: 400, fontSize: 11, color: "var(--danger, #e55)" }}>{r.error}</div>
                          )}
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{r.status === "ok" ? (r.profile.title || "—") : ""}</td>
                        <td style={{ fontSize: 13 }}>{r.status === "ok" ? (r.profile.company || "—") : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importError && <div style={{ fontSize: 13, color: "var(--danger, #e55)" }}>{importError}</div>}
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
