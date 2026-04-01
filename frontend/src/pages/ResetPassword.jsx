import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Supabase embeds the access token in the URL hash after the user clicks
  // the email link. onAuthStateChange fires with event PASSWORD_RECOVERY.
  useEffect(() => {
    // Check if there's already an active recovery session (event may have
    // fired before this component mounted, since main.jsx navigated here).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      toast?.("Password updated successfully", "success");
      navigate("/login");
    } catch (err) {
      setError(err.message || "Failed to update password");
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
            Set new password
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Choose a strong password for your account.
          </p>
        </div>

        {!ready ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              padding: "16px 0",
            }}
          >
            Verifying reset link…
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
                <label className="input-label">New password</label>
                <input
                  className="input"
                  type="password"
                  required
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  required
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                disabled={loading}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
