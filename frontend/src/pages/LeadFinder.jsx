import { useEffect, useMemo, useState } from "react";
import { campaigns as campaignsApi, leads as leadsApi, leadLists as listsApi, unipile } from "../lib/api";
import ImportContactsModal from "../components/ImportContactsModal";
import "./LeadFinder.css";

// LinkedIn industry list with official numeric IDs (used as facetIndustry in search)
const INDUSTRIES = [
  { id: "1",   name: "Accounting" },
  { id: "3",   name: "Airlines / Aviation" },
  { id: "5",   name: "Alternative Medicine" },
  { id: "6",   name: "Animation" },
  { id: "7",   name: "Apparel & Fashion" },
  { id: "8",   name: "Architecture & Planning" },
  { id: "10",  name: "Automotive" },
  { id: "12",  name: "Banking" },
  { id: "13",  name: "Biotechnology" },
  { id: "14",  name: "Broadcast Media" },
  { id: "16",  name: "Business Supplies & Equipment" },
  { id: "17",  name: "Capital Markets" },
  { id: "18",  name: "Chemicals" },
  { id: "19",  name: "Civic & Social Organization" },
  { id: "20",  name: "Civil Engineering" },
  { id: "21",  name: "Commercial Real Estate" },
  { id: "22",  name: "Computer & Network Security" },
  { id: "23",  name: "Computer Games" },
  { id: "24",  name: "Computer Hardware" },
  { id: "26",  name: "Computer Software" },
  { id: "27",  name: "Construction" },
  { id: "28",  name: "Consumer Electronics" },
  { id: "29",  name: "Consumer Goods" },
  { id: "30",  name: "Consumer Services" },
  { id: "31",  name: "Cosmetics" },
  { id: "33",  name: "Defense & Space" },
  { id: "34",  name: "Design" },
  { id: "35",  name: "Education Management" },
  { id: "36",  name: "E-Learning" },
  { id: "37",  name: "Electrical / Electronic Manufacturing" },
  { id: "38",  name: "Entertainment" },
  { id: "39",  name: "Environmental Services" },
  { id: "40",  name: "Events Services" },
  { id: "41",  name: "Executive Office" },
  { id: "44",  name: "Financial Services" },
  { id: "47",  name: "Food & Beverages" },
  { id: "48",  name: "Food Production" },
  { id: "53",  name: "Government Administration" },
  { id: "55",  name: "Graphic Design" },
  { id: "56",  name: "Health, Wellness & Fitness" },
  { id: "57",  name: "Higher Education" },
  { id: "58",  name: "Hospital & Health Care" },
  { id: "59",  name: "Hospitality" },
  { id: "60",  name: "Human Resources" },
  { id: "63",  name: "Industrial Automation" },
  { id: "65",  name: "Information Technology & Services" },
  { id: "66",  name: "Insurance" },
  { id: "69",  name: "Internet" },
  { id: "70",  name: "Investment Banking" },
  { id: "71",  name: "Investment Management" },
  { id: "74",  name: "Law Practice" },
  { id: "75",  name: "Legal Services" },
  { id: "77",  name: "Leisure, Travel & Tourism" },
  { id: "79",  name: "Logistics & Supply Chain" },
  { id: "80",  name: "Luxury Goods & Jewelry" },
  { id: "81",  name: "Machinery" },
  { id: "82",  name: "Management Consulting" },
  { id: "84",  name: "Market Research" },
  { id: "85",  name: "Marketing & Advertising" },
  { id: "86",  name: "Mechanical or Industrial Engineering" },
  { id: "87",  name: "Media Production" },
  { id: "88",  name: "Medical Device" },
  { id: "89",  name: "Medical Practice" },
  { id: "90",  name: "Mental Health Care" },
  { id: "92",  name: "Mining & Metals" },
  { id: "96",  name: "Nanotechnology" },
  { id: "98",  name: "Nonprofit Organization Management" },
  { id: "99",  name: "Oil & Energy" },
  { id: "100", name: "Online Media" },
  { id: "102", name: "Package / Freight Delivery" },
  { id: "106", name: "Pharmaceuticals" },
  { id: "107", name: "Philanthropy" },
  { id: "111", name: "Primary / Secondary Education" },
  { id: "113", name: "Professional Training & Coaching" },
  { id: "115", name: "Public Policy" },
  { id: "116", name: "Public Relations & Communications" },
  { id: "117", name: "Public Safety" },
  { id: "118", name: "Publishing" },
  { id: "121", name: "Real Estate" },
  { id: "124", name: "Renewables & Environment" },
  { id: "125", name: "Research" },
  { id: "126", name: "Restaurants" },
  { id: "127", name: "Retail" },
  { id: "128", name: "Security & Investigations" },
  { id: "129", name: "Semiconductors" },
  { id: "132", name: "Sports" },
  { id: "133", name: "Staffing & Recruiting" },
  { id: "135", name: "Telecommunications" },
  { id: "137", name: "Think Tanks" },
  { id: "140", name: "Transportation / Trucking / Railroad" },
  { id: "141", name: "Utilities" },
  { id: "142", name: "Venture Capital & Private Equity" },
  { id: "144", name: "Warehousing" },
  { id: "145", name: "Wholesale" },
  { id: "147", name: "Wireless" },
  { id: "148", name: "Writing & Editing" },
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
  const [loadingCount, setLoadingCount] = useState(0);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [seniority, setSeniority] = useState([]);
  const [industry, setIndustry] = useState("");
  const [jobTitles, setJobTitles] = useState([]);
  const [jobTitleInput, setJobTitleInput] = useState("");
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
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [pendingListLeads, setPendingListLeads] = useState(null); // overrides selection when set
  const [leadLists, setLeadLists] = useState([]);
  const [savingToList, setSavingToList] = useState(false);
  const [savedToList, setSavedToList] = useState(false);

  // ── Workspace members ─────────────────────────────────────────
  const [workspaceMembers, setWorkspaceMembers] = useState([]);

  // ── Results table search + sort ───────────────────────────────
  const [tableSearch, setTableSearch] = useState("");
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

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

  // Load lead lists
  useEffect(() => {
    listsApi.list().then((data) => setLeadLists(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // Load LinkedIn accounts for ImportContactsModal user picker
  useEffect(() => {
    unipile.getAccounts().then((data) => {
      setWorkspaceMembers(Array.isArray(data?.items) ? data.items : []);
    }).catch(() => {});
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

  function openListPicker(overrideLeads) {
    setPendingListLeads(overrideLeads || null);
    setListPickerOpen(true);
  }

  async function handleCreateList(name) {
    const created = await listsApi.create(name);
    setLeadLists((prev) => [...prev, created]);
    return created;
  }

  async function saveToList(listId) {
    const leadsToSave = pendingListLeads || tableRows.filter((r) => selected.includes(r.id));
    if (!leadsToSave.length) return;
    setSavingToList(true);
    setSavedToList(false);
    try {
      await leadsApi.bulkCreate(leadsToSave, listId);
      setSavedToList(true);
      setListPickerOpen(false);
      setPendingListLeads(null);
      setSelected([]);
      setTimeout(() => setSavedToList(false), 3000);
    } catch {}
    setSavingToList(false);
  }

  async function handleImportConfirm({ listId }) {
    await saveToList(listId);
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

  const addJobTitle = (raw) => {
    const t = (raw ?? jobTitleInput).trim();
    setJobTitleInput("");
    if (!t) return;
    setJobTitles((prev) =>
      prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t],
    );
  };
  const removeJobTitle = (t) =>
    setJobTitles((prev) => prev.filter((x) => x !== t));
  const handleJobTitleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addJobTitle();
    } else if (e.key === "Backspace" && !jobTitleInput && jobTitles.length) {
      removeJobTitle(jobTitles[jobTitles.length - 1]);
    }
  };

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
    setLoadingCount(0);
    setSelected([]);
    setFilterError("");
    setFilterSource("");
    try {
      const trimmedUrl = linkedinSearchUrl.trim();
      // Include any title still in the input that wasn't turned into a tag yet
      const pendingTitle = jobTitleInput.trim();
      const allTitles = [
        ...jobTitles,
        ...(pendingTitle &&
        !jobTitles.some((x) => x.toLowerCase() === pendingTitle.toLowerCase())
          ? [pendingTitle]
          : []),
      ];
      // LinkedIn keyword search supports boolean OR with quoted phrases:
      //   ("Head of Sales" OR "VP Sales")
      const titleQuery =
        allTitles.length > 1
          ? `(${allTitles.map((t) => `"${t}"`).join(" OR ")})`
          : allTitles[0] || "";
      const trimmedLocation = location.trim();

      const basePayload = {
        url: trimmedUrl || undefined,
        title: !trimmedUrl ? titleQuery || undefined : undefined,
        industry_id: !trimmedUrl && industry ? industry : undefined,
        location_text: !trimmedUrl ? trimmedLocation || undefined : undefined,
        seniority: !trimmedUrl && seniority.length > 0 ? seniority : undefined,
        company_sizes: !trimmedUrl && sizes.length > 0 ? sizes : undefined,
      };

      const allItems = [];
      let cursor = undefined;
      let source = "";
      for (let i = 0; i < 100; i += 1) {
        const data = await unipile.searchPeople(accountId, {
          ...basePayload,
          cursor,
        });
        const items =
          data?.items || data?.objects || data?.users || data?.results || [];
        allItems.push(...items);
        setLoadingCount(allItems.length);
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
    setIndustry("");  // ID string — empty = "Any industry"
    setJobTitles([]);
    setJobTitleInput("");
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

  function handleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  const displayRows = useMemo(() => {
    let rows = tableRows;
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.title || "").toLowerCase().includes(q) ||
          (r.company || "").toLowerCase().includes(q),
      );
    }
    if (sortBy) {
      rows = [...rows].sort((a, b) => {
        const av = (a[sortBy] || "").toLowerCase();
        const bv = (b[sortBy] || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return rows;
  }, [tableRows, tableSearch, sortBy, sortDir]);
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
                <div className="filter-label">Job Titles</div>
                <div className="tag-input">
                  {jobTitles.map((t) => (
                    <span key={t} className="tag-chip">
                      {t}
                      <button
                        type="button"
                        className="tag-chip-remove"
                        onClick={() => removeJobTitle(t)}
                        aria-label={`Remove ${t}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="tag-input-field"
                    placeholder={
                      jobTitles.length
                        ? "Add another…"
                        : "e.g. Managing Partner"
                    }
                    value={jobTitleInput}
                    onChange={(e) => setJobTitleInput(e.target.value)}
                    onKeyDown={handleJobTitleKeyDown}
                    onBlur={() => addJobTitle()}
                  />
                </div>
                <div className="filter-hint">
                  Press Enter or comma to add. Multiple titles are matched with
                  OR.
                </div>
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
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openListPicker([profileResult])}
                  >
                    {savedToList ? "✓ Saved" : "Save to List"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openCampaignPicker([profileResult])}
                  >
                    Add to Campaign
                  </button>
                </div>
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
              <div className="search-radar">
                <div className="search-radar-ring" />
                <div className="search-radar-ring" />
                <div className="search-radar-ring" />
                <div className="search-radar-icon">◎</div>
              </div>
              <p style={{ color: "var(--text-secondary)", fontWeight: 600, marginTop: 4 }}>
                {mode === "filters" ? "Searching LinkedIn…" : "Fetching post engagers…"}
              </p>
              {mode === "filters" && loadingCount > 0 && (
                <p style={{ color: "var(--signal)", fontSize: 13, margin: 0 }}>
                  {loadingCount} profiles found so far
                </p>
              )}
              <div className="search-dots">
                <span /><span /><span />
              </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {displayRows.length !== tableRows.length
                      ? `${displayRows.length} of ${tableRows.length}`
                      : tableRows.length}{" "}
                    {mode === "engagers" ? `${engagerType} found` : "matches found"}
                  </span>
                  {mode === "filters" && !tableSearch && (
                    <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {filterSource === "connections" ? "from your connections" : "from LinkedIn"}
                    </span>
                  )}
                  {tableRows.length > 0 && (
                    <input
                      className="input"
                      style={{ fontSize: 12, padding: "5px 10px", height: "auto", maxWidth: 220 }}
                      placeholder="Filter results…"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                    />
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
                        selected.length === displayRows.length
                          ? []
                          : displayRows.map((r) => r.id),
                      )
                    }
                  >
                    {selected.length > 0 && selected.length === displayRows.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={selected.length === 0}
                    onClick={() => openListPicker()}
                  >
                    {savedToList ? "✓ Saved" : "Save to List"}
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
                      {[
                        { key: "name", label: "Name" },
                        { key: "title", label: "Job Title" },
                        { key: "company", label: "Company" },
                        { key: "location", label: "Location" },
                      ].map(({ key, label }) => (
                        <th
                          key={key}
                          style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                          onClick={() => handleSort(key)}
                        >
                          {label}{" "}
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {sortBy === key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                          </span>
                        </th>
                      ))}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r) => (
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

      {/* Import contacts modal */}
      <ImportContactsModal
        open={listPickerOpen}
        onClose={() => { setListPickerOpen(false); setPendingListLeads(null); }}
        onConfirm={handleImportConfirm}
        members={workspaceMembers}
        lists={leadLists}
        onCreateList={handleCreateList}
        saving={savingToList}
      />

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
