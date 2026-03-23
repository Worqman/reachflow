import { useEffect, useState } from "react";
import { unipile } from "../lib/api";
import "./LeadFinder.css";

const INDUSTRIES = [
  "Accounting",
  "Financial Services",
  "Legal",
  "Property & Construction",
  "SaaS / Tech",
  "Marketing",
  "Healthcare",
  "Retail",
  "Manufacturing",
];
const SIZES = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "501–1000",
  "1001–5000",
  "5001+",
];
const SENIORITY = [
  "Owner",
  "C-Suite",
  "VP / Director",
  "Manager",
  "Senior IC",
  "IC",
];

const MODES = [
  { id: "filters", label: "◎ Filters", desc: "Apollo database" },
  { id: "url", label: "◈ LinkedIn URL", desc: "Look up a profile" },
  { id: "engagers", label: "◆ Post Engagers", desc: "From a post" },
];

// Normalise a Unipile profile/user/reaction/comment object into a table row.
// Reactions wrap the person under .user; comments wrap under .author.
function normaliseProfile(raw) {
  const p = raw?.user || raw?.author || raw;
  return {
    id: p.id || p.provider_id || p.member_id || Math.random(),
    name:
      p.name ||
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      "Unknown",
    title: p.headline || p.job_title || p.title || p.occupation || "",
    company: p.company_name || p.company || p.current_company || "",
    location: p.location || p.geo_location || p.country || "",
    linkedinUrl: p.linkedin_url || p.public_profile_url || p.url || "",
    providerId: p.provider_id || p.id || "",
    status: "Not contacted",
  };
}

