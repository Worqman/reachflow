import { useEffect, useState } from "react";
import { campaigns as campaignsApi, unipile } from "../lib/api";
import "../pages/LeadFinder.css";

const INDUSTRIES = [
  "Accounting", "Financial Services", "Legal", "Property & Construction",
  "SaaS / Tech", "Marketing", "Healthcare", "Retail", "Manufacturing",
];
const SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1000", "1001–5000", "5001+"];
const SENIORITY = ["Owner", "C-Suite", "VP / Director", "Manager", "Senior IC", "IC"];

// A personal profile URL always lives at linkedin.com/in/… (or the legacy
// /pub/…). Anything else — /company/, /school/, /showcase/, or a non-LinkedIn
// domain — is an organization page or unrelated link, never the person's own
// profile, so it must never be shown behind a "View LinkedIn profile" badge.
function isPersonalLinkedInUrl(url) {
  return typeof url === "string" && /linkedin\.com\/(in|pub)\//i.test(url);
}

// Company fields sometimes come back as a URL (company website or a
// linkedin.com/company/… page) instead of a plain name — never show those.
function isUrlLike(v) {
  return typeof v === "string" && /^(https?:\/\/|www\.)/i.test(v.trim());
}

function normaliseProfile(raw) {
  const p = raw?.user || raw?.author || raw;
  const pos = p.current_positions?.[0];
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  const isGenericLinkedInName = (v) =>
    typeof v === "string" && /^(linkedin\s+member|member)$/i.test(v.trim());
  const fromIdentifier =
    typeof p.public_identifier === "string" ? p.public_identifier.trim() : "";
  const fromUrlMatch =
    typeof p.public_profile_url === "string"
      ? p.public_profile_url.match(/linkedin\.com\/in\/([^/?#]+)/i)
      : typeof p.linkedin_url === "string"
        ? p.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/i)
        : null;
  const fallbackHandle = (fromIdentifier || fromUrlMatch?.[1] || "")
    .replace(/[-_]+/g, " ")
    .trim();
  const rawName = (p.name || p.full_name || fullName || "").trim();
  const displayName =
    rawName && !isGenericLinkedInName(rawName)
      ? rawName
      : fallbackHandle || "Private LinkedIn Profile";

  return {
    id: p.id || p.provider_id || p.member_id || String(Math.random()),
    name: displayName,
    title: pos?.role || p.headline || p.job_title || p.title || p.occupation || "",
    company:
      [pos?.company, p.company_name, p.company, p.current_company].find(
        (v) => v && !isUrlLike(v)
      ) || "",
    location: p.location || p.geo_location || p.country || "",
    profilePictureUrl: p.profile_picture_url || p.profile_image_url || p.avatar_url || "",
    linkedinUrl:
      [p.public_profile_url, p.linkedin_url].find(isPersonalLinkedInUrl) ||
      (p.public_identifier ? `https://www.linkedin.com/in/${p.public_identifier}` : "") ||
      (isPersonalLinkedInUrl(p.url) ? p.url : "") ||
      "",
    providerId: p.provider_id || p.member_urn || p.id || "",
    status: "Not contacted",
  };
}

export { normaliseProfile };

export default function LeadFinderModal({ open, onClose, onImport, campaignId }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinSearchUrl, setLinkedinSearchUrl] = useState("");
  const [sizes, setSizes] = useState([]);
  const [seniority, setSeniority] = useState([]);
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
      setJobTitle(""); setIndustry(""); setLocation(""); setLinkedinSearchUrl("");
      setSizes([]); setSeniority([]);
      setResults([]); setSearched(false); setError("");
      setSelected([]);
    }
  }, [open]);

  const toggleSize = (s) =>
    setSizes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleSeniority = (s) =>
    setSeniority((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function handleSearch() {
    if (!accountId) { setError("No LinkedIn account connected."); return; }
    setLoading(true);
    setSelected([]);
    setError("");
    try {
      const trimmedUrl = linkedinSearchUrl.trim();
      const keywordParts = [jobTitle, industry, location].map((v) => v.trim()).filter(Boolean);
      const basePayload = {
        url: trimmedUrl || undefined,
        keywords: !trimmedUrl && keywordParts.length ? keywordParts.join(" ") : undefined,
        title: !trimmedUrl ? jobTitle.trim() || undefined : undefined,
        industry: !trimmedUrl ? industry.trim() || undefined : undefined,
        location_text: !trimmedUrl ? location.trim() || undefined : undefined,
        seniority: !trimmedUrl && seniority.length > 0 ? seniority : undefined,
        company_sizes: !trimmedUrl && sizes.length > 0 ? sizes : undefined,
      };

      const allItems = [];
      let cursor = undefined;
      for (let i = 0; i < 5; i++) {
        const data = await unipile.searchPeople(accountId, { ...basePayload, cursor });
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

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 860, width: "100%", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">◎ Lead Finder — Search</h2>
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

          {/* Filter inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "Job Title", value: jobTitle, set: setJobTitle, placeholder: "e.g. Managing Partner", type: "input" },
              { label: "Industry", value: industry, set: setIndustry, type: "select" },
              { label: "Location", value: location, set: setLocation, placeholder: "e.g. United Kingdom", type: "input" },
            ].map(({ label, value, set, placeholder, type }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}
                </div>
                {type === "select" ? (
                  <select className="input" value={value} onChange={(e) => set(e.target.value)}>
                    <option value="">Any industry</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                ) : (
                  <input
                    className="input"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Company size */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Company Headcount
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SIZES.map((s) => (
                <button key={s} className={`size-toggle ${sizes.includes(s) ? "active" : ""}`} onClick={() => toggleSize(s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* Seniority */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Seniority
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SENIORITY.map((s) => (
                <button key={s} className={`size-toggle ${seniority.includes(s) ? "active" : ""}`} onClick={() => toggleSeniority(s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* LinkedIn Search URL override */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              LinkedIn Search URL <span style={{ fontWeight: 400, textTransform: "none" }}>(optional — overrides filters above)</span>
            </div>
            <input
              className="input"
              placeholder="Paste a LinkedIn people search URL…"
              value={linkedinSearchUrl}
              onChange={(e) => setLinkedinSearchUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-start" }}
            disabled={loading || !accountId}
            onClick={handleSearch}
          >
            {loading ? "↻ Searching…" : "◎ Search LinkedIn"}
          </button>

          {error && <div style={{ fontSize: 13, color: "var(--danger, #e55)" }}>{error}</div>}

          {/* Loading */}
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
              <div className="table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
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
              No results found. Try broadening your filters.
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
