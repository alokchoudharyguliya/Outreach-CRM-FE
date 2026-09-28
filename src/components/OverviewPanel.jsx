import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import DonutChart from "./charts/DonutChart.jsx";
import RankedBarChart from "./charts/RankedBarChart.jsx";
import { topNWithOther } from "./charts/chartTheme.js";

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value">{value ?? 0}</div>
      <div className="stat-card-label">{label}</div>
      {hint ? <div className="muted tight">{hint}</div> : null}
    </div>
  );
}

export default function OverviewPanel({ setError, onGoQueue }) {
  const [data, setData] = useState(null);
  const [sendStatus, setSendStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [overview, send] = await Promise.all([
        api.overview(),
        api.sendStatus(),
      ]);
      setData(overview);
      setSendStatus(send);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [setError]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const d = data || {};

  const statusPie = useMemo(
    () =>
      [
        { name: "pending", value: d.pending || 0 },
        { name: "sent", value: d.sent || 0 },
        { name: "skipped", value: d.skipped || 0 },
      ].filter((r) => r.value > 0),
    [d.pending, d.sent, d.skipped]
  );

  const validityPie = useMemo(
    () =>
      [
        { name: "valid", value: d.valid || 0 },
        { name: "invalid", value: d.invalid || 0 },
        { name: "unknown", value: d.unknown || 0 },
      ].filter((r) => r.value > 0),
    [d.valid, d.invalid, d.unknown]
  );

  const pendingBars = useMemo(
    () =>
      topNWithOther(
        (d.top_pending || []).map((r) => ({
          name: r.company,
          value: r.pending,
        })),
        10
      ),
    [d.top_pending]
  );

  const sentBars = useMemo(
    () =>
      topNWithOther(
        (d.top_sent || []).map((r) => ({
          name: r.company,
          value: r.sent,
        })),
        10
      ),
    [d.top_sent]
  );

  const senderBars = useMemo(
    () =>
      topNWithOther(
        (d.by_sender || []).map((r) => ({
          name: r.account_label || r.account_email || r.account_id || "(unknown)",
          value: r.sent,
        })),
        8
      ),
    [d.by_sender]
  );

  if (!data && busy) {
    return (
      <section className="panel">
        <p className="muted">Loading overview…</p>
      </section>
    );
  }

  const running =
    sendStatus?.state === "running" || sendStatus?.state === "starting";

  return (
    <section className="panel overview-panel">
      <div className="row-between">
        <div>
          <h1>Overview</h1>
          <p className="muted tight">
            Pipeline health across queue, sends, and bounce validity
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="primary"
            onClick={() => onGoQueue?.()}
            title="Open Queue & Send"
          >
            Go to Queue & Send
          </button>
          <button type="button" onClick={load} disabled={busy} title="Refresh">
            Refresh
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Pending queue" value={d.pending} hint="NEW · not invalid" />
        <StatCard label="Sent" value={d.sent} hint={`${d.sent_today || 0} today · ${d.sent_7d || 0} / 7d`} />
        <StatCard label="Invalid" value={d.invalid} hint={`${d.invalid_sent || 0} sent+invalid`} />
        <StatCard label="Unknown validity" value={d.unknown} />
        <StatCard label="Valid" value={d.valid} />
        <StatCard label="Skipped" value={d.skipped} />
        <StatCard label="Companies w/ pending" value={d.companies_with_pending} />
        <StatCard label="Total emails" value={d.total} />
      </div>

      <div className={`send-status-banner${running ? " active" : ""}`}>
        <strong>Gmail send job:</strong>{" "}
        <span className="status">{sendStatus?.state || "idle"}</span>
        {sendStatus?.profile_ready === false ? (
          <span className="muted"> · Mailtrack profile not ready — run npm run login in gmail-playwright</span>
        ) : (
          <span className="muted"> · profile ready</span>
        )}
        {sendStatus?.current ? (
          <span className="mono"> · {sendStatus.current}</span>
        ) : null}
        {running ? (
          <span className="muted">
            {" "}
            · sent {sendStatus.sent || 0} · failed {sendStatus.failed || 0} ·
            remaining {sendStatus.remaining || 0}
          </span>
        ) : null}
      </div>

      <div className="chart-grid chart-grid-2">
        <DonutChart
          title="Queue status"
          subtitle="Pending · sent · skipped"
          data={statusPie}
        />
        <DonutChart
          title="Validity mix"
          subtitle="Across all emails"
          data={validityPie}
        />
      </div>

      <div className="chart-grid chart-grid-2">
        <RankedBarChart
          title="Top pending companies"
          subtitle="Emails waiting in queue"
          data={pendingBars}
          valueLabel="Pending"
        />
        <RankedBarChart
          title="Top sent companies"
          subtitle="Lifetime marked sent"
          data={sentBars}
          valueLabel="Sent"
        />
      </div>

      <div className="chart-grid chart-grid-1">
        <RankedBarChart
          title="Sent by Gmail account"
          subtitle="Attribution from Queue & Send"
          data={senderBars}
          valueLabel="Sent"
          height={220}
        />
      </div>

      <div className="overview-columns">
        <div>
          <h3>Top pending companies</h3>
          {(d.top_pending || []).length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                {d.top_pending.map((row) => (
                  <tr key={row.company}>
                    <td>{row.company}</td>
                    <td>{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No pending companies.</p>
          )}
        </div>
        <div>
          <h3>Top sent companies</h3>
          {(d.top_sent || []).length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {d.top_sent.map((row) => (
                  <tr key={row.company}>
                    <td>{row.company}</td>
                    <td>{row.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No sent emails yet.</p>
          )}
        </div>
      </div>

      <div className="overview-columns" style={{ marginTop: "1.25rem" }}>
        <div>
          <h3>Sent by Gmail account</h3>
          {(d.by_sender || []).length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {d.by_sender.map((row) => (
                  <tr key={`${row.account_id}-${row.account_email}`}>
                    <td>
                      <div>{row.account_label || row.account_id}</div>
                      {row.account_email ? (
                        <div className="mono muted">{row.account_email}</div>
                      ) : (
                        <div className="muted">{row.account_id}</div>
                      )}
                    </td>
                    <td>{row.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No sender attribution yet — send via Queue &amp; Send.</p>
          )}
        </div>
      </div>
    </section>
  );
}
