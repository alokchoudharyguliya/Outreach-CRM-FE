import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import GeneratePanel from "./components/GeneratePanel.jsx";
import OverviewPanel from "./components/OverviewPanel.jsx";
import QueuePanel from "./components/QueuePanel.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";
import PeoplePanel from "./components/PeoplePanel.jsx";
import UsersPanel from "./components/UsersPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import ConnectPanel from "./components/ConnectPanel.jsx";
import SmartConnectPanel from "./components/SmartConnectPanel.jsx";
import DiscoverPanel from "./components/DiscoverPanel.jsx";
import OpeningsPanel from "./components/OpeningsPanel.jsx";
import LoginPage from "./components/LoginPage.jsx";
import NcrCompanyList from "./components/NcrCompanyList.jsx";
import IconButton from "./components/IconButton.jsx";
import { IconDownload, IconLogout } from "./components/icons.jsx";

function AppShell() {
  const { user, loading, logout, isSuperuser, canWrite } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [pendingTotal, setPendingTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [invalidTotal, setInvalidTotal] = useState(0);
  const [companyTotal, setCompanyTotal] = useState(0);
  const [counts, setCounts] = useState({ today: 0, yesterday: 0, last_week: 0 });
  const [llm, setLlm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tabs = useMemo(() => {
    const list = ["Overview", "Queue & Send", "Companies", "History", "Openings"];
    if (canWrite) list.push("Generate", "Connect", "Smart Connect", "Discover", "Settings");
    if (isSuperuser) list.push("Permissions");
    return list;
  }, [canWrite, isSuperuser]);

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0] || "Overview");
  }, [tabs, tab]);

  const refreshCompanyTotal = useCallback(async () => {
    const totalRes = await api.listCompanies({
      page: 1,
      page_size: 1,
      include_counts: false,
    });
    setCompanyTotal(totalRes.total || 0);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [overview, c, l, totalRes] = await Promise.all([
        api.overview(),
        api.importCounts(),
        api.llmStatus(),
        api.listCompanies({ page: 1, page_size: 1, include_counts: false }),
      ]);
      setPendingTotal(overview.pending || 0);
      setSentTotal(overview.sent || 0);
      setInvalidTotal(overview.invalid || 0);
      setCounts(c);
      setLlm(l);
      setCompanyTotal(totalRes.total || 0);
      setError("");
    } catch (err) {
      if (err.status === 401) {
        logout();
        return;
      }
      setError(err.message);
    }
  }, [logout]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  if (loading) {
    return (
      <div className="login-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="brand">Outreach Portal</p>
          <p className="sub">Queue · send · track · companies</p>
        </div>
        <div className="counts">
          {llm ? (
            <span
              className={llm.reachable ? "pill soft" : "pill warn"}
              title={llm.detail || ""}
            >
              {llm.provider}:{llm.model}
            </span>
          ) : null}
          <span>{companyTotal} companies</span>
          <span>Today {counts.today}</span>
          <span className="pill">{pendingTotal} pending</span>
          <span className="pill soft">{sentTotal} sent</span>
          <span className="pill warn">{invalidTotal} invalid</span>
          <span className={canWrite ? "pill soft" : "pill warn"}>
            {canWrite ? "superuser" : "read-only"}
          </span>
          <IconButton
            icon={IconLogout}
            label="Sign out"
            className="ghost"
            onClick={logout}
          />
        </div>
      </header>

      {!canWrite ? (
        <div className="banner warn">
          Signed in as {user.email} · read-only view. Ask a superuser to grant write
          access or make changes.
        </div>
      ) : null}

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "tab active" : "tab"}
            onClick={() => setTab(t)}
            type="button"
            title={`Open ${t}`}
          >
            {t}
          </button>
        ))}
        <IconButton
          icon={IconDownload}
          label="Export CSV"
          className="ghost"
          onClick={() => api.exportCsv().catch((e) => setError(e.message))}
        />
        <span className="muted" style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
          {user.email}
        </span>
      </nav>

      {error ? <div className="banner error">{error}</div> : null}
      {llm && llm.reachable === false ? (
        <div className="banner warn">{llm.detail}</div>
      ) : null}

      <main>
        {tab === "Overview" ? (
          <OverviewPanel
            setError={setError}
            onGoQueue={() => setTab("Queue & Send")}
          />
        ) : null}
        {tab === "Generate" && canWrite ? (
          <GeneratePanel
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onCompanyTotalChange={refreshCompanyTotal}
            onDone={() => {
              refresh();
              setTab("Queue & Send");
            }}
          />
        ) : null}
        {tab === "Connect" && canWrite ? (
          <ConnectPanel busy={busy} setBusy={setBusy} setError={setError} />
        ) : null}
        {tab === "Smart Connect" && canWrite ? (
          <SmartConnectPanel busy={busy} setBusy={setBusy} setError={setError} />
        ) : null}
        {tab === "Discover" && canWrite ? (
          <DiscoverPanel
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onCompaniesChange={refreshCompanyTotal}
          />
        ) : null}
        {tab === "Openings" ? (
          <OpeningsPanel setError={setError} canWrite={canWrite} />
        ) : null}
        {tab === "Queue & Send" ? (
          <QueuePanel
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onChange={refresh}
            canWrite={canWrite}
          />
        ) : null}
        {tab === "History" ? (
          <HistoryPanel
            setError={setError}
            onChanged={refresh}
            canWrite={canWrite}
          />
        ) : null}
        {tab === "Companies" ? (
          <PeoplePanel
            setError={setError}
            onChanged={refresh}
            onCompanyTotalChange={refreshCompanyTotal}
            canWrite={canWrite}
          />
        ) : null}
        {tab === "Permissions" && isSuperuser ? (
          <UsersPanel setError={setError} />
        ) : null}
        {tab === "Settings" && canWrite ? (
          <SettingsPanel
            setError={setError}
            canWrite={canWrite}
            isSuperuser={isSuperuser}
          />
        ) : null}
      </main>
      <NcrCompanyList />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
