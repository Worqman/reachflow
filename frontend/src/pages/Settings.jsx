import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import {
  companyProfiles,
  settings,
  unipile,
  workspace as workspaceApi,
} from "../lib/api";
import {
  getActiveWorkspaceId,
  onActiveWorkspaceChange,
} from "../lib/workspaceState";
import "./Settings.css";

// Static metadata — status is fetched live from the backend
const INTEGRATION_META = {
  unipile: {
    name: "Unipile",
    desc: "LinkedIn account management & messaging",
    icon: "◈",
  },
  apollo: {
    name: "Apollo.io",
    desc: "Lead database & enrichment (300M+ contacts)",
    icon: "◎",
  },
  trigify: {
    name: "Trigify",
    desc: "Real-time LinkedIn intent signal monitoring",
    icon: "◆",
  },
  anthropic: {
    name: "Anthropic",
    desc: "AI model powering all agents & generation",
    icon: "◇",
  },
  supabase: { name: "Supabase", desc: "Authentication & database", icon: "◉" },
  redis: { name: "Redis", desc: "Message queue for paced outreach", icon: "⬡" },
};

const STATUS_META = {
  connected: { label: "Connected", class: "badge-signal" },
  not_connected: { label: "Not Connected", class: "badge-muted" },
  error: { label: "Error", class: "badge-danger" },
};

