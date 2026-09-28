import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { getApiBase, setApiBase } from "../api";

const SHOW_API_FIELD = Boolean(
  import.meta.env.PROD || import.meta.env.VITE_API_BASE
);

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrl] = useState(() => getApiBase());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("api");
    if (!fromQuery) return;
    const next = setApiBase(fromQuery);
    setApiUrl(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("api");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (SHOW_API_FIELD) setApiBase(apiUrl);
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="brand">Outreach CRM</p>
        <p className="sub">Sign in to continue</p>
        {error ? <div className="banner error">{error}</div> : null}
        <form className="form" onSubmit={onSubmit}>
          <label className="full">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="full">
            Password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {SHOW_API_FIELD ? (
            <label className="full">
              API URL
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://your-subdomain.ngrok-free.app/api"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="muted tight">
                Mac FastAPI via ngrok. Playwright stays on this machine.
              </span>
            </label>
          ) : null}
          <button
            type="submit"
            className="primary"
            disabled={busy}
            title={busy ? "Signing in…" : "Sign in"}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
