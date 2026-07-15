import { useEffect, useState } from "react";
import { unipile } from "../lib/api";
import { useToast } from "./Toast";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

const DEFAULT_SETTINGS = {
  paused: false,
  dailyConnectionLimit: 20,
  dailyMessageLimit: 40,
  activeDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  activeHours: { start: "08:00", end: "18:00" },
  timezone: "UTC",
  sendingDelay: { min: 15, max: 20 },
  warmupMode: false,
};

const FALLBACK_TIMEZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];
const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK_TIMEZONES;

export default function AccountSafetyModal({ open, account, onClose, onSaved }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState({ requests: 0, messages: 0 });
  const [effective, setEffective] = useState(null);

  useEffect(() => {
    if (!open || !account?.id) return;
    setLoading(true);
    unipile
      .getAccountSafety(account.id)
      .then((data) => {
        const { usage: u, effective: eff, ...settings } = data || {};
        setForm({ ...DEFAULT_SETTINGS, ...settings, activeHours: { ...DEFAULT_SETTINGS.activeHours, ...settings.activeHours }, sendingDelay: { ...DEFAULT_SETTINGS.sendingDelay, ...settings.sendingDelay } });
        setUsage(u || { requests: 0, messages: 0 });
        setEffective(eff || null);
      })
      .catch(() => toast("Could not load safety settings", "danger"))
      .finally(() => setLoading(false));
  }, [open, account?.id]);

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      activeDays: f.activeDays.includes(day) ? f.activeDays.filter((d) => d !== day) : [...f.activeDays, day],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        paused: form.paused,
        dailyConnectionLimit: Number(form.dailyConnectionLimit) || 0,
        dailyMessageLimit: Number(form.dailyMessageLimit) || 0,
        activeDays: form.activeDays,
        activeHours: form.activeHours,
        timezone: form.timezone,
        sendingDelay: {
          min: Math.max(1, Number(form.sendingDelay.min) || 1),
          max: Math.max(Number(form.sendingDelay.min) || 1, Number(form.sendingDelay.max) || 1),
        },
        warmupMode: form.warmupMode,
      };
      const saved = await unipile.updateAccountSafety(account.id, patch);
      toast("Safety settings saved", "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(err.message || "Could not save safety settings", "danger");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box animate-fade-in" style={{ maxWidth: 560, width: "100%", display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
        <div className="modal-header">
          <h2 className="modal-title">◆ Sending Safety — {account?.name || account?.username || "Account"}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {/* Pause */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--surface-hover, rgba(255,255,255,0.03))", border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Pause sending</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Stops all connection requests and messages from this account immediately.</div>
                </div>
                <label className="toggle" style={{ margin: 0, flexShrink: 0 }}>
                  <input type="checkbox" checked={form.paused} onChange={(e) => setForm((f) => ({ ...f, paused: e.target.checked }))} />
                  <span className="toggle-track" />
                </label>
              </div>

              {/* Warm-up */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--surface-hover, rgba(255,255,255,0.03))", border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Warm-up mode</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    For new or recently restricted accounts — caps daily sending to {DEFAULT_SETTINGS_CAP_HINT} and slows the delay between sends, on top of your limits below.
                  </div>
                </div>
                <label className="toggle" style={{ margin: 0, flexShrink: 0 }}>
                  <input type="checkbox" checked={form.warmupMode} onChange={(e) => setForm((f) => ({ ...f, warmupMode: e.target.checked }))} />
                  <span className="toggle-track" />
                </label>
              </div>

              {/* Today's usage */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Today's usage</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <UsageStat label="Connection requests" used={usage.requests} limit={effective?.dailyConnectionLimit ?? form.dailyConnectionLimit} />
                  <UsageStat label="Messages" used={usage.messages} limit={effective?.dailyMessageLimit ?? form.dailyMessageLimit} />
                </div>
              </div>

              {/* Daily limits */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Daily limits</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Connection requests / day</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.dailyConnectionLimit}
                      onChange={(e) => setForm((f) => ({ ...f, dailyConnectionLimit: e.target.value }))}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Messages / day</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.dailyMessageLimit}
                      onChange={(e) => setForm((f) => ({ ...f, dailyMessageLimit: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Active sending hours */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Active sending hours</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {DAYS.map((day) => {
                    const active = form.activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1px solid ${active ? "var(--signal)" : "var(--border)"}`,
                          background: active ? "var(--signal-subtle)" : "transparent",
                          color: active ? "var(--signal)" : "var(--text-secondary)",
                        }}
                      >
                        {DAY_SHORT[day]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Start</label>
                    <input
                      className="input"
                      type="time"
                      value={form.activeHours.start}
                      onChange={(e) => setForm((f) => ({ ...f, activeHours: { ...f.activeHours, start: e.target.value } }))}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>End</label>
                    <input
                      className="input"
                      type="time"
                      value={form.activeHours.end}
                      onChange={(e) => setForm((f) => ({ ...f, activeHours: { ...f.activeHours, end: e.target.value } }))}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1.4, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Timezone</label>
                    <select
                      className="input"
                      value={form.timezone}
                      onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Delay range */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Delay between connection requests</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Min (minutes)</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={form.sendingDelay.min}
                      onChange={(e) => setForm((f) => ({ ...f, sendingDelay: { ...f.sendingDelay, min: e.target.value } }))}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Max (minutes)</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={form.sendingDelay.max}
                      onChange={(e) => setForm((f) => ({ ...f, sendingDelay: { ...f.sendingDelay, max: e.target.value } }))}
                    />
                  </div>
                </div>
                {form.warmupMode && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Warm-up mode is on — sends will use the slower warm-up pace (30–60 min) regardless of the range above.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_SETTINGS_CAP_HINT = "5 connection requests and 10 messages per day";

function UsageStat({ label, used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "var(--signal)";
  return (
    <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{used} / {limit}</div>
      <div style={{ height: 4, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