export default function Settings() {
  const [section, setSection] = useState("profile");
  const location = useLocation();

  // Auto-switch to workspace tab when returning from Unipile OAuth
  useEffect(() => {
    if (new URLSearchParams(location.search).has("unipile")) {
      setSection("workspace");
    }
  }, [location.search]);

  return (
    <div className="settings-layout page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>
      <div className="settings-body">
        <nav className="settings-nav">
          {[
            { id: "profile", label: "Company Profile", icon: "◈" },
            { id: "my_profile", label: "My Profile", icon: "◉" },

            { id: "workspace", label: "Workspace", icon: "⬕" },
            { id: "billing", label: "Billing", icon: "◇" },
          ].map((s) => (
            <button
              key={s.id}
              className={`settings-nav-item ${section === s.id ? "active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "profile" && <CompanyProfileSection />}
          {section === "my_profile" && <MyProfileSection />}
          {section === "integrations" && <IntegrationsSection />}
          {section === "workspace" && <WorkspaceSection />}
          {section === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}

function CompanyProfileSection() {
  const { toast } = useToast();
  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId());
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({
    company_name: "",
    website_url: "",
    company_description: "",
    value_proposition: "",
    services_offered_text: "",
    // Must match DB constraint if set. Default to null/empty to avoid insert failures.
    tone_preference: "",
    calendar_link: "",
    social_proof_text: "",
  });

  async function load(wsId) {
    setLoading(true);
    setError("");
    try {
      if (!wsId) {
        setProfiles([]);
        setSelectedId(null);
        setForm((f) => ({
          ...f,
          company_name: "",
          website_url: "",
          company_description: "",
          value_proposition: "",
          services_offered_text: "",
          tone_preference: "",
          calendar_link: "",
          social_proof_text: "",
        }));
        return;
      }

      const res = await companyProfiles.list(wsId);
      const list = res?.profiles || [];
      setProfiles(list);
      const active = list[0] || null;
      setSelectedId(active?.id || null);

      if (!active) {
        setForm((f) => ({
          ...f,
          company_name: "",
          website_url: "",
          company_description: "",
          value_proposition: "",
          services_offered_text: "",
          tone_preference: "",
          calendar_link: "",
          social_proof_text: "",
        }));
        return;
      }

      setForm({
        company_name: active.company_name || "",
        website_url: active.website_url || "",
        company_description: active.company_description || "",
        value_proposition: active.value_proposition || "",
        services_offered_text: Array.isArray(active.services_offered)
          ? active.services_offered.join("\n")
          : "",
        tone_preference: active.tone_preference || "",
        calendar_link: active.calendar_link || "",
        social_proof_text: Array.isArray(active.social_proof)
          ? active.social_proof.join("\n")
          : "",
      });
    } catch (e) {
      setError(e?.message || "Failed to load company profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(workspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    const unsub = onActiveWorkspaceChange((id) => setWorkspaceId(id));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceName("");
      return;
    }
    workspaceApi
      .get()
      .then((res) => {
        setWorkspaceName(res?.workspace?.name || "");
      })
      .catch(() => {});
  }, [workspaceId]);

  function parseLines(text) {
    return String(text || "")
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function toneVariants(value) {
    const raw = String(value || "").trim();
    if (!raw) return [];
    const lower = raw.toLowerCase();
    const toSnake = lower.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const toKebab = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const compact = lower.replace(/[^a-z0-9]+/g, "").trim();
    const upperSnake = toSnake ? toSnake.toUpperCase() : "";

    const capWord = (w) => (w ? w[0].toUpperCase() + w.slice(1) : "");
    const titleCaseKebab = toKebab
      ? toKebab.split("-").filter(Boolean).map(capWord).join("-")
      : "";
    const titleCaseSnake = toSnake
      ? toSnake.split("_").filter(Boolean).map(capWord).join("_")
      : "";
    const spacedTitle = toKebab
      ? toKebab.split("-").filter(Boolean).map(capWord).join(" ")
      : "";

    const out = [
      raw,
      lower,
      toSnake,
      toKebab,
      compact,
      upperSnake,
      titleCaseKebab,
      titleCaseSnake,
      spacedTitle,
    ].filter(Boolean);
    return Array.from(new Set(out));
  }

  function isToneConstraintError(message) {
    const msg = String(message || "").toLowerCase();
    return (
      msg.includes("tone_preference") &&
      (msg.includes("check constraint") || msg.includes("violates"))
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const wsId = workspaceId;
      if (!wsId)
        throw new Error("Select an active workspace first (Workspaces page).");
      if (!form.company_name.trim())
        throw new Error("Company Name is required.");

      const basePayload = {
        workspace_id: wsId,
        company_name: form.company_name.trim(),
        website_url: form.website_url.trim() || null,
        company_description: form.company_description.trim() || null,
        value_proposition: form.value_proposition.trim() || null,
        services_offered: parseLines(form.services_offered_text),
        calendar_link: form.calendar_link.trim() || null,
        social_proof: parseLines(form.social_proof_text),
      };

      const tone = String(form.tone_preference || "").trim();
      const variants = tone ? toneVariants(tone) : [null];

      async function attemptSave(toneValue) {
        const payload = { ...basePayload, tone_preference: toneValue || null };
        if (selectedId)
          return await companyProfiles.update(selectedId, payload);
        return await companyProfiles.create(payload);
      }

      let result = null;
      let lastErr = null;
      const attempts = variants.length ? variants : [null];
      for (const v of attempts) {
        try {
          result = await attemptSave(v);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (!isToneConstraintError(e?.message)) break;
        }
      }
      if (lastErr) throw lastErr;

      if (selectedId) {
        toast?.("Company profile saved", "success");
        const updatedProfile = result?.profile || null;
        if (updatedProfile) {
          const next = [
            updatedProfile,
            ...profiles.filter((p) => p.id !== updatedProfile.id),
          ];
          setProfiles(next);
        }
      } else {
        const createdProfile = result?.profile || null;
        toast?.("Company profile created", "success");
        if (createdProfile) {
          setProfiles([createdProfile, ...profiles]);
          setSelectedId(createdProfile.id);
        }
      }

      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to save company profile");
      toast?.(e?.message || "Could not save company profile", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleSelect(id) {
    setSelectedId(id || null);
    if (!id) {
      setForm((f) => ({
        ...f,
        company_name: "",
        website_url: "",
        company_description: "",
        value_proposition: "",
        services_offered_text: "",
        tone_preference: "",
        calendar_link: "",
        social_proof_text: "",
      }));
      return;
    }
    const p = profiles.find((x) => String(x.id) === String(id)) || null;
    if (!p) return;
    setForm({
      company_name: p.company_name || "",
      website_url: p.website_url || "",
      company_description: p.company_description || "",
      value_proposition: p.value_proposition || "",
      services_offered_text: Array.isArray(p.services_offered)
        ? p.services_offered.join("\n")
        : "",
      tone_preference: p.tone_preference || "",
      calendar_link: p.calendar_link || "",
      social_proof_text: Array.isArray(p.social_proof)
        ? p.social_proof.join("\n")
        : "",
    });
  }

  async function handleDelete() {
    try {
      if (!selectedId) return;
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        "Delete this company profile? This cannot be undone.",
      );
      if (!ok) return;
      await companyProfiles.delete(selectedId);
      toast?.("Company profile deleted", "success");
      await load(workspaceId);
    } catch (e) {
      setError(e?.message || "Failed to delete company profile");
      toast?.(e?.message || "Could not delete company profile", "danger");
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Company Profile</h2>
      <p className="settings-section-desc">
        This information is used by all AI Agents and Campaigns to generate
        personalised outreach.
      </p>
      <div className="card" style={{ maxWidth: 600 }}>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {workspaceName && (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              {workspaceName}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginLeft: "auto",
            }}
          >
            {profiles.length > 1 && (
              <select
                className="input"
                style={{ minWidth: 200, height: 36, padding: "6px 10px" }}
                value={selectedId || ""}
                disabled={loading}
                onChange={(e) => handleSelect(e.target.value || null)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.company_name || "Untitled").slice(0, 36)}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setSelectedId(null);
                setForm({
                  company_name: "",
                  website_url: "",
                  company_description: "",
                  value_proposition: "",
                  services_offered_text: "",
                  tone_preference: "",
                  calendar_link: "",
                  social_proof_text: "",
                });
              }}
              disabled={loading || saving}
            >
              + New
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 6, color: "var(--text-muted)", fontSize: 13 }}>
            Loading company profile…
          </div>
        ) : !workspaceId ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              No active workspace selected. Go to Workspaces and select one.
            </div>
            <Link className="btn btn-secondary" to="/workspaces">
              Go to workspaces
            </Link>
          </div>
        ) : (
          <>
            <div className="input-group">
              <label className="input-label">Company Name</label>
              <input
                className="input"
                value={form.company_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company_name: e.target.value }))
                }
                placeholder="Acme Inc."
              />
            </div>
            <div className="input-group">
              <label className="input-label">Website</label>
              <input
                className="input"
                value={form.website_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, website_url: e.target.value }))
                }
                placeholder="https://acme.com"
                type="url"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Company Description</label>
              <textarea
                className="input"
                rows={3}
                value={form.company_description}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    company_description: e.target.value,
                  }))
                }
                placeholder="What does your company do?"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Value Proposition</label>
              <textarea
                className="input"
                rows={3}
                value={form.value_proposition}
                onChange={(e) =>
                  setForm((f) => ({ ...f, value_proposition: e.target.value }))
                }
                placeholder="Why should customers choose you?"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Services</label>
              <textarea
                className="input"
                rows={3}
                value={form.services_offered_text}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    services_offered_text: e.target.value,
                  }))
                }
                placeholder={
                  "One per line (or comma-separated)\nWeb design\nGoogle Ads"
                }
              />
            </div>
            <div className="input-group">
              <label className="input-label">Social Proof / Results</label>
              <textarea
                className="input"
                rows={3}
                value={form.social_proof_text}
                onChange={(e) =>
                  setForm((f) => ({ ...f, social_proof_text: e.target.value }))
                }
                placeholder={
                  "One per line (or comma-separated)\nHelped X achieve Y\nCase study: ..."
                }
              />
            </div>
            <div className="input-group">
              <label className="input-label">Default Tone</label>
              <select
                className="input"
                value={form.tone_preference || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tone_preference: e.target.value }))
                }
              >
                {form.tone_preference &&
                  !["", "professional_friendly", "casual", "formal"].includes(
                    form.tone_preference,
                  ) && (
                    <option value={form.tone_preference}>
                      {form.tone_preference}
                    </option>
                  )}
                <option value="">Not set</option>
                <option value="professional_friendly">
                  Professional-Friendly
                </option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Default Calendar Link</label>
              <input
                className="input"
                value={form.calendar_link}
                onChange={(e) =>
                  setForm((f) => ({ ...f, calendar_link: e.target.value }))
                }
                placeholder="https://calendly.com/your-link"
                type="url"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || loading}
              >
                {saving
                  ? "Saving…"
                  : selectedId
                    ? "Save Profile"
                    : "Create Profile"}
              </button>
              {selectedId && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={handleDelete}
                  disabled={saving || loading}
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MyProfileSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [fieldKeys, setFieldKeys] = useState([]);
  const [form, setForm] = useState({});

  const initials = useMemo(() => {
    const src = (form.full_name || form.company_name || "").trim();
    if (!src) return "?";
    return src
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");
  }, [form.full_name, form.company_name]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const currentUser = userRes?.user || null;

        if (!alive) return;
        setUser(currentUser);

        if (!currentUser) {
          setLoading(false);
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();

        if (profileErr && profileErr.code !== "PGRST116") throw profileErr;
        if (!alive) return;

        if (profile) {
          setFieldKeys(Object.keys(profile));
          setForm(profile);
          return;
        }

        // No row yet for this user. Infer all columns from a sample row.
        const { data: sampleRows, error: sampleErr } = await supabase
          .from("profiles")
          .select("*")
          .limit(1);

        if (sampleErr) throw sampleErr;
        const sample = sampleRows?.[0] || null;
        const keys = sample
          ? Object.keys(sample)
          : ["id", "full_name", "company_name"];
        const blank = Object.fromEntries(keys.map((k) => [k, ""]));
        blank.id = currentUser.id;

        setFieldKeys(keys);
        setForm(blank);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Failed to load profile");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  function normalizePayload(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === "string") {
        const trimmed = v.trim();
        out[k] = trimmed.length ? trimmed : null;
      } else if (v === undefined) {
        // skip
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!user?.id)
        throw new Error("You must be signed in to save your profile.");

      const payload = normalizePayload({ ...form, id: user.id });

      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertErr) throw upsertErr;
      toast?.("Profile saved", "success");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save profile");
      toast?.(e?.message || "Could not save profile", "danger");
    } finally {
      setSaving(false);
    }
  }

  function renderField(key, value) {
    const readOnly =
      key === "id" || key === "created_at" || key === "updated_at";
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    if (typeof value === "boolean") {
      return (
        <div key={key} className="input-group">
          <label className="input-label">{label}</label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <input
              type="checkbox"
              checked={!!value}
              disabled={readOnly}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.checked }))
              }
            />
            {value ? "True" : "False"}
          </label>
        </div>
      );
    }

    if (typeof value === "number") {
      return (
        <div key={key} className="input-group">
          <label className="input-label">{label}</label>
          <input
            className="input"
            type="number"
            value={Number.isFinite(value) ? value : ""}
            disabled={readOnly}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [key]: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      );
    }

    if (value && typeof value === "object") {
      return (
        <div key={key} className="input-group">
          <label className="input-label">{label}</label>
          <textarea
            className="input"
            rows={3}
            value={JSON.stringify(value, null, 2)}
            disabled
            readOnly
          />
        </div>
      );
    }

    const strVal = value == null ? "" : String(value);
    const useTextarea = strVal.length > 120;
    const InputTag = useTextarea ? "textarea" : "input";
    const inputProps = useTextarea ? { rows: 3 } : { type: "text" };

    return (
      <div key={key} className="input-group">
        <label className="input-label">{label}</label>
        <InputTag
          className="input"
          value={strVal}
          disabled={readOnly}
          readOnly={readOnly}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          {...inputProps}
        />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">My Profile</h2>
      <p className="settings-section-desc">
        This is your logged-in user profile stored in the <code>profiles</code>{" "}
        table.
      </p>
      <div className="card" style={{ maxWidth: 600 }}>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 6, color: "var(--text-muted)", fontSize: 13 }}>
            Loading profile…
          </div>
        ) : !user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              You’re not signed in. Sign in to view and edit your profile.
            </div>
            <Link className="btn btn-secondary" to="/login">
              Go to login
            </Link>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                  color: "var(--signal)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {user.email}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  User ID: {String(user.id).slice(0, 8)}…
                </div>
              </div>
            </div>

            {fieldKeys.length === 0 ? (
              <div
                style={{ padding: 6, color: "var(--text-muted)", fontSize: 13 }}
              >
                Loading fields…
              </div>
            ) : (
              <>
                <div className="input-group">
                  <label className="input-label">Email</label>
                  <input
                    className="input"
                    value={user.email || ""}
                    disabled
                    readOnly
                  />
                </div>
                {[
                  ...["full_name", "company_name"].filter((k) =>
                    fieldKeys.includes(k),
                  ),
                  ...fieldKeys.filter(
                    (k) => !["full_name", "company_name"].includes(k),
                  ),
                ].map((k) => renderField(k, form?.[k]))}
              </>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    settings
      .getIntegrations()
      .then((data) => setStatuses(data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUnipileConnect() {
    setConnecting(true);
    try {
      const data = await unipile.connectAccount();
      const url = data?.url || data?.hosted_auth_url;
      if (!url) throw new Error("No auth URL returned from Unipile");
      window.location.href = url;
    } catch (err) {
      toast?.(err.message || "Could not start LinkedIn connection", "danger");
      setConnecting(false);
    }
  }

  const integrations = Object.entries(INTEGRATION_META).map(([id, meta]) => ({
    id,
    ...meta,
    connected: statuses[id]?.connected ?? false,
  }));

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Integrations</h2>
      <p className="settings-section-desc">
        Connect your API keys to enable all ReachFlow features.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 640,
        }}
      >
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Loading…
          </div>
        ) : (
          integrations.map((int) => {
            const status = int.connected ? "connected" : "not_connected";
            return (
              <div key={int.id} className="card integration-card">
                <div className="integration-icon">{int.icon}</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {int.name}
                    </span>
                    <span className={`badge ${STATUS_META[status].class}`}>
                      {STATUS_META[status].label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {int.desc}
                  </div>
                </div>
                {int.id === "unipile" ? (
                  <button
                    className={`btn btn-sm ${int.connected ? "btn-ghost" : "btn-secondary"}`}
                    onClick={int.connected ? undefined : handleUnipileConnect}
                    disabled={connecting}
                  >
                    {int.connected
                      ? "Connected"
                      : connecting
                        ? "Redirecting…"
                        : "Connect"}
                  </button>
                ) : (
                  <button
                    className={`btn btn-sm ${int.connected ? "btn-ghost" : "btn-secondary"}`}
                    disabled
                  >
                    {int.connected ? "Connected" : "Connect"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function WorkspaceSection() {
  const { toast } = useToast();
  const location = useLocation();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function loadAccounts() {
    setLoading(true);
    setError("");
    try {
      const data = await unipile.getAccounts();
      setAccounts(data?.items || []);
    } catch (err) {
      setError(err.message || "Failed to load LinkedIn accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  // Handle redirect back from Unipile hosted auth
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("unipile");
    if (status === "connected") {
      unipile
        .syncAccounts()
        .then(() => loadAccounts())
        .then(() => toast?.("LinkedIn account connected!", "success"))
        .catch(() => loadAccounts()); // still reload even if sync fails
    } else if (status === "failed") {
      toast?.("LinkedIn connection failed. Please try again.", "danger");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const data = await unipile.connectAccount();
      const url = data?.url || data?.hosted_auth_url;
      if (!url) throw new Error("No auth URL returned from Unipile");
      window.location.href = url;
    } catch (err) {
      toast?.(err.message || "Could not start LinkedIn connection", "danger");
      setConnecting(false);
    }
  }

  async function handleDisconnect(accountId) {
    // eslint-disable-next-line no-alert
    if (!window.confirm("Disconnect this LinkedIn account?")) return;
    try {
      await unipile.disconnectAccount(accountId);
      toast?.("Account disconnected", "success");
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      toast?.(err.message || "Could not disconnect account", "danger");
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Workspace</h2>
      <div className="card" style={{ maxWidth: 600 }}>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label">LinkedIn Accounts</label>
          {loading ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                padding: "6px 0",
              }}
            >
              Loading accounts…
            </div>
          ) : accounts.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                padding: "6px 0",
              }}
            >
              No LinkedIn accounts connected yet.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 8,
              }}
            >
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "var(--radius-sm)",
                        background: "var(--signal)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {(acc.name || "L")[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          truncate: "ellipsis",
                        }}
                      >
                        {acc.name || acc.username || acc.id}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {acc.provider || "LINKEDIN"} ·{" "}
                        {acc.connection_status || "connected"}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDisconnect(acc.id)}
                    style={{ flexShrink: 0 }}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-secondary"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Redirecting…" : "+ Connect LinkedIn Account"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                try {
                  await unipile.syncAccounts();
                  await loadAccounts();
                } catch (err) {
                  toast?.(err.message || "Sync failed", "danger");
                }
              }}
              title="Sync accounts from Unipile"
            >
              ↺ Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trial ends 7 days from a fixed start date (replace with real value from backend when available)
const TRIAL_START = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // started 2 days ago
const TRIAL_DAYS = 7;
const trialEnd = new Date(TRIAL_START.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
const daysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)));

function BillingSection() {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Billing</h2>
      <p className="settings-section-desc">Your current plan and trial status.</p>

      {/* Active plan card */}
      <div className="card" style={{ maxWidth: 480, padding: 24, border: "2px solid var(--signal)", position: "relative" }}>
        <div style={{
          position: "absolute", top: -11, left: 20,
          background: "var(--signal)", color: "#fff",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          padding: "2px 10px", borderRadius: 20, textTransform: "uppercase",
        }}>
          Active Plan
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 2 }}>Free Trial</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Full access for 7 days — no credit card required.</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--signal)", lineHeight: 1 }}>{daysLeft}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>days left</div>
          </div>
        </div>

        {/* Trial progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            <span>Trial started</span>
            <span>Ends {trialEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.round(((TRIAL_DAYS - daysLeft) / TRIAL_DAYS) * 100)}%`,
              background: daysLeft <= 2 ? "var(--danger, #e55)" : "var(--signal)",
              borderRadius: 6,
              transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Included features */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 7 }}>
          {[
            "1 LinkedIn account",
            "Unlimited connection requests during trial",
            "1 active campaign",
            "AI agents & message generation",
            "Full analytics access",
          ].map((f) => (
            <li key={f} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--signal)", fontWeight: 700, flexShrink: 0 }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary btn-sm">Upgrade Plan</button>
          <button className="btn btn-ghost btn-sm">View all plans</button>
        </div>
      </div>
    </div>
  );
}
