import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Pagination from "./Pagination.jsx";

function peerFromLinkedInStatus(st, self) {
  if (!st) return null;
  if (st.login_running) {
    return {
      kind: "login",
      label: "LinkedIn login Chrome is still open (Settings → Open login).",
    };
  }
  const connect = st.connect || {};
  if (
    self !== "connect" &&
    ["running", "starting"].includes(connect.state)
  ) {
    return {
      kind: "connect",
      label: `Classic Connect is still using LinkedIn (${connect.company || "running"}).`,
    };
  }
  const smart = st.smart_connect || {};
  if (
    self !== "smart" &&
    ["running", "starting"].includes(smart.state)
  ) {
    return {
      kind: "smart",
      label: `Smart Connect is still using LinkedIn (${smart.company || "running"}).`,
    };
  }
  return null;
}

/**
 * LLM Smart Connect — separate from classic Connect.
 * Scrape → LLM (female + HR/TA/SDE/eng) → checklist → send checked only.
 */
export default function SmartConnectPanel({ setError }) {
  const [localBusy, setLocalBusy] = useState(false);
  const [peer, setPeer] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const [keywords, setKeywords] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [maxPages, setMaxPages] = useState("3");
  const [maxInvites, setMaxInvites] = useState("20");
  const [delayMs, setDelayMs] = useState("2500");
  const [targetGender, setTargetGender] = useState("female");
  const [withNote, setWithNote] = useState(false);
  const [note, setNote] = useState("");
  const [job, setJob] = useState(null);
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [showExcluded, setShowExcluded] = useState(true);
  const [showLlmLog, setShowLlmLog] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getConnectNote();
        if (cancelled) return;
        const c = res.connect || {};
        const sc = res.smartConnect || {};
        setWithNote(Boolean(c.withNote));
        setNote(String(c.note || "").slice(0, 300));
        setMaxPages(String(c.maxPages ?? 3));
        setMaxInvites(String(c.maxInvites ?? 20));
        setDelayMs(String(c.delayMs ?? 2500));
        setTargetGender(String(sc.targetGender || "female"));
      } catch (err) {
        if (!cancelled) setError?.(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  const loadCompanies = useCallback(
    async (overrides = {}) => {
      const nextPage = overrides.page ?? page;
      const nextSize = overrides.pageSize ?? pageSize;
      const nextQ = overrides.q ?? appliedQ;
      setLoading(true);
      try {
        const res = await api.listCompanies({
          q: nextQ.trim() || undefined,
          page: nextPage,
          page_size: nextSize,
          include_counts: false,
          sort: "name",
        });
        setCompanies(res.items || []);
        setTotal(res.total || 0);
        setPages(res.pages || 0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, appliedQ, setError],
  );

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const applyProposed = useCallback((proposed) => {
    const list = Array.isArray(proposed) ? proposed : [];
    setRows(list);
    setChecked(new Set(list.map((r) => r.id || r.vanityName || r.name)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [st, result] = await Promise.all([
          api.smartConnectStatus(),
          api.smartConnectResult().catch(() => null),
        ]);
        if (cancelled) return;
        setJob(st);
        const proposed =
          st?.proposed?.length > 0
            ? st.proposed
            : result?.triage?.proposed || result?.proposed || [];
        if (proposed.length && !["running", "starting"].includes(st?.state)) {
          applyProposed(proposed);
        }
        const liStatus = await api.linkedinStatus().catch(() => null);
        if (!cancelled && liStatus) {
          setPeer(peerFromLinkedInStatus(liStatus, "smart"));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProposed]);

  useEffect(() => {
    if (!job || !["running", "starting"].includes(job.state)) return undefined;
    const id = setInterval(async () => {
      try {
        const st = await api.smartConnectStatus();
        setJob(st);
        if (st.proposed?.length) applyProposed(st.proposed);
        if (!["running", "starting"].includes(st.state)) {
          clearInterval(id);
          setLocalBusy(false);
          if (st.phase === "triage") {
            const result = await api.smartConnectResult().catch(() => null);
            const proposed =
              st.proposed?.length > 0
                ? st.proposed
                : result?.triage?.proposed || [];
            applyProposed(proposed);
          }
        }
      } catch (err) {
        setError(err.message);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [job, setError, applyProposed]);

  function pickCompany(c) {
    setSelected(c);
    setCompanyFilter(c.matched_as || c.name || "");
    if (!keywords.trim()) setKeywords(c.name || "");
  }

  function applySearch(e) {
    e?.preventDefault?.();
    setPage(1);
    setAppliedQ(q);
  }

  function toggleOne(key) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(on) {
    if (!on) setChecked(new Set());
    else
      setChecked(
        new Set(rows.map((r) => r.id || r.vanityName || r.name).filter(Boolean)),
      );
  }

  async function onTriage() {
    const company = companyFilter.trim();
    if (!company) {
      setError("Pick a company (or type a Current companies filter value)");
      return;
    }
    setLocalBusy(true);
    setError("");
    setRows([]);
    setChecked(new Set());
    try {
      const st = await api.startSmartConnectTriage({
        company,
        keywords: keywords.trim() || company,
        max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
        batch_size: 20,
      });
      setJob(st);
      setPeer(null);
    } catch (err) {
      setError(err.message);
      setLocalBusy(false);
    }
  }

  async function onRetriage() {
    setLocalBusy(true);
    setError("");
    try {
      const st = await api.startSmartConnectRetriage({
        company: companyFilter.trim() || undefined,
        keywords: keywords.trim() || undefined,
        batch_size: 20,
      });
      setJob(st);
      setPeer(null);
    } catch (err) {
      setError(err.message);
      setLocalBusy(false);
    }
  }

  async function onSend() {
    const company = companyFilter.trim();
    if (!company) {
      setError("Company filter is required");
      return;
    }
    const approved = rows.filter((r) =>
      checked.has(r.id || r.vanityName || r.name),
    );
    if (!approved.length) {
      setError("Check at least one person before sending");
      return;
    }
    if (withNote && !note.trim()) {
      setError("Enter an invitation note, or turn off “With note”");
      return;
    }
    setLocalBusy(true);
    setError("");
    try {
      const st = await api.startSmartConnectSend({
        company,
        keywords: keywords.trim() || company,
        approved: approved.map((r) => ({
          id: r.id,
          name: r.name,
          vanityName: r.vanityName,
          profileUrl: r.profileUrl,
          headline: r.headline,
        })),
        with_note: withNote,
        note: withNote ? note.trim() : "",
        max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
        max_invites: Math.max(1, Math.min(Number(maxInvites) || 20, 100)),
        delay_ms: Math.max(800, Math.min(Number(delayMs) || 2500, 30000)),
      });
      setJob(st);
      setPeer(null);
    } catch (err) {
      setError(err.message);
      setLocalBusy(false);
    }
  }

  async function onStop() {
    try {
      const st = await api.stopSmartConnect();
      setJob(st);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStopPeer() {
    try {
      setError("");
      if (peer?.kind === "connect") {
        await api.stopLinkedInConnect();
      } else if (peer?.kind === "smart") {
        await api.stopSmartConnect();
      }
      const liStatus = await api.linkedinStatus();
      setPeer(peerFromLinkedInStatus(liStatus, "smart"));
    } catch (err) {
      setError(err.message);
    }
  }

  const running = job?.state === "running" || job?.state === "starting";
  const checkedCount = checked.size;
  const excluded = useMemo(() => {
    if (job?.excluded?.length) return job.excluded;
    const list = job?.candidates || [];
    return list.filter((c) => !c.inviteCandidate);
  }, [job]);
  const llmLog = job?.llm_log || [];

  return (
    <section className="panel">
      <h2>Smart Connect</h2>
      <p className="muted">
        New flow (classic <strong>Connect</strong> is unchanged): scrape People
        cards → LLM keeps <em>{targetGender}</em> + HR / Talent Acquisition /
        SDE / backend / fullstack / ML eng / eng manager → you verify the
        checklist → send opens each checked profile and invites there. Change
        gender in <code>linkedin-playwright/config.json</code>{" "}
        (<code>smartConnect.targetGender</code>: female / male / any), then{" "}
        <strong>Re-run LLM (keep scrape)</strong>. Excludes marketing, sales,
        ops, finance, design-only, intern/student when clear.
      </p>

      {peer ? (
        <div className="banner warn">
          {peer.label}
          {peer.kind !== "login" ? (
            <>
              {" "}
              <button type="button" onClick={onStopPeer}>
                Stop LinkedIn job
              </button>
            </>
          ) : (
            <span className="muted"> Close the login Chrome window first.</span>
          )}
        </div>
      ) : null}

      <div className="form compact pool-filters">
        <label>
          Find company
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name / domain"
            disabled={localBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySearch();
              }
            }}
          />
        </label>
        <button type="button" disabled={localBusy || loading} onClick={applySearch}>
          Search
        </button>
        <span className="muted">
          {loading ? "Loading…" : `${total.toLocaleString()} companies`}
        </span>
      </div>

      <Pagination
        page={page}
        pages={pages}
        total={total}
        pageSize={pageSize}
        disabled={localBusy || loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <div className="pool-table-wrap">
        <table className="pool-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Domain</th>
              <th>LinkedIn as</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="muted">
                  Loading…
                </td>
              </tr>
            ) : companies.length ? (
              companies.map((c) => {
                const active = selected?.id === c.id;
                return (
                  <tr
                    key={c.id}
                    className={active ? "selected" : undefined}
                    onClick={() => pickCompany(c)}
                  >
                    <td>
                      <div className="pool-name">{c.name}</div>
                    </td>
                    <td className="mono">{c.domain || "—"}</td>
                    <td>{c.matched_as || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={active ? "primary" : ""}
                        onClick={(e) => {
                          e.stopPropagation();
                          pickCompany(c);
                        }}
                      >
                        {active ? "Selected" : "Select"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  No companies
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form" style={{ marginTop: "1rem" }}>
        <label>
          Search keywords
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Defaults to company name"
            disabled={localBusy}
          />
        </label>
        <label>
          Current companies filter
          <input
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            disabled={localBusy}
          />
        </label>
        <div className="row-actions" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <label>
            Pages
            <input
              type="number"
              min={1}
              max={25}
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              disabled={localBusy}
              style={{ width: "4.5rem" }}
            />
          </label>
          <label>
            Max invites
            <input
              type="number"
              min={1}
              max={100}
              value={maxInvites}
              onChange={(e) => setMaxInvites(e.target.value)}
              disabled={localBusy}
              style={{ width: "4.5rem" }}
            />
          </label>
          <label>
            Delay ms
            <input
              type="number"
              min={800}
              max={30000}
              value={delayMs}
              onChange={(e) => setDelayMs(e.target.value)}
              disabled={localBusy}
              style={{ width: "5.5rem" }}
            />
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={withNote}
              onChange={(e) => setWithNote(e.target.checked)}
              disabled={localBusy}
            />
            With note
          </label>
        </div>
        {withNote ? (
          <label>
            Note (≤300)
            <textarea
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              disabled={localBusy}
              rows={3}
            />
          </label>
        ) : null}

        <div className="row-actions">
          <button
            type="button"
            className="primary"
            disabled={localBusy || running}
            onClick={onTriage}
          >
            1 · Find &amp; triage
          </button>
          <button
            type="button"
            disabled={localBusy || running}
            onClick={onRetriage}
            title="Re-run Azure LLM on last saved scrape without opening LinkedIn"
          >
            Re-run LLM (keep scrape)
          </button>
          <button
            type="button"
            className="primary"
            disabled={localBusy || running || !checkedCount}
            onClick={onSend}
          >
            2 · Send checked ({checkedCount})
          </button>
          {running ? (
            <button type="button" onClick={onStop}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {job ? (
        <div
          className={`send-status-banner${running ? " active" : ""}`}
          style={{ marginTop: "1rem" }}
        >
          <strong>Smart Connect:</strong>{" "}
          <span className="status">{job.state}</span>
          {job.phase ? <span className="muted"> · {job.phase}</span> : null}
          {job.message ? (
            <div className="muted" style={{ marginTop: "0.35rem" }}>
              {job.message}
            </div>
          ) : null}
          <div className="muted tight" style={{ marginTop: "0.35rem" }}>
            scraped {job.scraped ?? 0} · connectable {job.with_connect ?? 0} ·
            proposed {job.proposed_count ?? rows.length}
            {job.phase === "send"
              ? ` · sent ${job.invited || 0} · failed ${job.failed || 0}`
              : ""}
          </div>
          {job.debug ? (
            <div className="mono muted tight" style={{ marginTop: "0.25rem" }}>
              scrape debug: {job.debug}
            </div>
          ) : null}
          {job.provider ? (
            <div className="muted tight">
              LLM {job.provider}
              {job.model ? `:${job.model}` : ""}
              {job.llm_debug_log ? ` · log ${job.llm_debug_log}` : ""}
            </div>
          ) : null}
          {job.last_error ? (
            <div className="banner error" style={{ marginTop: "0.5rem" }}>
              {job.last_error}
            </div>
          ) : null}
          {job.state === "completed" &&
          (job.scraped === 0 || (job.proposed_count === 0 && !rows.length)) ? (
            <div className="banner warn" style={{ marginTop: "0.5rem" }}>
              No checklist rows. If scraped is 0, LinkedIn cards were not
              detected (company filter / login / People tab). If scraped &gt; 0
              but proposed is 0, open <em>excluded</em> and the LLM log below —
              gender/role filters may have dropped everyone.
            </div>
          ) : null}
        </div>
      ) : null}

      {llmLog.length ? (
        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="ghost"
            onClick={() => setShowLlmLog((v) => !v)}
          >
            {showLlmLog ? "Hide" : "Show"} LLM / triage log ({llmLog.length})
          </button>
          {showLlmLog ? (
            <pre
              className="mono"
              style={{
                marginTop: "0.5rem",
                maxHeight: "220px",
                overflow: "auto",
                padding: "0.75rem",
                background: "var(--panel-muted)",
                border: "1px solid var(--line)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {llmLog.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}

      {rows.length ? (
        <div style={{ marginTop: "1.25rem" }}>
          <div className="row-between">
            <h3 style={{ margin: 0 }}>
              Proposed checklist ({rows.length})
            </h3>
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => toggleAll(true)}>
                Check all
              </button>
              <button type="button" className="ghost" onClick={() => toggleAll(false)}>
                Uncheck all
              </button>
            </div>
          </div>
          <p className="muted tight">
            Uncheck anyone the LLM got wrong (gender or role) before sending.
          </p>
          <div className="pool-table-wrap">
            <table className="pool-table">
              <thead>
                <tr>
                  <th style={{ width: "2.5rem" }} />
                  <th>Name</th>
                  <th>Headline</th>
                  <th>Gender</th>
                  <th>Role</th>
                  <th>Score</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = r.id || r.vanityName || r.name;
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked.has(key)}
                          onChange={() => toggleOne(key)}
                          disabled={running}
                        />
                      </td>
                      <td>
                        {r.profileUrl ? (
                          <a
                            href={r.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="muted">{r.headline || r.current || "—"}</td>
                      <td>{r.gender || "—"}</td>
                      <td>{r.role || "—"}</td>
                      <td>{r.score != null ? Number(r.score).toFixed(2) : "—"}</td>
                      <td className="muted">{r.reason || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: "1rem" }}>
          Run <strong>Find &amp; triage</strong> to populate the checklist.
        </p>
      )}

      {excluded.length ? (
        <div style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="ghost"
            onClick={() => setShowExcluded((v) => !v)}
          >
            {showExcluded ? "Hide" : "Show"} excluded ({excluded.length})
          </button>
          {showExcluded ? (
            <div className="pool-table-wrap" style={{ marginTop: "0.5rem" }}>
              <table className="pool-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Gender</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {excluded.slice(0, 80).map((r) => (
                    <tr key={r.id || r.name}>
                      <td>{r.name}</td>
                      <td>{r.role}</td>
                      <td>{r.gender}</td>
                      <td className="muted">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
