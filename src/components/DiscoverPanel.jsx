import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Pagination from "./Pagination.jsx";

const MULTIPLIERS = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

/** "50m" / "$1.5b" / "250000000" → number. Empty or 0 means "no bound". */
function parseAmount(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const m = /^\$?\s*(-?[\d,]+(?:\.\d+)?)\s*([kmbt])?$/i.exec(raw.replace(/\s+/g, ""));
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * (MULTIPLIERS[(m[2] || "").toLowerCase()] ?? 1));
}

function formatAmount(value) {
  const n = Number(value || 0);
  if (!n) return "";
  for (const [suffix, mult] of [
    ["b", 1e9],
    ["m", 1e6],
    ["k", 1e3],
  ]) {
    if (n >= mult) {
      const scaled = n / mult;
      return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(n);
}

function formatMoney(value, label) {
  if (label) return label;
  const pretty = formatAmount(value);
  return pretty ? `$${pretty}` : "—";
}

/**
 * Discover more companies from RocketReach "Related Companies" cards.
 * Pick a seed company, filter the cards on revenue / headcount, then save the
 * ones you want into the pool. Names already in the DB are never duplicated.
 */
export default function DiscoverPanel({ busy, setBusy, setError, onCompaniesChange }) {
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [loading, setLoading] = useState(false);
  /** Hide companies already used as Discover seeds (default). */
  const [showSeeded, setShowSeeded] = useState(false);

  const [seed, setSeed] = useState("");
  const [seedUrl, setSeedUrl] = useState("");
  const [minRevenue, setMinRevenue] = useState("");
  const [maxRevenue, setMaxRevenue] = useState("");
  const [minEmployees, setMinEmployees] = useState("");
  const [maxEmployees, setMaxEmployees] = useState("");
  const [requireRevenue, setRequireRevenue] = useState(true);
  const [depth, setDepth] = useState("4");
  const [maxCompanies, setMaxCompanies] = useState("100");
  const [maxPages, setMaxPages] = useState("40");
  const [concurrency, setConcurrency] = useState("4");
  const [autoSave, setAutoSave] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [job, setJob] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [dropped, setDropped] = useState(() => new Set());
  const [saveResult, setSaveResult] = useState(null);
  const [showRejected, setShowRejected] = useState(false);
  /** Revenue (evaluation) sort: "desc" = highest first (default). */
  const [evalOrder, setEvalOrder] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getDiscoverConfig();
        if (cancelled) return;
        const r = res.related || {};
        setMinRevenue(formatAmount(r.minRevenue));
        setMaxRevenue(formatAmount(r.maxRevenue));
        setMinEmployees(r.minEmployees ? String(r.minEmployees) : "");
        setMaxEmployees(r.maxEmployees ? String(r.maxEmployees) : "");
        setRequireRevenue(Boolean(r.requireRevenue));
        setDepth(String(r.depth ?? 4));
        setMaxCompanies(String(r.maxCompanies ?? 100));
        setMaxPages(String(r.maxPages ?? 40));
        setConcurrency(String(r.concurrency ?? 4));
        setAutoSave(r.autoSave !== false);
        setDirty(false);
      } catch (err) {
        if (!cancelled) setError?.(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCompanies({
        q: appliedQ.trim() || undefined,
        page,
        page_size: pageSize,
        include_counts: false,
        // Default: only companies not yet used as Discover seeds.
        discover_seeded: showSeeded ? undefined : false,
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
  }, [page, pageSize, appliedQ, showSeeded, setError]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Re-attach to an in-flight Discover job after refresh / tab switch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.discoverStatus();
        if (cancelled) return;
        if (st?.state && st.state !== "idle") {
          setJob(st);
        }
        if (["running", "starting"].includes(st?.state) || st?.busy) {
          setBusy(true);
        }
      } catch {
        /* ignore — panel still usable offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setBusy]);

  useEffect(() => {
    if (!job || (!["running", "starting"].includes(job.state) && !job.busy)) {
      return undefined;
    }
    const id = setInterval(async () => {
      try {
        const st = await api.discoverStatus();
        setJob(st);
        if (!["running", "starting"].includes(st.state) && !st.busy) {
          clearInterval(id);
          setBusy(false);
          loadCompanies();
          onCompaniesChange?.();
        }
      } catch (err) {
        setError(err.message);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [job, setBusy, setError, loadCompanies, onCompaniesChange]);

  const candidates = useMemo(() => {
    const list = [...(job?.candidates || [])];
    const dir = evalOrder === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a.revenue == null ? -1 : Number(a.revenue);
      const bv = b.revenue == null ? -1 : Number(b.revenue);
      if (av !== bv) return (av - bv) * dir;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return list;
  }, [job, evalOrder]);

  // New candidates start selected unless they are already in the pool, or the
  // user explicitly unchecked them earlier in this run.
  useEffect(() => {
    if (!candidates.length) return;
    setPicked((prev) => {
      const next = new Set(prev);
      for (const c of candidates) {
        if (!c.in_db && !dropped.has(c.name)) next.add(c.name);
      }
      return next;
    });
  }, [candidates, dropped]);

  function filterPayload() {
    return {
      min_revenue: parseAmount(minRevenue),
      max_revenue: parseAmount(maxRevenue),
      min_employees: parseAmount(minEmployees),
      max_employees: parseAmount(maxEmployees),
      require_revenue: requireRevenue,
      depth: Math.max(1, Math.min(Number(depth) || 4, 10)),
      max_companies: Math.max(1, Math.min(Number(maxCompanies) || 100, 1000)),
      max_pages: Math.max(1, Math.min(Number(maxPages) || 40, 200)),
      concurrency: Math.max(1, Math.min(Number(concurrency) || 4, 8)),
      auto_save: autoSave,
    };
  }

  async function onSaveDefaults() {
    setError("");
    try {
      const res = await api.saveDiscoverConfig(filterPayload());
      const r = res.related || {};
      setMinRevenue(formatAmount(r.minRevenue));
      setMaxRevenue(formatAmount(r.maxRevenue));
      setDirty(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStart() {
    const company = seed.trim();
    const url = seedUrl.trim();
    if (!company && !url) {
      setError("Pick a seed company, or paste a RocketReach page URL");
      return;
    }
    setBusy(true);
    setError("");
    setSaveResult(null);
    setPicked(new Set());
    setDropped(new Set());
    try {
      const st = await api.startDiscover({
        company,
        url: url || undefined,
        from_pool: false,
        batch: true,
        ...filterPayload(),
      });
      setJob(st);
      setSeed("");
      await loadCompanies();
      await onCompaniesChange?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onStartAllUnseeded() {
    setBusy(true);
    setError("");
    setSaveResult(null);
    setPicked(new Set());
    setDropped(new Set());
    try {
      // Pool sweep: walk every unseeded company (max_pages 0 = no seed cap).
      // Page cap still applies to "Start from selected" expand runs.
      const st = await api.startDiscover({
        from_pool: true,
        ...filterPayload(),
        max_pages: 0,
      });
      setJob(st);
      setSeed("");
      await loadCompanies();
      await onCompaniesChange?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onStop() {
    try {
      setJob(await api.stopDiscover());
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSaveSelected() {
    const rows = candidates.filter((c) => picked.has(c.name) && !c.in_db);
    if (!rows.length) {
      setError("Nothing selected to save");
      return;
    }
    setError("");
    try {
      const res = await api.saveDiscovered(
        rows.map((c) => ({
          name: c.name,
          employees: c.employees ?? null,
          revenue: c.revenue ?? null,
          revenueLabel: c.revenueLabel ?? null,
          seed: c.seed ?? null,
          url: c.url ?? null,
        })),
      );
      setSaveResult(res);
      setJob(await api.discoverStatus());
      await onCompaniesChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function togglePick(name, checked) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
    setDropped((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const selectable = candidates.filter((c) => !c.in_db);
  const selectedCount = selectable.filter((c) => picked.has(c.name)).length;
  const running = ["running", "starting"].includes(job?.state);

  return (
    <section className="panel">
      <h2>Discover companies</h2>
      <p className="muted">
        Two ways to run Discover with your evaluation filters: pick one start
        company and expand through related links, or scrape{" "}
        <strong>all unseeded companies</strong> in the pool{" "}
        <strong>{concurrency || 4} at a time</strong>. Matches auto-save; finished
        seeds are hidden so they are not repeated.
      </p>

      <div className="form compact pool-filters">
        <label>
          Find seed company
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name / domain"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setPage(1);
                setAppliedQ(q);
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setPage(1);
            setAppliedQ(q);
          }}
        >
          Search
        </button>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showSeeded}
            onChange={(e) => {
              setShowSeeded(e.target.checked);
              setPage(1);
            }}
            disabled={busy}
          />
          Show already seeded
        </label>
        <span className="muted">
          {loading
            ? "Loading…"
            : `${total.toLocaleString()} ${showSeeded ? "companies" : "unseeded"}`}
        </span>
      </div>

      <Pagination
        page={page}
        pages={pages}
        total={total}
        pageSize={pageSize}
        disabled={busy || loading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <div className="pool-table-wrap short">
        <table className="pool-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Domain</th>
              <th>Status</th>
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
                const active = seed.trim().toLowerCase() === (c.name || "").toLowerCase();
                return (
                  <tr
                    key={c.id}
                    className={active ? "selected" : undefined}
                    onClick={() => setSeed(c.name || "")}
                  >
                    <td>
                      <div className="pool-name">{c.name}</div>
                      {c.discover_seeded_at ? (
                        <div className="muted tight">seeded</div>
                      ) : null}
                    </td>
                    <td className="mono">{c.domain || "—"}</td>
                    <td>{c.outreach_status || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={active ? "primary" : ""}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSeed(c.name || "");
                        }}
                      >
                        {active ? "Seed" : "Use as seed"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  No companies — import CSV in Settings or loosen search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form" style={{ marginTop: "1rem" }}>
        <label>
          Seed company
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="e.g. Postman"
            disabled={busy}
          />
        </label>
        <label>
          RocketReach URL (optional)
          <input
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="https://rocketreach.co/postman-email-format_…"
            disabled={busy}
          />
          <span className="muted tight">
            Skips the Google step when you already have the page.
          </span>
        </label>

        <label>
          Min revenue
          <input
            value={minRevenue}
            onChange={(e) => {
              setMinRevenue(e.target.value);
              setDirty(true);
            }}
            placeholder="50m — blank for no minimum"
            disabled={busy}
          />
        </label>
        <label>
          Max revenue
          <input
            value={maxRevenue}
            onChange={(e) => {
              setMaxRevenue(e.target.value);
              setDirty(true);
            }}
            placeholder="2b — blank for no maximum"
            disabled={busy}
          />
        </label>
        <label>
          Min employees
          <input
            type="number"
            min="0"
            value={minEmployees}
            onChange={(e) => {
              setMinEmployees(e.target.value);
              setDirty(true);
            }}
            placeholder="200"
            disabled={busy}
          />
        </label>
        <label>
          Max employees
          <input
            type="number"
            min="0"
            value={maxEmployees}
            onChange={(e) => {
              setMaxEmployees(e.target.value);
              setDirty(true);
            }}
            placeholder="blank for no maximum"
            disabled={busy}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={requireRevenue}
            onChange={(e) => {
              setRequireRevenue(e.target.checked);
              setDirty(true);
            }}
            disabled={busy}
          />
          Skip cards with no revenue figure
        </label>
        <label>
          Depth (hops)
          <input
            type="number"
            min="1"
            max="10"
            value={depth}
            onChange={(e) => {
              setDepth(e.target.value);
              setDirty(true);
            }}
            disabled={busy}
          />
          <span className="muted tight">
            How far to expand from the start company through related links.
          </span>
        </label>
        <label>
          Max companies
          <input
            type="number"
            min="1"
            max="1000"
            value={maxCompanies}
            onChange={(e) => {
              setMaxCompanies(e.target.value);
              setDirty(true);
            }}
            disabled={busy}
          />
        </label>
        <label>
          Page cap
          <input
            type="number"
            min="1"
            max="200"
            value={maxPages}
            onChange={(e) => {
              setMaxPages(e.target.value);
              setDirty(true);
            }}
            disabled={busy}
          />
          <span className="muted tight">
            Only for “Start from selected”. Pool sweep visits every unseeded
            company.
          </span>
        </label>
        <label>
          Parallel tabs
          <input
            type="number"
            min="1"
            max="8"
            value={concurrency}
            onChange={(e) => {
              setConcurrency(e.target.value);
              setDirty(true);
            }}
            disabled={busy}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => {
              setAutoSave(e.target.checked);
              setDirty(true);
            }}
            disabled={busy}
          />
          Auto-save matches to the pool
        </label>

        <div className="full row-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={onStartAllUnseeded}
          >
            {running && job?.from_pool
              ? `Pool scrape ×${job?.concurrency || concurrency}…`
              : `Start all unseeded ×${concurrency || 4}`}
          </button>
          <button
            type="button"
            disabled={busy || (!seed.trim() && !seedUrl.trim())}
            onClick={onStart}
          >
            {running && !job?.from_pool
              ? `Expanding ×${job?.concurrency || concurrency}…`
              : `Start from selected ×${concurrency || 4}`}
          </button>
          {running ? (
            <button type="button" onClick={onStop}>
              Stop after current wave
            </button>
          ) : null}
          <button
            type="button"
            className="ghost"
            disabled={busy || !dirty}
            onClick={onSaveDefaults}
          >
            Save defaults to config
          </button>
          {dirty ? <span className="muted tight">Unsaved changes</span> : null}
        </div>
      </div>

      {job ? (
        <div className="connect-job-status">
          <p className="muted">
            Job: {job.state}
            {job.from_pool
              ? ` · pool ${job.seeded_count || 0}/${job.pool_total || "?"}`
              : job.batch
                ? ` · expand×${job.concurrency || concurrency}`
                : ""}
            {job.active_seeds?.length
              ? ` · active: ${job.active_seeds.join(", ")}`
              : job.current
                ? ` · ${job.current}`
                : ""}
            {job.message ? ` — ${job.message}` : ""}
            {` · pages ${job.pages_visited || 0} · new ${job.discovered || 0} · matched ${job.kept || 0} · saved ${job.saved_count || 0} · seeds done ${job.seeded_count || 0} · filtered ${job.rejected_count || 0}`}
            {job.known_skipped
              ? ` · ${job.known_skipped} skipped (already in pool)`
              : ""}
            {job.last_error ? ` · error: ${job.last_error}` : ""}
          </p>

          {candidates.length ? (
            <>
              <div className="row-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !selectedCount}
                  onClick={onSaveSelected}
                >
                  Save {selectedCount} to pool
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPicked(new Set(selectable.map((c) => c.name)));
                    setDropped(new Set());
                  }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPicked(new Set());
                    setDropped(new Set(selectable.map((c) => c.name)));
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="pool-table-wrap">
                <table className="pool-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Company</th>
                      <th>Employees</th>
                      <th>
                        <button
                          type="button"
                          className="ghost sort-header"
                          onClick={() =>
                            setEvalOrder((o) => (o === "desc" ? "asc" : "desc"))
                          }
                          title="Sort by evaluation (revenue)"
                        >
                          Revenue {evalOrder === "desc" ? "↓" : "↑"}
                        </button>
                      </th>
                      <th>Found via</th>
                      <th>Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.name} className={c.in_db ? "muted" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={picked.has(c.name) && !c.in_db}
                            disabled={busy || c.in_db}
                            onChange={(e) => togglePick(c.name, e.target.checked)}
                          />
                        </td>
                        <td>
                          <div className="pool-name">{c.name}</div>
                          {c.in_db ? (
                            <div className="muted tight">already in pool</div>
                          ) : null}
                        </td>
                        <td>{c.employees ? c.employees.toLocaleString() : "—"}</td>
                        <td>{formatMoney(c.revenue, c.revenueLabel)}</td>
                        <td>{c.seed || "—"}</td>
                        <td>
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noreferrer">
                              RocketReach
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {job.rejected?.length ? (
            <div className="discover-rejected">
              <button
                type="button"
                className="ghost"
                onClick={() => setShowRejected((v) => !v)}
              >
                {showRejected ? "Hide" : "Show"} {job.rejected.length} filtered out
              </button>
              {showRejected ? (
                <ul className="connect-invite-list">
                  {job.rejected.map((r) => (
                    <li key={r.name}>
                      <strong>{r.name}</strong> — {r.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {saveResult ? (
        <p className="muted">
          Saved {saveResult.created_count} new{" "}
          {saveResult.created_count === 1 ? "company" : "companies"}
          {saveResult.skipped_count
            ? ` · skipped ${saveResult.skipped_count} (already in the pool)`
            : ""}
          {saveResult.created?.length
            ? `: ${saveResult.created.map((c) => c.name).join(", ")}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
