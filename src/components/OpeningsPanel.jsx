import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Pagination from "./Pagination.jsx";

function locationLabel(loc) {
  if (!loc) return "";
  const count = loc.opening_count ?? 0;
  const elig = loc.eligible_count ?? 0;
  const name = loc.location || loc.location_slug;
  return `${name} (${count} openings · ${elig} eligible)`;
}

function scoreLabel(assessment) {
  if (!assessment) return "—";
  const s = Number(assessment.score);
  if (!Number.isFinite(s)) return "—";
  return s.toFixed(2);
}

function progressPct(progress) {
  const total = Number(progress?.total || 0);
  const current = Number(progress?.current || 0);
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * Browse career openings. Scan / eligibility run as backend subprocesses —
 * local job state only (does NOT freeze the rest of the app via App.busy).
 */
export default function OpeningsPanel({ setError, canWrite = false }) {
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [eligible, setEligible] = useState("any");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [sort, setSort] = useState("fetched_at");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const [scanMax, setScanMax] = useState("20");
  const [concurrency, setConcurrency] = useState("4");
  const [runEligibilityAfter, setRunEligibilityAfter] = useState(false);
  const [forceEligibility, setForceEligibility] = useState(false);
  const [job, setJob] = useState(null);

  const jobRunning =
    !!job &&
    (["running", "starting"].includes(job.state) || job.busy === true);
  const startDisabled = jobRunning || syncing;

  const loadLocations = useCallback(async () => {
    try {
      const rows = await api.listCareerLocations();
      setLocations(rows || []);
    } catch (err) {
      setError?.(err.message);
    }
  }, [setError]);

  const loadOpenings = useCallback(async () => {
    setLoading(true);
    try {
      const min = minScore.trim() === "" ? undefined : Number(minScore);
      const max = maxScore.trim() === "" ? undefined : Number(maxScore);
      const res = await api.listCareerOpenings({
        location: location || undefined,
        q: appliedQ.trim() || undefined,
        eligible,
        min_score:
          min != null && Number.isFinite(min) ? min : undefined,
        max_score:
          max != null && Number.isFinite(max) ? max : undefined,
        sort,
        page,
        page_size: pageSize,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
      setPages(res.pages || 0);
    } catch (err) {
      setError?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    location,
    appliedQ,
    eligible,
    minScore,
    maxScore,
    sort,
    page,
    pageSize,
    setError,
  ]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadOpenings();
  }, [loadOpenings]);

  // Re-attach to an in-flight job after tab switch / refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.careerJobStatus();
        if (cancelled) return;
        if (st?.state && st.state !== "idle") setJob(st);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll while CLI / ingest is running — does not touch App-wide busy.
  useEffect(() => {
    if (!jobRunning) return undefined;
    const id = setInterval(async () => {
      try {
        const st = await api.careerJobStatus();
        setJob(st);
        if (!["running", "starting"].includes(st.state) && !st.busy) {
          clearInterval(id);
          if (st.ingest) setIngestResult(st.ingest);
          loadLocations();
          loadOpenings();
        }
      } catch (err) {
        setError?.(err.message);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [jobRunning, setError, loadLocations, loadOpenings]);

  async function onExpand(id) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetail(null);
    try {
      setDetail(await api.getCareerOpening(id));
    } catch (err) {
      setError?.(err.message);
    }
  }

  async function onSync() {
    setSyncing(true);
    setError("");
    setIngestResult(null);
    try {
      const res = await api.ingestCareer(location || undefined);
      setIngestResult(res);
      await loadLocations();
      await loadOpenings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function onStartScan() {
    if (!location.trim()) {
      setError("Pick a location before starting a scan");
      return;
    }
    setError("");
    try {
      const st = await api.startCareerScan({
        location,
        max: Math.max(1, Number(scanMax) || 20),
        concurrency: Math.max(1, Math.min(Number(concurrency) || 4, 16)),
        eligibility: runEligibilityAfter,
        force: true,
        headed: true,
      });
      setJob(st);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStartEligibility() {
    setError("");
    try {
      const st = await api.startCareerEligibility({
        location: location || undefined,
        max: Math.max(1, Number(scanMax) || 20),
        discover: true,
        all_openings: false,
        force: forceEligibility,
      });
      setJob(st);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStop() {
    try {
      setJob(await api.stopCareerJob());
    } catch (err) {
      setError(err.message);
    }
  }

  const pct = progressPct(job?.progress);
  const phase = job?.progress?.phase;

  return (
    <section className="panel">
      <h2>Career openings</h2>
      <p className="muted">
        Browse scraped openings and LLM eligibility from{" "}
        <code>career-openings/</code>. Scan / eligibility run in the background;
        after each job, only dirs touched by that run are ingested (skips the
        full registry). Use <strong>Sync DB</strong> for a full registry +
        openings resync. Other tabs stay usable while a job runs.
      </p>

      <div className="form compact pool-filters">
        <label>
          Location
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.location_slug} value={loc.location_slug}>
                {locationLabel(loc)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setPage(1);
                setAppliedQ(q.trim());
              }
            }}
            placeholder="title or company…"
          />
        </label>
        <label>
          Eligible
          <select
            value={eligible}
            onChange={(e) => {
              setEligible(e.target.value);
              setPage(1);
            }}
          >
            <option value="any">Any</option>
            <option value="true">Eligible only</option>
            <option value="false">Not eligible</option>
            <option value="assessed">Assessed (any)</option>
            <option value="unassessed">Unassessed</option>
          </select>
        </label>
        <label>
          Min score
          <input
            type="number"
            step="0.1"
            min={0}
            max={1}
            value={minScore}
            onChange={(e) => {
              setMinScore(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. 0.5"
          />
        </label>
        <label>
          Max score
          <input
            type="number"
            step="0.1"
            min={0}
            max={1}
            value={maxScore}
            onChange={(e) => {
              setMaxScore(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. 1"
          />
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="fetched_at">Fetched</option>
            <option value="score">Score (high → low)</option>
            <option value="score_asc">Score (low → high)</option>
            <option value="title">Title</option>
            <option value="company">Company</option>
          </select>
        </label>
        <div className="full row-actions">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setAppliedQ(q.trim());
            }}
          >
            Search
          </button>
          {canWrite ? (
            <button
              type="button"
              className="primary"
              disabled={startDisabled}
              onClick={onSync}
            >
              {syncing ? "Syncing…" : "Sync DB"}
            </button>
          ) : null}
        </div>
      </div>

      {canWrite ? (
      <div className="form compact pool-filters">
        <label>
          Max companies
          <input
            type="number"
            min={1}
            max={5000}
            value={scanMax}
            disabled={jobRunning}
            onChange={(e) => setScanMax(e.target.value)}
          />
        </label>
        <label>
          Concurrency
          <input
            type="number"
            min={1}
            max={16}
            value={concurrency}
            disabled={jobRunning}
            onChange={(e) => setConcurrency(e.target.value)}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={runEligibilityAfter}
            disabled={jobRunning}
            onChange={(e) => setRunEligibilityAfter(e.target.checked)}
          />
          Eligibility after scan
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={forceEligibility}
            disabled={jobRunning}
            onChange={(e) => setForceEligibility(e.target.checked)}
          />
          Force eligibility (ignore same-day skip)
        </label>
        <div className="full row-actions">
          <button
            type="button"
            className="primary"
            disabled={startDisabled || !location}
            onClick={onStartScan}
          >
            Start scan
          </button>
          <button
            type="button"
            className="primary"
            disabled={startDisabled}
            onClick={onStartEligibility}
          >
            Run eligibility
          </button>
          {jobRunning ? (
            <button type="button" onClick={onStop}>
              Stop job
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      {job && job.state !== "idle" ? (
        <div
          className="connect-job-status"
          style={{ marginBottom: "0.75rem" }}
        >
          <p style={{ margin: "0 0 0.35rem" }}>
            <strong>
              {job.kind || "job"} · {job.state}
            </strong>
            {phase === "ingesting" ? " · syncing DB…" : ""}
            {job.message ? ` — ${job.message}` : ""}
            {job.last_error ? (
              <span className="pill warn" style={{ marginLeft: 8 }}>
                {job.last_error}
              </span>
            ) : null}
          </p>
          {jobRunning && (pct != null || job.progress?.label) ? (
            <div style={{ marginBottom: "0.4rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                  marginBottom: 4,
                }}
              >
                <span className="muted">
                  {job.progress?.current || 0}
                  {job.progress?.total ? ` / ${job.progress.total}` : ""}
                  {job.progress?.label ? ` · ${job.progress.label}` : ""}
                </span>
                {pct != null ? <span className="muted">{pct}%</span> : null}
              </div>
              {pct != null ? (
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: "rgba(28,25,23,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: "var(--accent)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {job.ingest && !jobRunning ? (
            <p className="muted" style={{ margin: 0 }}>
              Ingested {job.ingest.openings_upserted || 0} openings ·{" "}
              {job.ingest.assessments_upserted || 0} assessments
            </p>
          ) : null}
          {job.log_tail?.length ? (
            <pre
              className="muted"
              style={{
                maxHeight: 160,
                overflow: "auto",
                fontSize: "0.78rem",
                margin: "0.5rem 0 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {job.log_tail.slice(-25).join("\n")}
            </pre>
          ) : jobRunning ? (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              Waiting for CLI output…
            </p>
          ) : null}
        </div>
      ) : null}

      {ingestResult ? (
        <p className="muted">
          Sync{ingestResult.mode ? ` (${ingestResult.mode})` : ""}:{" "}
          {ingestResult.companies_upserted || ingestResult.enrollments_upserted || 0}{" "}
          companies · {ingestResult.openings_upserted || 0} openings ·{" "}
          {ingestResult.assessments_upserted || 0} assessments
          {ingestResult.dirs_processed != null
            ? ` · ${ingestResult.dirs_processed} dirs`
            : ""}
          {ingestResult.elapsed_ms != null
            ? ` · ${(ingestResult.elapsed_ms / 1000).toFixed(1)}s`
            : ""}
          {ingestResult.errors?.length
            ? ` · ${ingestResult.errors.length} error(s)`
            : ""}
        </p>
      ) : null}

      <Pagination
        page={page}
        pages={pages}
        total={total}
        pageSize={pageSize}
        disabled={loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {loading && !items.length ? <p className="muted">Loading…</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Eligible</th>
            <th>Score</th>
            <th>Fetched</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const a = row.assessment;
            const open = expanded === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  style={{ cursor: "pointer" }}
                  onClick={() => onExpand(row.id)}
                >
                  <td>
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.title}
                      </a>
                    ) : (
                      row.title
                    )}
                  </td>
                  <td>
                    <div>{row.company_name}</div>
                    {row.career_url ? (
                      <a
                        href={row.career_url}
                        target="_blank"
                        rel="noreferrer"
                        className="muted"
                        style={{ fontSize: "0.8rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Career page
                      </a>
                    ) : null}
                  </td>
                  <td>{row.location || row.location_slug}</td>
                  <td>{a == null ? "—" : a.eligible ? "yes" : "no"}</td>
                  <td>{scoreLabel(a)}</td>
                  <td>
                    {row.fetched_at ? String(row.fetched_at).slice(0, 19) : "—"}
                  </td>
                </tr>
                {open ? (
                  <tr>
                    <td colSpan={6}>
                      {!detail ? (
                        <p className="muted">Loading detail…</p>
                      ) : (
                        <div>
                          <p className="muted">
                            {detail.snippet || "No snippet"}
                          </p>
                          {detail.assessment ? (
                            <div>
                              <p>
                                <strong>Reason:</strong>{" "}
                                {detail.assessment.reason || "—"}
                              </p>
                              <p className="muted">
                                Experience fit:{" "}
                                {detail.assessment.experience_fit || "—"} ·
                                Passing year:{" "}
                                {detail.assessment.passing_year_fit || "—"} ·
                                Required exp:{" "}
                                {detail.assessment.required_experience || "—"} ·
                                Required year:{" "}
                                {detail.assessment.required_passing_year || "—"}
                                {detail.assessment.model
                                  ? ` · ${detail.assessment.provider || ""}:${detail.assessment.model}`
                                  : ""}
                              </p>
                            </div>
                          ) : (
                            <p className="muted">
                              No eligibility assessment yet.
                            </p>
                          )}
                          {detail.career_url ? (
                            <p>
                              <a
                                href={detail.career_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Career page
                              </a>
                            </p>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          {!items.length && !loading ? (
            <tr>
              <td colSpan={6} className="muted">
                No openings yet. Sync from disk or run a scan.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {total > 0 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}
    </section>
  );
}
