import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Pagination from "./Pagination.jsx";

/**
 * LinkedIn connection invites: pick a company from the DB, optionally
 * override the search string / Current-companies filter, send with or
 * without a note.
 */
export default function ConnectPanel({ setError }) {
  const [localBusy, setLocalBusy] = useState(false);
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
  const [withNote, setWithNote] = useState(false);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteSavedAt, setNoteSavedAt] = useState(null);
  const [maxPages, setMaxPages] = useState("3");
  const [maxInvites, setMaxInvites] = useState("20");
  const [delayMs, setDelayMs] = useState("2500");
  const [job, setJob] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getConnectNote();
        if (cancelled) return;
        const c = res.connect || {};
        setWithNote(Boolean(c.withNote));
        setNote(String(c.note || "").slice(0, 300));
        setMaxPages(String(c.maxPages ?? 3));
        setMaxInvites(String(c.maxInvites ?? 20));
        setDelayMs(String(c.delayMs ?? 2500));
        setNoteDirty(false);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.linkedinConnectStatus();
        if (!cancelled) setJob(st);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || !["running", "starting"].includes(job.state)) return undefined;
    const id = setInterval(async () => {
      try {
        const st = await api.linkedinConnectStatus();
        setJob(st);
        if (!["running", "starting"].includes(st.state)) {
          clearInterval(id);
          setLocalBusy(false);
        }
      } catch (err) {
        setError(err.message);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [job, setError]);

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

  async function onSaveNote() {
    if (withNote && !note.trim()) {
      setError("Enter an invitation note before saving, or turn off “With note”");
      return;
    }
    setError("");
    try {
      const res = await api.saveConnectNote({
        with_note: withNote,
        note: note.trim(),
        max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
        max_invites: Math.max(1, Math.min(Number(maxInvites) || 20, 100)),
        delay_ms: Math.max(800, Math.min(Number(delayMs) || 2500, 30000)),
      });
      const c = res.connect || {};
      setWithNote(Boolean(c.withNote));
      setNote(String(c.note || "").slice(0, 300));
      setMaxPages(String(c.maxPages ?? maxPages));
      setMaxInvites(String(c.maxInvites ?? maxInvites));
      setDelayMs(String(c.delayMs ?? delayMs));
      setNoteDirty(false);
      setNoteSavedAt(new Date());
    } catch (err) {
      setError(err.message);
    }
  }

  async function onStart() {
    const company = companyFilter.trim();
    if (!company) {
      setError("Pick a company (or type a Current companies filter value)");
      return;
    }
    if (withNote && !note.trim()) {
      setError("Enter an invitation note, or turn off “With note”");
      return;
    }
    setLocalBusy(true);
    setError("");
    try {
      if (noteDirty) {
        await api.saveConnectNote({
          with_note: withNote,
          note: note.trim(),
          max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
          max_invites: Math.max(1, Math.min(Number(maxInvites) || 20, 100)),
          delay_ms: Math.max(800, Math.min(Number(delayMs) || 2500, 30000)),
        });
        setNoteDirty(false);
        setNoteSavedAt(new Date());
      }
      const st = await api.startLinkedInConnect({
        company,
        keywords: keywords.trim() || company,
        with_note: withNote,
        note: withNote ? note.trim() : "",
        max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
        max_invites: Math.max(1, Math.min(Number(maxInvites) || 20, 100)),
        delay_ms: Math.max(800, Math.min(Number(delayMs) || 2500, 30000)),
      });
      setJob(st);
    } catch (err) {
      setError(err.message);
      setLocalBusy(false);
    }
  }

  async function onStop() {
    try {
      const st = await api.stopLinkedInConnect();
      setJob(st);
    } catch (err) {
      setError(err.message);
    }
  }

  const recentInvites = useMemo(
    () => (job?.invites || []).slice(-12).reverse(),
    [job],
  );

  return (
    <section className="panel">
      <h2>LinkedIn Connect</h2>
      <p className="muted">
        Uses your saved LinkedIn session. Flow: search → <em>People</em> →{" "}
        company filter → <em>2nd + 3rd+</em> → click Connect directly on each
        result card. Profiles are never opened, and people already connected or
        pending have no Connect button so they are skipped automatically. Stop
        anytime — finishes the current invite first.
      </p>

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
              <th>Status</th>
              <th>LinkedIn as</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="muted">
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
                      {c.tier ? (
                        <div className="muted tight">Tier {c.tier}</div>
                      ) : null}
                    </td>
                    <td className="mono">{c.domain || "—"}</td>
                    <td>{c.outreach_status || "—"}</td>
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
                <td colSpan={5} className="muted">
                  No companies — import CSV in Settings or loosen search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form" style={{ marginTop: "1rem" }}>
        <label>
          Search keywords (main LinkedIn box)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Defaults to company name if empty"
            disabled={localBusy}
          />
        </label>
        <label>
          Current companies filter
          <input
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="e.g. Fidelity Investments"
            required
            disabled={localBusy}
          />
        </label>

        <label className="inline-check">
          <input
            type="checkbox"
            checked={withNote}
            onChange={(e) => {
              setWithNote(e.target.checked);
              setNoteDirty(true);
            }}
            disabled={localBusy}
          />
          Send with a note
        </label>
        <label className="full">
          Invitation note template ({note.length}/300)
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value.slice(0, 300));
              setNoteDirty(true);
            }}
            rows={3}
            placeholder="Hi {name} — noticed we both work around {company}."
            disabled={localBusy}
            required={withNote}
          />
          <span className="muted tight">
            Stored in <code>linkedin-playwright/config.json</code>
            {withNote
              ? ". Used on each invite."
              : ". Saved for later — this run clicks Send without a note."}{" "}
            Placeholders: <code>{"{name}"}</code>, <code>{"{company}"}</code>.
          </span>
        </label>
        <div className="full row-actions">
          <button
            type="button"
            className="ghost"
            disabled={localBusy || !noteDirty}
            onClick={onSaveNote}
          >
            Save defaults to config
          </button>
          {noteSavedAt && !noteDirty ? (
            <span className="muted tight">
              Saved {noteSavedAt.toLocaleTimeString()}
            </span>
          ) : noteDirty ? (
            <span className="muted tight">Unsaved changes</span>
          ) : null}
        </div>

        <label>
          Pages
          <input
            type="number"
            min="1"
            max="25"
            value={maxPages}
            onChange={(e) => {
              setMaxPages(e.target.value);
              setNoteDirty(true);
            }}
            disabled={localBusy}
          />
        </label>
        <label>
          Max invites
          <input
            type="number"
            min="1"
            max="100"
            value={maxInvites}
            onChange={(e) => {
              setMaxInvites(e.target.value);
              setNoteDirty(true);
            }}
            disabled={localBusy}
          />
        </label>
        <label>
          Delay (ms)
          <input
            type="number"
            min="800"
            max="30000"
            step="100"
            value={delayMs}
            onChange={(e) => {
              setDelayMs(e.target.value);
              setNoteDirty(true);
            }}
            disabled={localBusy}
          />
        </label>

        <div className="full row-actions">
          <button
            type="button"
            className="primary"
            disabled={localBusy || !companyFilter.trim()}
            onClick={onStart}
          >
            {job?.state === "running" ? "Running…" : "Start invites"}
          </button>
          {job?.state === "running" || job?.state === "starting" ? (
            <button type="button" onClick={onStop}>
              Stop after current
            </button>
          ) : null}
        </div>
      </div>

      {job ? (
        <div className="connect-job-status">
          <p className="muted">
            Job: {job.state}
            {job.current ? ` · ${job.current}` : ""}
            {job.message ? ` — ${job.message}` : ""}
            {` · invited ${job.invited || 0} · skipped ${job.skipped || 0} · failed ${job.failed || 0}`}
            {job.last_error ? ` · error: ${job.last_error}` : ""}
          </p>
          {recentInvites.length ? (
            <ul className="connect-invite-list">
              {recentInvites.map((inv, i) => (
                <li key={`${inv.name}-${i}`}>
                  <strong>{inv.status}</strong> {inv.name}
                  {inv.reason ? ` — ${inv.reason}` : ""}
                  {inv.headline ? (
                    <span className="muted"> · {inv.headline}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
