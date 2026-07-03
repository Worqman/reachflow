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

  const MODES_CLEAN = [
    { id: "filters", label: "Search" },
    { id: "url", label: "LinkedIn URL" },
    { id: "engagers", label: "Post Engagers" },
  ];

  return (
    <div className="lf-page">
      {/* Header */}
      <div className="lf-header">
        <div>
          <div className="lf-title">Lead Finder</div>
          <div className="lf-subtitle">Search LinkedIn and import leads into your campaigns</div>
        </div>
      </div>

      {/* Mode selector */}
      <div className="lf-mode-tabs">
        {MODES_CLEAN.map((m) => (
          <button
            key={m.id}
            className={`lf-mode-tab${mode === m.id ? " active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="lf-search-card">
        {mode === "filters" && (
          <>
            <div className="lf-field lf-field-grow">
              <span className="lf-label">Job Title</span>
              <div className="tag-input">
                {jobTitles.map((t) => (
                  <span key={t} className="tag-chip">
                    {t}
                    <button type="button" className="tag-chip-remove" onClick={() => removeJobTitle(t)}>×</button>
                  </span>
                ))}
                <input
                  className="tag-input-field"
                  placeholder={jobTitles.length ? "Add another…" : "e.g. Managing Partner"}
                  value={jobTitleInput}
                  onChange={(e) => setJobTitleInput(e.target.value)}
                  onKeyDown={handleJobTitleKeyDown}
                  onBlur={() => addJobTitle()}
                />
              </div>
            </div>
            <div className="lf-field">
              <span className="lf-label">Location</span>
              <input className="lf-input" placeholder="e.g. United Kingdom" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="lf-field">
              <span className="lf-label">Industry</span>
              <select className="lf-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Any industry</option>
                {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="lf-field">
              <span className="lf-label">Account</span>
              <select className="lf-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {unipileAccounts.length === 0
                  ? <option value="">No accounts connected</option>
                  : unipileAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>)}
              </select>
            </div>
            <div className="lf-field lf-field-btns">
              {searched && <button className="lf-reset-btn" onClick={handleReset}>Reset</button>}
              <button className="lf-btn" onClick={handleFilterSearch} disabled={loading}>
                {loading ? "Searching…" : "Search LinkedIn"}
              </button>
            </div>
          </>
        )}

        {mode === "url" && (
          <>
            <div className="lf-field lf-field-grow">
              <span className="lf-label">LinkedIn Profile URL</span>
              <input
                className="lf-input"
                placeholder="https://www.linkedin.com/in/..."
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProfileSearch()}
              />
            </div>
            <div className="lf-field">
              <span className="lf-label">Account</span>
              <select className="lf-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {unipileAccounts.length === 0
                  ? <option value="">No accounts connected</option>
                  : unipileAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>)}
              </select>
            </div>
            <div className="lf-field lf-field-btns">
              <button className="lf-btn" onClick={handleProfileSearch} disabled={profileLoading || !profileUrl.trim()}>
                {profileLoading ? "Looking up…" : "Look Up Profile"}
              </button>
            </div>
          </>
        )}

        {mode === "engagers" && (
          <>
            <div className="lf-field lf-field-grow">
              <span className="lf-label">LinkedIn Post URL</span>
              <input
                className="lf-input"
                placeholder="https://www.linkedin.com/feed/update/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEngagersSearch()}
              />
            </div>
            <div className="lf-field">
              <span className="lf-label">Engagement Type</span>
              <div style={{ display: "flex", gap: 5 }}>
                {[{ id: "likers", label: "Likers" }, { id: "comments", label: "Comments" }].map((t) => (
                  <button key={t.id} className={`lf-type-toggle${engagerType === t.id ? " active" : ""}`} onClick={() => setEngagerType(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="lf-field">
              <span className="lf-label">Account</span>
              <select className="lf-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {unipileAccounts.length === 0
                  ? <option value="">No accounts connected</option>
                  : unipileAccounts.map((a) => <option key={a.id} value={a.id}>{a.name || a.username || a.id}</option>)}
              </select>
            </div>
            <div className="lf-field lf-field-btns">
              <button className="lf-btn" onClick={handleEngagersSearch} disabled={engagersLoading || !postUrl.trim()}>
                {engagersLoading ? "Fetching…" : "Get Engagers"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Extra filters — company size & seniority (search mode only) */}
      {mode === "filters" && (
        <div className="lf-extra-filters">
          <div className="lf-extra-row">
            <span className="lf-extra-label">Company size</span>
            <div className="lf-toggles">
              {SIZES.map((s) => (
                <button key={s} className={`lf-toggle${sizes.includes(s) ? " active" : ""}`} onClick={() => toggleSize(s)}>{s}</button>
              ))}
            </div>
            {sizes.length > 0 && <button className="lf-extra-clear" onClick={() => setSizes([])}>Clear</button>}
          </div>
          <div className="lf-extra-row">
            <span className="lf-extra-label">Seniority</span>
            <div className="lf-toggles">
              {SENIORITY.map((s) => (
                <button key={s} className={`lf-toggle${seniority.includes(s) ? " active" : ""}`} onClick={() => toggleSeniority(s)}>{s}</button>
              ))}
            </div>
            {seniority.length > 0 && <button className="lf-extra-clear" onClick={() => setSeniority([])}>Clear</button>}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="lf-results-card">
        {/* URL mode */}
        {mode === "url" && (
          profileLoading ? (
            <div className="empty-state">
              <div className="search-radar">
                <div className="search-radar-ring" /><div className="search-radar-ring" /><div className="search-radar-ring" />
                <div className="search-radar-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
              </div>
              <div className="empty-title">Fetching profile…</div>
              <div className="search-dots"><span /><span /><span /></div>
            </div>
          ) : profileError ? (
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
              <div className="empty-title">Could not fetch profile</div>
              <div className="empty-desc">{profileError}</div>
            </div>
          ) : profileResult ? (
            <>
              <div className="results-header">
                <span className="results-count">Profile found</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="results-btn results-btn-outline" onClick={() => openListPicker([profileResult])}>
                    {savedToList ? "✓ Saved" : "Save to List"}
                  </button>
                  <button className="results-btn results-btn-dark" onClick={() => openCampaignPicker([profileResult])}>
                    Add to Campaign
                  </button>
                </div>
              </div>
              <div className="profile-card">
                <div className="profile-card-inner">
                  {profileResult.profilePictureUrl ? (
                    <img src={profileResult.profilePictureUrl} alt={profileResult.name} className="profile-avatar-large" />
                  ) : (
                    <div className="profile-avatar-placeholder-large">{profileResult.name[0]}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="profile-name">{profileResult.name}</div>
                    {profileResult.title && <div className="profile-title">{profileResult.title}</div>}
                    {profileResult.company && <div className="profile-company">at {profileResult.company}</div>}
                    {profileResult.location && <div className="profile-location">{profileResult.location}</div>}
                    {profileResult.linkedinUrl && (
                      <a href={profileResult.linkedinUrl} target="_blank" rel="noreferrer" className="profile-li-link">
                        View on LinkedIn
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                      </a>
                    )}
                  </div>
                  <span className="table-status-badge">Not contacted</span>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div className="empty-title">Look up a LinkedIn profile</div>
              <div className="empty-desc">Paste a LinkedIn profile URL above and click Look Up Profile.</div>
            </div>
          )
        )}

        {/* Search + Engagers table */}
        {(mode === "filters" || mode === "engagers") && (
          !showTable && !showLoading ? (
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              {mode === "filters" ? (
                <>
                  <div className="empty-title">Search LinkedIn</div>
                  <div className="empty-desc">Set your filters above and click Search LinkedIn to find leads.</div>
                  <div className="how-it-works">
                    <div className="how-step"><span className="how-num">1</span> Set filters</div>
                    <div className="how-arrow">→</div>
                    <div className="how-step"><span className="how-num">2</span> Preview matches</div>
                    <div className="how-arrow">→</div>
                    <div className="how-step"><span className="how-num">3</span> Import to campaign</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="empty-title">Find post engagers</div>
                  <div className="empty-desc">Paste a LinkedIn post URL above to see everyone who liked or commented — ready to import as leads.</div>
                  <div className="how-it-works">
                    <div className="how-step"><span className="how-num">1</span> Paste post URL</div>
                    <div className="how-arrow">→</div>
                    <div className="how-step"><span className="how-num">2</span> Choose likers / comments</div>
                    <div className="how-arrow">→</div>
                    <div className="how-step"><span className="how-num">3</span> Import to campaign</div>
                  </div>
                </>
              )}
            </div>
          ) : showLoading ? (
            <div className="empty-state">
              <div className="search-radar">
                <div className="search-radar-ring" /><div className="search-radar-ring" /><div className="search-radar-ring" />
                <div className="search-radar-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
              </div>
              <div className="empty-title">
                {mode === "filters" ? "Searching LinkedIn…" : "Fetching post engagers…"}
              </div>
              {mode === "filters" && loadingCount > 0 && (
                <div style={{ color: "#6366f1", fontSize: 13 }}>{loadingCount} profiles found so far</div>
              )}
              <div className="search-dots"><span /><span /><span /></div>
            </div>
          ) : (engagersError && mode === "engagers") ? (
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
              <div className="empty-title">Could not fetch engagers</div>
              <div className="empty-desc">{engagersError}</div>
            </div>
          ) : (filterError && mode === "filters") ? (
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
              <div className="empty-title">Search failed</div>
              <div className="empty-desc">{filterError}</div>
            </div>
          ) : (
            <>
              <div className="results-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span className="results-count">
                    {displayRows.length !== tableRows.length ? `${displayRows.length} of ${tableRows.length}` : tableRows.length}{" "}
                    {mode === "engagers" ? `${engagerType} found` : "matches"}
                  </span>
                  {mode === "filters" && !tableSearch && filterSource && (
                    <span className="results-source">
                      {filterSource === "connections" ? "from your connections" : "from LinkedIn"}
                    </span>
                  )}
                  {tableRows.length > 0 && (
                    <div className="results-filter-wrap">
                      <span className="results-filter-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </span>
                      <input className="results-filter-input" placeholder="Filter results…" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {selected.length > 0 && <span className="results-selected-count">{selected.length} selected</span>}
                  <button className="results-btn results-btn-outline" onClick={() => setSelected(selected.length === displayRows.length ? [] : displayRows.map((r) => r.id))}>
                    {selected.length > 0 && selected.length === displayRows.length ? "Deselect All" : "Select All"}
                  </button>
                  <button className="results-btn results-btn-outline" disabled={selected.length === 0} onClick={() => openListPicker()}>
                    {savedToList ? "✓ Saved" : "Save to List"}
                  </button>
                  <button className="results-btn results-btn-dark" disabled={selected.length === 0} onClick={() => openCampaignPicker(tableRows.filter((r) => selected.includes(r.id)))}>
                    Add to Campaign ({selected.length})
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th style={{ width: 44 }}></th>
                      {[
                        { key: "name", label: "Name" },
                        { key: "title", label: "Job Title" },
                        { key: "company", label: "Company" },
                        { key: "location", label: "Location" },
                      ].map(({ key, label }) => (
                        <th key={key} className="sortable" onClick={() => handleSort(key)}>
                          {label}
                          {sortBy === key && (
                            <svg style={{ width: 9, height: 9, marginLeft: 3 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points={sortDir === "asc" ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                            </svg>
                          )}
                        </th>
                      ))}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r) => (
                      <tr key={r.id}>
                        <td className="checkbox-cell">
                          <input type="checkbox" className="table-result-checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td>
                          {r.profilePictureUrl ? (
                            <img src={r.profilePictureUrl} alt={r.name} className="table-avatar" />
                          ) : (
                            <div className="table-avatar-placeholder">{r.name?.[0]?.toUpperCase() || "?"}</div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: "#111827" }}>{r.name}</td>
                        <td style={{ color: "#6b7280" }}>{r.title}</td>
                        <td style={{ color: "#374151" }}>{r.company}</td>
                        <td style={{ color: "#9ca3af", fontSize: 12 }}>{r.location}</td>
                        <td><span className="table-status-badge">{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {/* Modals */}
      <ImportContactsModal
        open={listPickerOpen}
        onClose={() => { setListPickerOpen(false); setPendingListLeads(null); }}
        onConfirm={handleImportConfirm}
        members={workspaceMembers}
        lists={leadLists}
        onCreateList={handleCreateList}
        saving={savingToList}
      />

      {pickerOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setPickerOpen(false)}>
          <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add to Campaign</h2>
              <button className="modal-close" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 14 }}>
                Adding {pendingLeads.length} lead{pendingLeads.length !== 1 ? "s" : ""} — choose a campaign:
              </p>
              {campaignList.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13 }}>No campaigns found. Create one first.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {campaignList.map((c) => (
                    <button key={c.id} className="campaign-picker-row" disabled={addingToCampaign === c.id} onClick={() => addToCampaign(c.id)}>
                      <span className="campaign-picker-name">{c.name}</span>
                      <span className="campaign-picker-meta">
                        {addingToCampaign === c.id ? "Adding…" : c.status === "active" ? "● Active" : "Paused"}
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
