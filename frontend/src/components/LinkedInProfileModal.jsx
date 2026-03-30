import { useEffect, useState } from "react";
import { campaigns as campaignsApi, unipile } from "../lib/api";
import { normaliseProfile } from "./LeadFinderModal";

export default function LinkedInProfileModal({ open, onClose, onImport, campaignId }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
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
      setProfileUrl("");
      setResult(null);
      setSearched(false);
      setError("");
    }
  }, [open]);

  async function handleSearch() {
    const url = profileUrl.trim();
    if (!url || !accountId) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSearched(false);
    try {
      const data = await unipile.getLinkedInProfile(accountId, url);
      const normalised = normaliseProfile(data);
      setResult(normalised);
      setSearched(true);
    } catch (err) {
      setError(err.message || "Could not fetch profile. Check the URL and try again.");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!result) return;
    setImporting(true);
    try {
      await campaignsApi.importLeads(campaignId, { leads: [result], source: "linkedin_profile" });
      onImport();
      onClose();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 560, width: "100%", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">👤 Import by LinkedIn Profile URL</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              placeholder="https://www.linkedin.com/in/username/"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!profileUrl.trim() || !accountId || loading}
              onClick={handleSearch}
            >
              {loading ? "↻ Loading…" : "Lookup"}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "var(--danger, #e55)" }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
              ↻ Fetching LinkedIn profile…
            </div>
          )}

          {!loading && searched && !result && !error && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "24px 0" }}>
              Profile not found. Make sure the URL is a valid LinkedIn profile.
            </div>
          )}

          {!loading && result && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 16,
                border: "1px solid var(--signal)",
                borderRadius: "var(--radius)",
                background: "var(--signal-subtle)",
              }}
            >
              {result.profilePictureUrl ? (
                <img
                  src={result.profilePictureUrl}
                  alt={result.name}
                  style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "var(--surface-2)", color: "var(--signal)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 18, flexShrink: 0,
                  }}
                >
                  {result.name?.[0] || "?"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{result.name}</div>
                {result.title && (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{result.title}</div>
                )}
                {result.company && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{result.company}</div>
                )}
                {result.location && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>📍 {result.location}</div>
                )}
              </div>
              <span className="badge badge-signal" style={{ flexShrink: 0 }}>✓ Found</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!result || importing}
            onClick={handleImport}
          >
            {importing ? "Adding…" : "Add to Campaign →"}
          </button>
        </div>
      </div>
    </div>
  );
}
