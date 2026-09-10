import { useEffect, useMemo, useState } from "react";
import {
  campaigns as campaignsApi,
  leads as leadsApi,
  leadLists as listsApi,
  unipile,
} from "../lib/api";
import {
  INDUSTRIES,
  SIZES,
  SENIORITY,
  normaliseProfile,
} from "../pages/LeadFinder";
import "../pages/LeadFinder.css";

const MODES = [
  { id: "filters", label: "Search" },
  { id: "url", label: "LinkedIn URL" },
  { id: "engagers", label: "Post Engagers" },
];

// Modal version of the Lead Extractor page (src/pages/LeadFinder.jsx),
// scoped to a single campaign so leads go straight in — no "which
// campaign" picker step, since campaignId is already known here.
export default function LeadExtractorModal({ open, onClose, onImport, campaignId }) {
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
  const [filterError, setFilterError] = useState("");
  const [filterSource, setFilterSource] = useState("");

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

  // ── Add to campaign state (campaignId is fixed, no picker step) ─
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [heldLeads, setHeldLeads] = useState([]);
  const [addToCampaignError, setAddToCampaignError] = useState("");
  const [forcingHeld, setForcingHeld] = useState(false);

  // ── Save to List state ────────────────────────────────────────
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [pendingListLeads, setPendingListLeads] = useState(null);
  const [leadLists, setLeadLists] = useState([]);
  const [savingToList, setSavingToList] = useState(false);
  const [savedToList, setSavedToList] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  // ── Results table search + sort ───────────────────────────────
  const [tableSearch, setTableSearch] = useState("");
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    if (!open) return;
    unipile
      .getAccounts()
      .then((data) => {
        const items = data?.items || [];
        setUnipileAccounts(items);
        if (items.length > 0) setAccountId(items[0].id);
      })
      .catch(() => {});
    listsApi
      .list()
      .then((data) => setLeadLists(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [open]);

  // Reset everything when the modal closes so reopening starts fresh.
  useEffect(() => {
    if (open) return;
    setMode("filters");
    setSearched(false);
    setResults([]);
    setSelected([]);
    setSizes([]);
    setSeniority([]);
    setIndustry("");
    setJobTitles([]);
    setJobTitleInput("");
    setLocation("");
    setFilterError("");
    setFilterSource("");
    setProfileUrl("");
    setProfileResult(null);
    setProfileError("");
    setPostUrl("");
    setEngagersResults([]);
    setEngagersSearched(false);
    setEngagersError("");
    setHeldLeads([]);
    setAddToCampaignError("");
    setTableSearch("");
    setSortBy(null);
  }, [open]);

  function openListPicker(overrideLeads) {
    setPendingListLeads(overrideLeads || null);
    setListPickerOpen(true);
  }

  function closeListPicker() {
    setListPickerOpen(false);
    setPendingListLeads(null);
    setShowNewList(false);
    setNewListName("");
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
      closeListPicker();
      setTimeout(() => setSavedToList(false), 3000);
    } catch {}
    setSavingToList(false);
  }

  async function handleCreateListAndSave() {
    const name = newListName.trim();
    if (!name) return;
    setCreatingList(true);
    try {
      const created = await handleCreateList(name);
      await saveToList(created.id);
    } catch {}
    setCreatingList(false);
  }

  // ── Add to campaign (campaignId already fixed) ─────────────────
  async function addToCampaign(rows) {
    if (!rows.length) return;
    setAddingToCampaign(true);
    setAddToCampaignError("");
    try {
      const res = await campaignsApi.importLeads(campaignId, { leads: rows });
      if (res?.held?.length) {
        setHeldLeads(res.held);
        setSelected([]);
      } else {
        setSelected([]);
        onImport?.();
        onClose();
      }
    } catch (err) {
      setAddToCampaignError(err.message || "Could not add leads to campaign");
    }
    setAddingToCampaign(false);
  }

  async function forceAddHeldLeads() {
    if (!heldLeads.length) return;
    setForcingHeld(true);
    setAddToCampaignError("");
    try {
      await campaignsApi.importLeads(campaignId, {
        leads: heldLeads.map((h) => ({ ...h, force: true })),
      });
      setHeldLeads([]);
      onImport?.();
      onClose();
    } catch (err) {
      setAddToCampaignError(err.message || "Could not add leads to campaign");
    }
    setForcingHeld(false);
  }

  // ── Filters mode ─────────────────────────────────────────────
  const toggleSize = (s) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleSeniority = (s) =>
    setSeniority((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleSelect = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addJobTitle = (raw) => {
    const t = (raw ?? jobTitleInput).trim();
    setJobTitleInput("");
    if (!t) return;
    setJobTitles((prev) =>
      prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t],
    );
  };
  const removeJobTitle = (t) => setJobTitles((prev) => prev.filter((x) => x !== t));
  const handleJobTitleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addJobTitle();
    } else if (e.key === "Backspace" && !jobTitleInput && jobTitles.length) {
      removeJobTitle(jobTitles[jobTitles.length - 1]);
    }
  };

  const handleFilterSearch = async () => {
    if (!accountId) {
      setFilterError("No LinkedIn account connected. Go to Settings → Workspace.");
      return;
    }
    setLoading(true);
    setLoadingCount(0);
    setSelected([]);
    setFilterError("");
    setFilterSource("");
    try {
      const pendingTitle = jobTitleInput.trim();
      const allTitles = [
        ...jobTitles,
        ...(pendingTitle && !jobTitles.some((x) => x.toLowerCase() === pendingTitle.toLowerCase())
          ? [pendingTitle]
          : []),
      ];
      const titleQuery =
        allTitles.length > 1
          ? `(${allTitles.map((t) => `"${t}"`).join(" OR ")})`
          : allTitles[0] || "";
      const trimmedLocation = location.trim();

      const basePayload = {
        title: titleQuery || undefined,
        industry_id: industry || undefined,
        location_text: trimmedLocation || undefined,
        seniority: seniority.length > 0 ? seniority : undefined,
        company_sizes: sizes.length > 0 ? sizes : undefined,
      };

      const allItems = [];
      let cursor = undefined;
      let source = "";
      for (let i = 0; i < 100; i += 1) {
        const data = await unipile.searchPeople(accountId, { ...basePayload, cursor });
        const items = data?.items || data?.objects || data?.users || data?.results || [];
        allItems.push(...items);
        setLoadingCount(allItems.length);
        if (!source) source = data?.source || "";
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
    setJobTitles([]);
    setJobTitleInput("");
    setLocation("");
    setSearched(false);
    setResults([]);
    setFilterError("");
    setFilterSource("");
  };

  // ── URL mode ─────────────────────────────────────────────────
  async function handleProfileSearch() {
    if (!profileUrl.trim()) return;
    if (!accountId) {
      setProfileError("No LinkedIn account connected. Go to Settings → Workspace.");
      return;
    }
    setProfileLoading(true);
    setProfileResult(null);
    setProfileError("");
    try {
      const data = await unipile.getLinkedInProfile(accountId, profileUrl.trim());
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
      setEngagersError("No LinkedIn account connected. Go to Settings → Workspace.");
      return;
    }
    setEngagersLoading(true);
    setEngagersResults([]);
    setEngagersSearched(false);
    setEngagersError("");
    setSelected([]);
    try {
      const data = await unipile.getPostEngagers(accountId, postUrl.trim(), engagerType);
      const items = data?.items || data?.objects || data?.reactions || data?.comments || data?.users || [];
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
    else {
      setSortBy(col);
      setSortDir("asc");
    }
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

  const showTable = mode === "filters" ? searched : mode === "engagers" ? engagersSearched : false;
  const showLoading = mode === "filters" ? loading : mode === "engagers" ? engagersLoading : profileLoading;

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box animate-fade-in"
        style={{ maxWidth: 1040, width: "100%", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">◎ Lead Extractor</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: 0 }}>
          <div className="lf-page" style={{ height: "auto", overflow: "visible", padding: "16px 24px 24px" }}>
            {/* Mode selector */}
            <div className="lf-mode-tabs">
              {MODES.map((m) => (
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

            {addToCampaignError && (
              <div style={{ color: "var(--danger, #e55)", fontSize: 13, marginTop: -4 }}>{addToCampaignError}</div>
            )}

            {/* Held leads — below the campaign's intent threshold */}
            {heldLeads.length > 0 && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--surface)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Held — below intent threshold</div>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 10 }}>
                  {heldLeads.length} lead{heldLeads.length !== 1 ? "s" : ""} scored below this campaign's intent
                  threshold and {heldLeads.length !== 1 ? "weren't" : "wasn't"} added automatically.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 200, overflowY: "auto" }}>
                  {heldLeads.map((h, i) => (
                    <div key={h.providerId || i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{h.score}/100 · {h.threshold} required</span>
                      </div>
                      {h.reason && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{h.reason}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setHeldLeads([])}>Dismiss</button>
                  <button className="btn btn-primary btn-sm" disabled={forcingHeld} onClick={forceAddHeldLeads}>
                    {forcingHeld ? "Adding…" : `Add anyway (${heldLeads.length})`}
                  </button>
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
                        <button className="results-btn results-btn-dark" disabled={addingToCampaign} onClick={() => addToCampaign([profileResult])}>
                          {addingToCampaign ? "Adding…" : "Add to Campaign"}
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
                        <button
                          className="results-btn results-btn-dark"
                          disabled={selected.length === 0 || addingToCampaign}
                          onClick={() => addToCampaign(tableRows.filter((r) => selected.includes(r.id)))}
                        >
                          {addingToCampaign ? "Adding…" : `Add to Campaign (${selected.length})`}
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
          </div>
        </div>
      </div>

      {/* Save to List */}
      {listPickerOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeListPicker()}>
          <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Save to List</h2>
              <button className="modal-close" onClick={closeListPicker}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 14 }}>
                Saving {(pendingListLeads || tableRows.filter((r) => selected.includes(r.id))).length} lead
                {(pendingListLeads || tableRows.filter((r) => selected.includes(r.id))).length !== 1 ? "s" : ""} — choose a list:
              </p>
              {leadLists.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 14 }}>No lists yet — create one below.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {leadLists.map((l) => (
                    <button key={l.id} className="campaign-picker-row" disabled={savingToList} onClick={() => saveToList(l.id)}>
                      <span className="campaign-picker-name">{l.name}</span>
                      <span className="campaign-picker-meta">{savingToList ? "Saving…" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {showNewList ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    autoFocus
                    className="input"
                    placeholder="List name…"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateListAndSave();
                      if (e.key === "Escape") { setShowNewList(false); setNewListName(""); }
                    }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={creatingList || !newListName.trim()}
                    onClick={handleCreateListAndSave}
                    style={{ flexShrink: 0 }}
                  >
                    {creatingList ? "…" : "Create"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setShowNewList(false); setNewListName(""); }}
                    style={{ flexShrink: 0, padding: "5px 8px" }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowNewList(true)}
                  style={{
                    border: "1px dashed var(--border-2)",
                    color: "var(--signal)",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  + Create a new list
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
