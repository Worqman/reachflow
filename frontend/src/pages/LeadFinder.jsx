import { useEffect, useState } from "react";
import { campaigns as campaignsApi, leads as leadsApi, unipile } from "../lib/api";
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
  { id: "filters", label: "◎ Search", desc: "LinkedIn search" },
  { id: "url", label: "◈ LinkedIn URL", desc: "Look up a profile" },
  { id: "engagers", label: "◆ Post Engagers", desc: "From a post" },
];

// Normalise any Unipile person object into a table row.
// Handles: LinkedIn search results, profile lookups, reactions/comments wrappers.
function normaliseProfile(raw) {
  const p = raw?.user || raw?.author || raw;
  const pos = p.current_positions?.[0];
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  const isGenericLinkedInName = (value) =>
    typeof value === "string" &&
    /^(linkedin\s+member|member)$/i.test(value.trim());
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
    title:
      pos?.role || p.headline || p.job_title || p.title || p.occupation || "",
    company:
      pos?.company || p.company_name || p.company || p.current_company || "",
    location: p.location || p.geo_location || p.country || "",
    profilePictureUrl:
      p.profile_picture_url || p.profile_image_url || p.avatar_url || "",
    linkedinUrl:
      p.public_profile_url ||
      p.linkedin_url ||
      (p.public_identifier
        ? `https://www.linkedin.com/in/${p.public_identifier}`
        : "") ||
      p.url ||
      "",
    providerId: p.provider_id || p.member_urn || p.id || "",
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
  const [linkedinSearchUrl, setLinkedinSearchUrl] = useState("");

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

  // ── Campaign picker state ─────────────────────────────────────
  const [campaignList, setCampaignList] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingLeads, setPendingLeads] = useState([]);
  const [addingToCampaign, setAddingToCampaign] = useState(null); // campaignId being added to

  // ── Save to List state ────────────────────────────────────────
  const [savingToList, setSavingToList] = useState(false);
  const [savedToList, setSavedToList] = useState(false);

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

  // Load campaigns for the picker
  useEffect(() => {
    campaignsApi
      .list()
      .then((data) => setCampaignList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function openCampaignPicker(leads) {
    setPendingLeads(leads);
    setPickerOpen(true);
  }

  async function addToCampaign(campaignId) {
    setAddingToCampaign(campaignId);
    try {
      await campaignsApi.importLeads(campaignId, { leads: pendingLeads });
      setPickerOpen(false);
      setPendingLeads([]);
      setSelected([]);
    } catch {}
    setAddingToCampaign(null);
  }

  async function handleSaveToList() {
    const leadsToSave = tableRows.filter((r) => selected.includes(r.id));
    if (!leadsToSave.length) return;
    setSavingToList(true);
    setSavedToList(false);
    try {
      await leadsApi.bulkCreate(leadsToSave);
      setSavedToList(true);
      setSelected([]);
      setTimeout(() => setSavedToList(false), 3000);
    } catch {}
    setSavingToList(false);
  }

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

  const [filterError, setFilterError] = useState("");
  const [filterSource, setFilterSource] = useState(""); // 'linkedin_search' | 'connections'

  const handleFilterSearch = async () => {
    if (!accountId) {
      setFilterError(
        "No LinkedIn account connected. Go to Settings → Workspace.",
      );
      return;
    }
    setLoading(true);
    setSelected([]);
    setFilterError("");
    setFilterSource("");
    try {
      const trimmedUrl = linkedinSearchUrl.trim();
      const trimmedJobTitle = jobTitle.trim();
      const trimmedIndustry = industry.trim();
      const trimmedLocation = location.trim();
      const keywordParts = [jobTitle, industry, location]
        .map((value) => value.trim())
        .filter(Boolean);
      const keywordText =
        keywordParts.length > 0 ? keywordParts.join(" ") : undefined;

      const basePayload = {
        url: trimmedUrl || undefined,
        // Keep keyword fallback, but also send individual filters so the backend
        // can map all fields when building provider-side search parameters.
        keywords: !trimmedUrl ? keywordText : undefined,
        title: !trimmedUrl ? trimmedJobTitle || undefined : undefined,
        industry: !trimmedUrl ? trimmedIndustry || undefined : undefined,
        location_text: !trimmedUrl ? trimmedLocation || undefined : undefined,
        seniority: !trimmedUrl && seniority.length > 0 ? seniority : undefined,
        company_sizes: !trimmedUrl && sizes.length > 0 ? sizes : undefined,
      };

      const allItems = [];
      let cursor = undefined;
      let source = "";
      for (let i = 0; i < 5; i += 1) {
        const data = await unipile.searchPeople(accountId, {
          ...basePayload,
          cursor,
        });
        const items =
          data?.items || data?.objects || data?.users || data?.results || [];
        allItems.push(...items);
        if (!source) source = data?.source || "";
        const nextCursor =
          data?.cursor || data?.next_cursor || data?.nextCursor;
        if (!nextCursor || items.length === 0) break;
        cursor = nextCursor;
      }

      const uniqueById = new Map();
      allItems.forEach((item) => {
        const key =
          item?.provider_id ||
          item?.member_id ||
          item?.id ||
          Math.random().toString(36);
        if (!uniqueById.has(key)) uniqueById.set(key, item);
      });

      setResults(Array.from(uniqueById.values()).map(normaliseProfile));
      setFilterSource(source);
      setSearched(true);
    } catch (err) {
      setFilterError(err.message || "Search failed");
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSizes([]);
    setSeniority([]);
    setIndustry("");
    setJobTitle("");
    setLocation("");
    setSearched(false);
    setResults([]);
    setFilterError("");
    setFilterSource("");
    setLinkedinSearchUrl("");
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
        data?.items ||
        data?.objects ||
        data?.reactions ||
        data?.comments ||
        data?.users ||
        [];
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
            </>
          )}

          {/* ── LinkedIn URL mode ── */}
          {mode === "url" && (
            <>
              <div className="filter-section">
                <div className="filter-label">LinkedIn Search URL</div>
                <input
                  className="input"
                  placeholder="Paste a LinkedIn people search URL…"
                  value={linkedinSearchUrl}
                  onChange={(e) => setLinkedinSearchUrl(e.target.value)}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  Search on LinkedIn, copy the URL, paste here. Overrides
                  filters in Search tab.
                </div>
              </div>
            </>
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
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openCampaignPicker([profileResult])}
                >
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
                  <h3>Search LinkedIn</h3>
                  <p>
                    Enter a job title, industry, or location and search LinkedIn
                    directly via your connected account.
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
                  ? "Searching LinkedIn…"
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
          ) : filterError && mode === "filters" ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <div style={{ fontSize: 32 }}>◎</div>
              <h3>Search failed</h3>
              <p style={{ color: "var(--text-muted)", maxWidth: 400 }}>
                {filterError}
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
                      {filterSource === "connections"
                        ? "from your connections"
                        : "from LinkedIn"}
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
                    disabled={selected.length === 0 || savingToList}
                    onClick={handleSaveToList}
                  >
                    {savingToList
                      ? "Saving…"
                      : savedToList
                        ? "✓ Saved"
                        : "Save to List"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={selected.length === 0}
                    onClick={() =>
                      openCampaignPicker(
                        tableRows.filter((r) => selected.includes(r.id)),
                      )
                    }
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
                      <th></th>
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
                        <td style={{ fontSize: 12 }}>
                          {r.profilePictureUrl ? (
                            <img
                              src={r.profilePictureUrl}
                              alt={`${r.name} profile`}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid var(--border)",
                              }}
                            />
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
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

      {/* Campaign picker modal */}
      {pickerOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setPickerOpen(false)}
        >
          <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add to Campaign</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setPickerOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                Adding {pendingLeads.length} lead
                {pendingLeads.length !== 1 ? "s" : ""} — choose a campaign:
              </p>
              {campaignList.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  No campaigns found. Create one first.
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {campaignList.map((c) => (
                    <button
                      key={c.id}
                      className="btn btn-secondary"
                      style={{
                        justifyContent: "space-between",
                        textAlign: "left",
                      }}
                      disabled={addingToCampaign === c.id}
                      onClick={() => addToCampaign(c.id)}
                    >
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span
                        style={{ fontSize: 12, color: "var(--text-muted)" }}
                      >
                        {addingToCampaign === c.id
                          ? "Adding…"
                          : c.status === "active"
                            ? "● Active"
                            : "Paused"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
