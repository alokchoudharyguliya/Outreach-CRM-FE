import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const TIMING_KEYS = [
  ["delayBetweenEmailsMs", "Delay between emails (ms)"],
  ["composeSettleMs", "Compose settle (ms)"],
  ["afterToSettleMs", "After To settle (ms)"],
  ["beforeSendClickMs", "Before Send click (ms)"],
  ["templateSettleMs", "Template settle (ms)"],
  ["defaultTimeoutMs", "Default timeout (ms)"],
  ["mailtrackReadyTimeoutMs", "Mailtrack ready timeout (ms)"],
  ["messageSentTimeoutMs", "Message sent timeout (ms)"],
  ["templateMenuTimeoutMs", "Template menu timeout (ms)"],
];

export default function SettingsPanel({ setError, canWrite = false, isSuperuser = false }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [timings, setTimings] = useState({});
  const [loginInfo, setLoginInfo] = useState(null);
  const [linkedin, setLinkedin] = useState(null);
  const [liLoginInfo, setLiLoginInfo] = useState(null);

  const applyResponse = useCallback((data) => {
    const c = data.config || data;
    setCfg({
      ...c,
      accounts: data.accounts || c.accounts || [],
      templates: data.templates || c.templates || [],
      defaultAccountId: data.defaultAccountId || c.defaultAccountId,
      defaultTemplate: data.defaultTemplate || c.defaultTemplate,
    });
    setTimings({ ...(c.timings || {}) });
    if (data.login) setLoginInfo(data.login);
  }, []);

  const applyLinkedin = useCallback((data) => {
    setLinkedin(data);
    if (data.login) setLiLoginInfo(data.login);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [data, li] = await Promise.all([
        api.sendConfig(),
        api.linkedinStatus().catch(() => null),
      ]);
      applyResponse(data);
      if (li) applyLinkedin(li);
      const status = await api.sendStatus();
      if (status.login) setLoginInfo(status.login);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [applyResponse, applyLinkedin, setError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loginInfo?.state !== "running") return undefined;
    const id = setInterval(async () => {
      try {
        const status = await api.sendStatus();
        if (status.login) setLoginInfo(status.login);
        if (status.login?.state !== "running") {
          const data = await api.sendConfig();
          applyResponse(data);
        }
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(id);
  }, [loginInfo?.state, applyResponse]);

  useEffect(() => {
    if (liLoginInfo?.state !== "running") return undefined;
    const id = setInterval(async () => {
      try {
        const status = await api.linkedinStatus();
        applyLinkedin(status);
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(id);
  }, [liLoginInfo?.state, applyLinkedin]);

  async function run(fn) {
    if (!isSuperuser) return;
    setBusy(true);
    setError("");
    try {
      const data = await fn();
      applyResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!cfg && busy) {
    return (
      <section className="panel">
        <p className="muted">Loading settings…</p>
      </section>
    );
  }

  const accounts = cfg?.accounts || [];
  const templates = cfg?.templates || [];

  return (
    <section className="panel settings-panel">
      <div className="row-between">
        <div>
          <h1>Settings</h1>
          <p className="muted tight">
            Gmail send profiles, LinkedIn session (Phase 1), and template catalog
          </p>
        </div>
        <button type="button" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      {!isSuperuser ? (
        <div className="banner warn">
          Read-only — ask a superuser to add accounts or templates.
        </div>
      ) : null}

      {loginInfo?.state === "running" ? (
        <div className="banner warn">
          Gmail login Chrome is open for account{" "}
          <strong>{loginInfo.account_id}</strong>. Sign in, install Mailtrack, then
          close the Chrome window.
        </div>
      ) : null}

      {loginInfo?.state === "failed" ? (
        <div className="banner error">
          Gmail login failed
          {loginInfo.account_id ? (
            <>
              {" "}
              for <strong>{loginInfo.account_id}</strong>
            </>
          ) : null}
          : {loginInfo.last_error || loginInfo.message || "unknown error"}. If
          dependencies are missing, run <span className="mono">npm run setup</span>{" "}
          in <span className="mono">gmail-playwright/</span>.
        </div>
      ) : null}

      {liLoginInfo?.state === "running" ? (
        <div className="banner warn">
          LinkedIn login Chrome is open for account{" "}
          <strong>{liLoginInfo.account_id}</strong>. Sign in (complete 2FA if
          asked), then close the Chrome window.
        </div>
      ) : null}

      {liLoginInfo?.state === "failed" ? (
        <div className="banner error">
          LinkedIn login failed
          {liLoginInfo.account_id ? (
            <>
              {" "}
              for <strong>{liLoginInfo.account_id}</strong>
            </>
          ) : null}
          : {liLoginInfo.last_error || liLoginInfo.message || "unknown error"}
        </div>
      ) : null}

      <h2>LinkedIn session</h2>
      <p className="muted tight">
        Phase 1: persistent login only (separate Chrome profile from Gmail). Scraping
        comes later. Run <span className="mono">npm run setup</span> in{" "}
        <span className="mono">linkedin-playwright/</span> once.
      </p>
      <div className="settings-list">
        {(linkedin?.accounts || []).map((a) => (
          <div key={a.id} className="settings-row">
            <div>
              <strong>{a.label}</strong>
              <span className="mono muted"> {a.id}</span>
              {linkedin?.defaultAccountId === a.id ? (
                <span className="pill soft">default</span>
              ) : null}
              <span className={a.profile_ready ? "pill soft" : "pill warn"}>
                {a.profile_ready ? "profile ready" : "login needed"}
              </span>
            </div>
            {isSuperuser ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={
                    busy ||
                    liLoginInfo?.state === "running" ||
                    linkedin?.project_ready === false
                  }
                  onClick={async () => {
                    if (!isSuperuser) return;
                    setBusy(true);
                    setError("");
                    try {
                      const data = await api.linkedinLogin(a.id);
                      applyLinkedin(data);
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Open LinkedIn login
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!linkedin?.accounts?.length ? (
          <p className="muted">
            {linkedin?.project_ready === false
              ? "linkedin-playwright not found — run setup in that folder."
              : "No LinkedIn accounts in config yet."}
          </p>
        ) : null}
      </div>

      <h2>Gmail accounts</h2>
      <p className="muted tight">
        One account is selected at the start of each send. Each account has its own
        Chrome profile — use Open login once per account.
      </p>
      <div className="settings-list">
        {accounts.map((a) => (
          <div key={a.id} className="settings-row">
            <div>
              <strong>{a.label}</strong>
              <span className="mono muted"> {a.id}</span>
              {a.emailHint ? <span className="muted"> · {a.emailHint}</span> : null}
              {cfg.defaultAccountId === a.id ? (
                <span className="pill soft">default</span>
              ) : null}
              <span className={a.profile_ready ? "pill soft" : "pill warn"}>
                {a.profile_ready ? "profile ready" : "login needed"}
              </span>
            </div>
            {isSuperuser ? (
              <div className="row-actions">
                <button
                  type="button"
                  disabled={busy || cfg.defaultAccountId === a.id}
                  onClick={() =>
                    run(() => api.updateSendAccount(a.id, { setDefault: true }))
                  }
                >
                  Set default
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || loginInfo?.state === "running"}
                  onClick={() =>
                    run(async () => {
                      const data = await api.loginSendAccount(a.id);
                      if (data.login) setLoginInfo(data.login);
                      return data;
                    })
                  }
                >
                  Open login
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || accounts.length <= 1}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove account "${a.label}" from the portal?`,
                      )
                    ) {
                      return;
                    }
                    const wipe = window.confirm(
                      "Also delete the Chrome profile folder on disk?",
                    );
                    run(() => api.deleteSendAccount(a.id, wipe));
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {isSuperuser ? (
        <form
          className="form compact settings-add"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const data = await api.createSendAccount({
                label: newAccountLabel.trim(),
                emailHint: newAccountEmail.trim(),
              });
              setNewAccountLabel("");
              setNewAccountEmail("");
              return data;
            });
          }}
        >
          <label>
            New account label
            <input
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
              required
              placeholder="Work Gmail"
            />
          </label>
          <label>
            Email hint (Gmail address)
            <input
              value={newAccountEmail}
              onChange={(e) => setNewAccountEmail(e.target.value)}
              placeholder="you@gmail.com — stored on each send"
            />
          </label>
          <button type="submit" className="primary" disabled={busy || !newAccountLabel.trim()}>
            Add account
          </button>
        </form>
      ) : null}

      <h2>Gmail templates</h2>
      <p className="muted tight">
        Names must match Gmail → More options → Templates exactly. The sender looks
        these up in the menu; bodies stay in Gmail.
      </p>
      <div className="settings-list">
        {templates.map((name) => (
          <div key={name} className="settings-row">
            <div>
              <strong>{name}</strong>
              {cfg.defaultTemplate === name ? (
                <span className="pill soft">default</span>
              ) : null}
            </div>
            {isSuperuser ? (
              <div className="row-actions">
                <button
                  type="button"
                  disabled={busy || cfg.defaultTemplate === name}
                  onClick={() =>
                    run(() => api.updateSendConfig({ defaultTemplate: name }))
                  }
                >
                  Set default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenameFrom(name);
                    setRenameTo(name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || templates.length <= 1}
                  onClick={() => {
                    if (!window.confirm(`Remove template "${name}" from catalog?`)) {
                      return;
                    }
                    run(() => api.deleteSendTemplate(name));
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {isSuperuser ? (
        <>
          <form
            className="form compact settings-add"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const data = await api.createSendTemplate(newTemplate.trim());
                setNewTemplate("");
                return data;
              });
            }}
          >
            <label>
              Add template name
              <input
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                required
                placeholder="Exact Gmail template title"
              />
            </label>
            <button type="submit" className="primary" disabled={busy || !newTemplate.trim()}>
              Add template
            </button>
          </form>

          {renameFrom ? (
            <form
              className="form compact settings-add"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const data = await api.renameSendTemplate(renameFrom, renameTo.trim());
                  setRenameFrom("");
                  setRenameTo("");
                  return data;
                });
              }}
            >
              <label>
                Rename template
                <input value={renameFrom} disabled />
              </label>
              <label>
                New name
                <input
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                Save rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenameFrom("");
                  setRenameTo("");
                }}
              >
                Cancel
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      <h2>Company pool (CSV)</h2>
      <p className="muted tight">
        Import <span className="mono">data/Email List - Sheet 1.csv</span> into the
        companies registry. New companies = zero emails. Outreach status is derived
        (POOL → READY → GENERATED → OUTREACH → DONE); use PAUSED/SKIPPED manually.
      </p>
      {isSuperuser ? (
        <div className="row-actions" style={{ marginBottom: "1.5rem" }}>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const data = await api.importCompaniesCsv();
                setError("");
                alert(
                  `Imported CSV: ${data.created} created, ${data.updated} updated (${data.rows_parsed} unique names)`,
                );
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import Email List CSV
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api.syncCompanyOutreach();
                alert("Company outreach statuses refreshed from email counts.");
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Sync outreach statuses
          </button>
        </div>
      ) : (
        <p className="muted">Superuser can import the company CSV here.</p>
      )}

      <h2>Timings</h2>
      {isSuperuser && canWrite ? (
        <form
          className="form settings-timings"
          onSubmit={(e) => {
            e.preventDefault();
            const patch = {};
            for (const [key] of TIMING_KEYS) {
              const v = Number(timings[key]);
              if (Number.isFinite(v)) patch[key] = v;
            }
            run(() => api.updateSendConfig({ timings: patch }));
          }}
        >
          <div className="timing-grid">
            {TIMING_KEYS.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min="0"
                  value={timings[key] ?? ""}
                  onChange={(e) =>
                    setTimings((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <button type="submit" className="primary" disabled={busy}>
            Save timings
          </button>
        </form>
      ) : (
        <p className="muted">Superuser can edit send timings here.</p>
      )}
    </section>
  );
}
