import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const origin = window.location.origin.startsWith("http")
        ? window.location.origin
        : `http://${window.location.origin}`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${origin}/reset-password`,
        },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="page auth-page animate-fade-in"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "auto",
      }}
    >
      <div
        className="card"
        style={{ width: 380, maxWidth: "100%", padding: 32 }}
      >
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            Forgot password
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--signal-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 22,
              }}
            >
              ✓
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              Check your inbox
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 24,
              }}
            >
              We sent a password reset link to <strong>{email}</strong>.
            </p>
            <Link
              to="/login"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 13 }}
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="badge badge-danger" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}

            <form className="stack" style={{ gap: 12 }} onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input
                  className="input"
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                disabled={loading}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div
              style={{
                marginTop: 16,
                fontSize: 13,
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              <Link to="/login" className="link">
                ← Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