export default function LeadFinder() {
  const [mode, setMode] = useState("filters");
  const [unipileAccounts, setUnipileAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");

  // ── Filters mode state ────────────────────────────────────────
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [seniority, setSeniority] = useState([]);
  const [industry, setIndustry] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");

  // ── URL mode state ────────────────────────────────────────────
  const [profileUrl, setProfileUrl] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResult, setProfileResult] = useState(null);
  const [profileError, setProfileError] = useState("");

  // ── Post Engagers mode state ──────────────────────────────────
  const [postUrl, setPostUrl] = useState("");
  const [engagerType, setEngagerType] = useState("likers");
  const [engagersLoading, setEngagersLoading] = useState(false);
  const [engagersResults, setEngagersResults] = useState([]);
  const [engagersSearched, setEngagersSearched] = useState(false);
  const [engagersError, setEngagersError] = useState("");

  // Load connected LinkedIn accounts
  useEffect(() => {
    unipile
      .getAccounts()
      .then((data) => {
        const items = data?.items || [];
        setUnipileAccounts(items);
        if (items.length > 0) setAccountId(items[0].id);
      })
      .catch(() => {});
  }, []);

  // ── Filters mode ─────────────────────────────────────────────
  const toggleSize = (s) =>
    setSizes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  const toggleSeniority = (s) =>
    setSeniority((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  const toggleSelect = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleFilterSearch = () => {
    setLoading(true);
    setSelected([]);
    // Apollo.io integration placeholder — returns mock data for now
    setTimeout(() => {
      setResults([
        {
          id: 1,
          name: "James McKenzie",
          title: "Managing Partner",
          company: "McKenzie & Co Accountants",
          location: "London, UK",
          status: "Not contacted",
        },
        {
          id: 2,
          name: "Rachel Ahmed",
          title: "Finance Director",
          company: "Ahmed Finance Solutions",
          location: "Birmingham, UK",
          status: "Not contacted",
        },
        {
          id: 3,
          name: "Oliver Thornton",
          title: "Founding Partner",
          company: "Thornton Advisory",
          location: "Manchester, UK",
          status: "Not contacted",
        },
        {
          id: 4,
          name: "Sarah Patel",
          title: "Senior Partner",
          company: "SP Financial Services",
          location: "Bristol, UK",
          status: "Not contacted",
        },
        {
          id: 5,
          name: "Tom Whitfield",
          title: "Managing Director",
          company: "Whitfield CPA",
          location: "Leeds, UK",
          status: "Not contacted",
        },
        {
          id: 6,
          name: "Emma Clarke",
          title: "Founding Director",
          company: "Clarke Accounting",
          location: "Edinburgh, UK",
          status: "Not contacted",
        },
      ]);
      setLoading(false);
      setSearched(true);
    }, 1200);
  };

  const handleReset = () => {
    setSizes([]);
    setSeniority([]);
    setIndustry("");
    setJobTitle("");
    setLocation("");
    setSearched(false);
    setResults([]);
  };

  // ── URL mode ─────────────────────────────────────────────────
  async function handleProfileSearch() {
    if (!profileUrl.trim()) return;
    if (!accountId) {
      setProfileError(
        "No LinkedIn account connected. Go to Settings → Workspace.",
      );
      return;
    }
    setProfileLoading(true);
    setProfileResult(null);
    setProfileError("");
    try {
      const data = await unipile.getLinkedInProfile(
        accountId,
        profileUrl.trim(),
      );
      setProfileResult(normaliseProfile(data));
    } catch (err) {
      setProfileError(err.message || "Failed to fetch profile");
    } finally {
      setProfileLoading(false);
    }
  }

  // ── Post Engagers mode ────────────────────────────────────────
  async function handleEngagersSearch() {
    if (!postUrl.trim()) return;
    if (!accountId) {
      setEngagersError(
        "No LinkedIn account connected. Go to Settings → Workspace.",
      );
      return;
    }
    setEngagersLoading(true);
    setEngagersResults([]);
    setEngagersSearched(false);
    setEngagersError("");
    setSelected([]);
    try {
      const data = await unipile.getPostEngagers(
        accountId,
        postUrl.trim(),
        engagerType,
      );
      const items =
        data?.items || data?.objects || data?.reactions || data?.comments || data?.users || [];
      setEngagersResults(items.map(normaliseProfile));
      setEngagersSearched(true);
    } catch (err) {
      setEngagersError(err.message || "Failed to fetch post engagers");
      setEngagersSearched(true);
    } finally {
      setEngagersLoading(false);
    }
  }

  // ── Shared results table ──────────────────────────────────────
  const tableRows = mode === "engagers" ? engagersResults : results;
  const showTable =
    mode === "filters"
      ? searched
      : mode === "engagers"
        ? engagersSearched
        : false;
  const showLoading =
    mode === "filters"
      ? loading
      : mode === "engagers"
        ? engagersLoading
        : profileLoading;

  return (
    <div className="lead-finder-layout">
      {/* Filter sidebar */}
      <aside className="filter-sidebar">
        <div className="filter-sidebar-header">
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Lead Finder</h2>
          {mode === "filters" && (
            <button className="btn btn-ghost btn-sm" onClick={handleReset}>
              Reset
            </button>
          )}
        </div>

        {/* Mode tabs */}
        <div
          style={{ display: "flex", borderBottom: "1px solid var(--border)" }}
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: 11,
                fontWeight: mode === m.id ? 700 : 500,
                color: mode === m.id ? "var(--signal)" : "var(--text-muted)",
                background: "none",
                border: "none",
                borderBottom:
                  mode === m.id
                    ? "2px solid var(--signal)"
                    : "2px solid transparent",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="filter-sections-scroll">
          {/* Account selector — shown in URL and engagers modes */}
          {(mode === "url" || mode === "engagers") && (
            <div className="filter-section">
              <div className="filter-label">LinkedIn Account</div>
              {unipileAccounts.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  No accounts connected. Go to Settings → Workspace.
                </div>
              ) : (
                <select
                  className="input"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  {unipileAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.username || a.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── Filters mode ── */}
          {mode === "filters" && (
            <>
              <div className="filter-section">
                <div className="filter-label">LinkedIn Account</div>
                <select className="input" style={{ cursor: "pointer" }}>
                  {unipileAccounts.length > 0 ? (
                    unipileAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || a.id}
                      </option>
                    ))
                  ) : (
                    <option>No account connected</option>
                  )}
                </select>
              </div>
              <div className="filter-section">
                <div className="filter-label">Job Title</div>
                <input
                  className="input"
                  placeholder="e.g. Managing Partner"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="filter-section">
                <div className="filter-label">Industry</div>
                <select
                  className="input"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                >
                  <option value="">Any industry</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </div>
              <div className="filter-section">
                <div className="filter-label">Location</div>
                <input
                  className="input"
                  placeholder="e.g. United Kingdom"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="filter-section">
                <div className="filter-label">Company Headcount</div>
                <div className="size-toggles">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      className={`size-toggle ${sizes.includes(s) ? "active" : ""}`}
                      onClick={() => toggleSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-section">
                <div className="filter-label">Seniority</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SENIORITY.map((s) => (
                    <button
                      key={s}
                      className={`size-toggle ${seniority.includes(s) ? "active" : ""}`}
                      onClick={() => toggleSeniority(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-section">
                <div className="filter-label">Activity Signals</div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {[
                    "Has posted on LinkedIn",
                    "Changed jobs recently",
                    "Mentioned in news",
                  ].map((opt) => (
                    <label
                      key={opt}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <input type="checkbox" /> {opt}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── LinkedIn URL mode ── */}
          {mode === "url" && (
            <div className="filter-section">
              <div className="filter-label">LinkedIn Profile URL</div>
              <input
                className="input"
                placeholder="https://www.linkedin.com/in/username"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProfileSearch()}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Paste any LinkedIn profile URL to look up their details.
              </div>
            </div>
          )}

          {/* ── Post Engagers mode ── */}
          {mode === "engagers" && (
            <>
              <div className="filter-section">
                <div className="filter-label">LinkedIn Post URL</div>
                <input
                  className="input"
                  placeholder="https://www.linkedin.com/feed/update/urn:li:activity:..."
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEngagersSearch()}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  Paste the URL of a LinkedIn post to see who engaged with it.
                </div>
              </div>
              <div className="filter-section">
                <div className="filter-label">Engagement Type</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { id: "likers", label: "👍 Likers" },
                    { id: "comments", label: "💬 Comments" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={`size-toggle ${engagerType === t.id ? "active" : ""}`}
                      onClick={() => setEngagerType(t.id)}
                      style={{ flex: 1 }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="filter-sidebar-footer">
          {mode === "filters" && (
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleFilterSearch}
              disabled={loading}
            >
              {loading ? <span>↻</span> : "◎"} Preview People
            </button>
          )}
          {mode === "url" && (
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleProfileSearch}
              disabled={profileLoading || !profileUrl.trim()}
            >
              {profileLoading ? "↻ Searching…" : "◈ Look Up Profile"}
            </button>
          )}
          {mode === "engagers" && (
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleEngagersSearch}
              disabled={engagersLoading || !postUrl.trim()}
            >
              {engagersLoading ? "↻ Fetching…" : "◆ Get Engagers"}
            </button>
          )}
        </div>
      </aside>

      {/* Results panel */}
      <div className="results-panel">
        {/* ── URL mode result ── */}
        {mode === "url" &&
          (profileLoading ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <div style={{ fontSize: 32 }}>↻</div>
              <p style={{ color: "var(--text-muted)" }}>
                Fetching LinkedIn profile…
              </p>
            </div>
          ) : profileError ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <div style={{ fontSize: 32 }}>◈</div>
              <h3>Could not fetch profile</h3>
              <p style={{ color: "var(--text-muted)", maxWidth: 400 }}>
                {profileError}
              </p>
            </div>
          ) : profileResult ? (
            <>
              <div className="results-header">
                <span style={{ fontWeight: 700, fontSize: 15 }}>
                  Profile found
                </span>
                <button className="btn btn-primary btn-sm">
                  Add to Campaign
                </button>
              </div>
              <div className="card" style={{ maxWidth: 560 }}>
                <div
                  style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "var(--radius-md)",
                      background: "var(--signal-subtle)",
                      color: "var(--signal)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {profileResult.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {profileResult.name}
                    </div>
                    {profileResult.title && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          marginTop: 2,
                        }}
                      >
                        {profileResult.title}
                      </div>
                    )}
                    {profileResult.company && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        at {profileResult.company}
                      </div>
                    )}
                    {profileResult.location && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 4,
                        }}
                      >
                        📍 {profileResult.location}
                      </div>
                    )}
                    {profileResult.linkedinUrl && (
                      <a
                        href={profileResult.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          color: "var(--signal)",
                          marginTop: 6,
                          display: "inline-block",
                        }}
                      >
                        View on LinkedIn ↗
                      </a>
                    )}
                  </div>
                  <span className="badge badge-muted">Not contacted</span>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ height: "100%" }}>
              <div className="empty-icon">◈</div>
              <h3>Look up a LinkedIn profile</h3>
              <p>
                Paste a LinkedIn profile URL in the sidebar and click Look Up
                Profile.
              </p>
            </div>
          ))}

        {/* ── Filters & Engagers shared table ── */}
        {(mode === "filters" || mode === "engagers") &&
          (!showTable && !showLoading ? (
            <div className="empty-state" style={{ height: "100%" }}>
              {mode === "filters" ? (
                <>
                  <div className="empty-icon">◎</div>
                  <h3>Find your perfect leads</h3>
                  <p>
                    Use the filters to define your ICP, then click Preview
                    People to see matching contacts.
                  </p>
                  <div className="how-it-works">
                    <div className="how-step">
                      <span className="how-num">1</span> Set your filters
                    </div>
                    <div className="how-arrow">→</div>
                    <div className="how-step">
                      <span className="how-num">2</span> Preview matches
                    </div>
                    <div className="how-arrow">→</div>
                    <div className="how-step">
                      <span className="how-num">3</span> Import to campaign
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="empty-icon">◆</div>
                  <h3>Find post engagers</h3>
                  <p>
                    Paste a LinkedIn post URL to see everyone who liked or
                    commented on it — ready to import as leads.
                  </p>
                  <div className="how-it-works">
                    <div className="how-step">
                      <span className="how-num">1</span> Paste post URL
                    </div>
                    <div className="how-arrow">→</div>
                    <div className="how-step">
                      <span className="how-num">2</span> Choose likers /
                      comments
                    </div>
                    <div className="how-arrow">→</div>
                    <div className="how-step">
                      <span className="how-num">3</span> Import to campaign
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : showLoading ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <div style={{ fontSize: 32 }}>↻</div>
              <p style={{ color: "var(--text-muted)" }}>
                {mode === "filters"
                  ? "Searching Apollo database…"
                  : "Fetching post engagers…"}
              </p>
            </div>
          ) : engagersError && mode === "engagers" ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <div style={{ fontSize: 32 }}>◆</div>
              <h3>Could not fetch engagers</h3>
              <p style={{ color: "var(--text-muted)", maxWidth: 400 }}>
                {engagersError}
              </p>
            </div>
          ) : (
            <>
              <div className="results-header">
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>
                    {tableRows.length}{" "}
                    {mode === "engagers"
                      ? `${engagerType} found`
                      : "matches found"}
                  </span>
                  {mode === "filters" && (
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 13,
                        marginLeft: 8,
                      }}
                    >
                      from Apollo database
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selected.length > 0 && (
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {selected.length} selected
                    </span>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setSelected(
                        selected.length === tableRows.length
                          ? []
                          : tableRows.map((r) => r.id),
                      )
                    }
                  >
                    {selected.length === tableRows.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={selected.length === 0}
                  >
                    Save to List
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={selected.length === 0}
                  >
                    Add to Campaign ({selected.length})
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Name</th>
                      <th>Job Title</th>
                      <th>Company</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(r.id)}
                            onChange={() => toggleSelect(r.id)}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ color: "var(--text-secondary)" }}>
                          {r.title}
                        </td>
                        <td>{r.company}</td>
                        <td
                          style={{ color: "var(--text-muted)", fontSize: 12 }}
                        >
                          {r.location}
                        </td>
                        <td>
                          <span className="badge badge-muted">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}
      </div>
    </div>
  );
}
