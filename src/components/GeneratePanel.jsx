import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { fetchOutreachCompanies } from "../companyLoaders.js";
import CompanyPicker, { resolveCompanySelection } from "./CompanyPicker.jsx";
import Pagination from "./Pagination.jsx";
import { EMAIL_FORMATS, NEW_COMPANY } from "../constants";

const POOL_TIERS = ["S++", "S+", "S", "A+", "A", "B+", "B", "C", "Unranked"];

const DEFAULT_POOL_FILTERS = {
  tier: "",
  india: "yes",
  indian_city: "",
  verified: "",
  q: "",
};

export default function GeneratePanel({
  busy,
  setBusy,
  setError,
  onDone,
  onCompanyTotalChange,
}) {
  const [companies, setCompanies] = useState([]);
  const [companyMode, setCompanyMode] = useState("existing"); // existing | new
  const [poolFilters, setPoolFilters] = useState(DEFAULT_POOL_FILTERS);
  const [poolApplied, setPoolApplied] = useState(DEFAULT_POOL_FILTERS);
  const [poolRows, setPoolRows] = useState([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [poolPages, setPoolPages] = useState(0);
  const [poolPage, setPoolPage] = useState(1);
  const [poolPageSize, setPoolPageSize] = useState(25);
  const [poolLoading, setPoolLoading] = useState(false);
  const [text, setText] = useState("");
  const [companyValue, setCompanyValue] = useState("");
  const [newName, setNewName] = useState("");
  const [domain, setDomain] = useState("");
  const [emailFormat, setEmailFormat] = useState("firstname.lastname");
  const [searchKeywords, setSearchKeywords] = useState("");
  const [companyKeyword, setCompanyKeyword] = useState("");
  const [maxPages, setMaxPages] = useState("3");
  const [batchCount, setBatchCount] = useState("3");
  const [batchJob, setBatchJob] = useState(null);
  const [batchResolve, setBatchResolve] = useState(false);
  const [selectedPoolIds, setSelectedPoolIds] = useState(() => new Set());
  const [defaultKeywords, setDefaultKeywords] = useState("software engineer");
  const [formatNote, setFormatNote] = useState("");
  const [fetchMeta, setFetchMeta] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedPool, setSelectedPool] = useState(null);
  const [genJob, setGenJob] = useState(null);

  const batchBusy = ["running", "starting"].includes(batchJob?.state);
  const genBusy =
    busy ||
    batchBusy ||
    ["starting", "running"].includes(genJob?.state) ||
    genJob?.busy === true;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getConnectNote();
        if (cancelled) return;
        const g = res.generate || {};
        const ef = res.emailFormat || {};
        setMaxPages(String(g.maxPages ?? 3));
        setBatchCount(String(g.batchCount ?? 3));
        setDefaultKeywords(String(g.keywords || "software engineer"));
        setSearchKeywords((prev) => prev || String(g.keywords || ""));
        setBatchResolve(Boolean(g.resolveFormat));
        setEmailFormat(String(ef.default || "firstname.lastname"));
        if (g.indiaPresence) {
          setPoolFilters((f) => ({ ...f, india: g.indiaPresence }));
          setPoolApplied((f) => ({ ...f, india: g.indiaPresence }));
        }
      } catch {
        /* keep local defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCompanies = useCallback(async () => {
    const list = await fetchOutreachCompanies();
    setCompanies(list);
    await onCompanyTotalChange?.();
    return list;
  }, [onCompanyTotalChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await api.generateJobStatus();
        if (cancelled) return;
        if (
          st &&
          (st.busy ||
            ["starting", "running", "completed", "failed"].includes(st.state))
        ) {
          setGenJob(st);
          if (st.busy) setBusy(true);
        }
      } catch {
        /* ignore */
      }
      try {
        const bst = await api.poolBatchStatus();
        if (cancelled) return;
        if (bst && bst.state && bst.state !== "idle") {
          setBatchJob(bst);
          if (["running", "starting"].includes(bst.state)) setBusy(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setBusy]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const existingCompanies = useMemo(() => {
    const list = companies || [];
    const withWork = list.filter(
      (c) =>
        ["GENERATED", "OUTREACH", "DONE"].includes(
          String(c.outreach_status || "").toUpperCase(),
        ) || (c.email_count || 0) > 0,
    );
    if (withWork.length) return withWork;
    return list.filter(
      (c) =>
        String(c.outreach_status || "").toUpperCase() !== "POOL" || c.domain,
    );
  }, [companies]);

  const loadPool = useCallback(
    async (overrides = {}) => {
      const filters = { ...poolApplied, ...overrides.filters };
      const page = overrides.page ?? poolPage;
      const pageSize = overrides.pageSize ?? poolPageSize;
      setPoolLoading(true);
      try {
        const res = await api.listCompanies({
          q: filters.q.trim() || undefined,
          page,
          page_size: pageSize,
          include_counts: false,
          outreach_status: "POOL,READY",
          exclude_paused: true,
          sort: "tier",
          tier: filters.tier || undefined,
          india_presence: filters.india || undefined,
          indian_city: filters.indian_city || undefined,
          verified: filters.verified || undefined,
        });
        setPoolRows(res.items || []);
        setPoolTotal(res.total || 0);
        setPoolPages(res.pages || 0);
        return res;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setPoolLoading(false);
      }
    },
    [poolApplied, poolPage, poolPageSize, setError],
  );

  useEffect(() => {
    if (companyMode !== "new") return;
    loadPool();
  }, [companyMode, poolApplied, poolPage, poolPageSize, loadPool]);

  // Poll pool batch job while running
  useEffect(() => {
    if (!batchJob || !["running", "starting"].includes(batchJob.state)) {
      return undefined;
    }
    const id = setInterval(async () => {
      try {
        const st = await api.poolBatchStatus();
        setBatchJob(st);
        if (!["running", "starting"].includes(st.state)) {
          clearInterval(id);
          setBusy(false);
          if (st.state === "completed" || st.state === "stopped") {
            setSelectedPoolIds(new Set());
          }
          await loadCompanies();
          await loadPool();
          onDone?.();
        }
      } catch (err) {
        setError(err.message);
      }
    }, 800);
    return () => clearInterval(id);
  }, [batchJob, loadPool, loadCompanies, onDone, setBusy, setError]);

  const selectedPoolCount = selectedPoolIds.size;
  const selectedOnPage = useMemo(
    () => poolRows.filter((c) => selectedPoolIds.has(c.id)).length,
    [poolRows, selectedPoolIds],
  );

  function togglePoolId(id) {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 25) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function selectAllOnPage() {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      for (const c of poolRows) {
        if (next.size >= 25) break;
        next.add(c.id);
      }
      return next;
    });
  }

  function clearPoolSelection() {
    setSelectedPoolIds(new Set());
  }

  async function startPoolBatch({ mode }) {
    // Fallback only; per-company LinkedIn keywords use the company name.
    const kw =
      searchKeywords.trim() ||
      companyKeyword.trim() ||
      defaultKeywords ||
      "company";
    if (!kw) {
      setError("Enter a fallback company keyword");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const filters = { ...poolFilters };
      setPoolApplied(filters);
      const base = {
        keywords: kw,
        max_pages: Math.max(1, Math.min(Number(maxPages) || 3, 25)),
        require_domain: !batchResolve,
        resolve_format: batchResolve,
      };
      let st;
      if (mode === "selected") {
        const ids = [...selectedPoolIds];
        if (!ids.length) {
          setError("Select at least one company in the table (checkboxes)");
          setBusy(false);
          return;
        }
        st = await api.startPoolBatch({
          ...base,
          company_ids: ids,
        });
      } else {
        st = await api.startPoolBatch({
          ...base,
          count: Math.max(1, Math.min(Number(batchCount) || 3, 25)),
          tier: filters.tier || undefined,
          india_presence: filters.india || undefined,
          indian_city: filters.indian_city || undefined,
          verified: filters.verified || undefined,
          q: filters.q.trim() || undefined,
        });
      }
      setBatchJob(st);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function lookupEmailFormat() {
    if (!selectedPool) return;
    setBusy(true);
    setError("");
    setFormatNote(
      `Searching RocketReach for ${selectedPool.name}… ` +
        `(if Cloudflare appears, click Verify in the Chrome window)`,
    );
    try {
      // Explicit click → let the lookup replace whatever is there now
      const res = await api.resolveCompanyFormat(selectedPool.id, {
        overwrite: true,
      });
      if (res.domain) setDomain(res.domain);
      if (res.email_format) setEmailFormat(res.email_format);
      if (res.ok) {
        const pct = res.confidence ? ` · ${res.confidence}%` : "";
        setFormatNote(
          `${res.email_format || "pattern not recognised"}${pct}` +
            `${res.domain ? ` · ${res.domain}` : ""}` +
            `${res.source ? ` · via ${res.source}` : ""}` +
            `${res.warning ? ` · ${res.warning}` : ""}`,
        );
        setSelectedPool((prev) =>
          prev
            ? {
                ...prev,
                domain: res.domain || prev.domain,
                email_format: res.email_format || prev.email_format,
              }
            : prev,
        );
        await loadPool();
      } else {
        setFormatNote(res.error || "No email format found");
      }
    } catch (err) {
      setError(err.message);
      setFormatNote("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (companyMode !== "existing") return;
    if (!existingCompanies?.length || companyValue) return;
    const preferred =
      existingCompanies.find((c) => c.domain) || existingCompanies[0];
    if (preferred) {
      setCompanyValue(preferred.name);
      setDomain(preferred.domain || "");
      setEmailFormat(preferred.email_format || "firstname.lastname");
      setCompanyKeyword(preferred.matched_as || preferred.name || "");
    }
  }, [existingCompanies, companyValue, companyMode]);

  async function stopPoolBatch() {
    try {
      const st = await api.stopPoolBatch();
      setBatchJob(st);
    } catch (err) {
      setError(err.message);
    }
  }

  function switchMode(mode) {
    setCompanyMode(mode);
    setCompanyValue("");
    setNewName("");
    setSelectedPool(null);
    setSelectedPoolIds(new Set());
    setDomain("");
    setEmailFormat("firstname.lastname");
    setCompanyKeyword("");
    setResult(null);
    if (mode === "new") {
      setPoolFilters(DEFAULT_POOL_FILTERS);
      setPoolApplied(DEFAULT_POOL_FILTERS);
      setPoolPage(1);
    }
  }

  function applyPoolFilters(e) {
    e?.preventDefault?.();
    setPoolPage(1);
    setPoolApplied({ ...poolFilters });
  }

  function onCompanyChange(next) {
    if (next.mode === "new") {
      setCompanyValue(NEW_COMPANY);
      setNewName(next.name || "");
      setSelectedPool(null);
      setDomain(next.domain || "");
      setEmailFormat(next.email_format || "firstname.lastname");
      if (next.name) setCompanyKeyword(next.name);
      return;
    }
    if (next.mode === "") {
      setCompanyValue("");
      setNewName("");
      setSelectedPool(null);
      setDomain("");
      setEmailFormat("firstname.lastname");
      return;
    }
    setCompanyValue(next.name);
    setNewName("");
    setSelectedPool(next.company || null);
    setDomain(next.domain || "");
    setEmailFormat(next.email_format || "firstname.lastname");
    setCompanyKeyword(next.company?.matched_as || next.name || "");
  }

  function onPickPool(c) {
    setSelectedPool(c);
    setCompanyValue(c.name);
    setNewName("");
    setDomain(c.domain || "");
    setEmailFormat(c.email_format || "firstname.lastname");
    const ck = c.matched_as || c.name || "";
    setCompanyKeyword(ck);
    // Main LinkedIn search box: company name (not roles like SDE)
    if (ck) setSearchKeywords(ck);
  }

  async function pickNextCompany() {
    setBusy(true);
    setError("");
    try {
      // Walk pages until we find the next row after the current selection
      let page = 1;
      let foundCurrent = !selectedPool;
      let next = null;
      let pages = 1;
      let landPage = 1;
      while (page <= pages && !next) {
        const res = await api.listCompanies({
          q: poolApplied.q.trim() || undefined,
          page,
          page_size: poolPageSize,
          include_counts: false,
          outreach_status: "POOL,READY",
          exclude_paused: true,
          sort: "tier",
          tier: poolApplied.tier || undefined,
          india_presence: poolApplied.india || undefined,
          indian_city: poolApplied.indian_city || undefined,
          verified: poolApplied.verified || undefined,
        });
        pages = res.pages || 0;
        const items = res.items || [];
        for (const c of items) {
          if (!foundCurrent) {
            if (c.id === selectedPool.id) foundCurrent = true;
            continue;
          }
          next = c;
          landPage = page;
          break;
        }
        page += 1;
      }
      if (!next) {
        // wrap to first
        const res = await api.listCompanies({
          q: poolApplied.q.trim() || undefined,
          page: 1,
          page_size: 1,
          include_counts: false,
          outreach_status: "POOL,READY",
          exclude_paused: true,
          sort: "tier",
          tier: poolApplied.tier || undefined,
          india_presence: poolApplied.india || undefined,
          indian_city: poolApplied.indian_city || undefined,
          verified: poolApplied.verified || undefined,
        });
        next = (res.items || [])[0] || null;
        landPage = 1;
      }
      if (!next) {
        setError("No new companies match the current filters");
        return;
      }
      setPoolPage(landPage);
      onPickPool(next);
      await loadPool({ page: landPage });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureCompanySaved() {
    if (companyMode === "new" && selectedPool) {
      if (!domain.trim()) {
        throw new Error("Domain is required to generate emails for a new company");
      }
      await api.updateCompany(selectedPool.id, {
        domain: domain.trim(),
        email_format: emailFormat,
      });
      await loadCompanies();
      return {
        name: selectedPool.name,
        domain: domain.trim(),
        email_format: emailFormat,
        isNew: false,
      };
    }

    const company = resolveCompanySelection({
      value: companyValue,
      newName,
      domain,
      emailFormat,
    });
    if (!company.domain) {
      throw new Error("Domain is required to generate emails");
    }
    if (company.isNew) {
      await api.createCompany({
        name: company.name,
        domain: company.domain,
        email_format: company.email_format,
      });
      await loadCompanies();
    } else if (company.domain || company.email_format) {
      const existing = companies.find((c) => c.name === company.name);
      if (existing) {
        await api.updateCompany(existing.id, {
          domain: company.domain || null,
          email_format: company.email_format,
        });
        await loadCompanies();
      }
    }
    return company;
  }

  async function onFetchLinkedIn() {
    const ck = companyKeyword.trim() || companyValue.trim() || newName.trim();
    const kw = searchKeywords.trim() || ck;
    if (!kw) {
      setError("Enter a company name for the main LinkedIn search box");
      return;
    }
    if (!ck) {
      setError("Enter a company keyword for the Current company filter");
      return;
    }
    setBusy(true);
    setError("");
    setFetchMeta(null);
    try {
      const pages = Math.max(1, Math.min(Number(maxPages) || 10, 25));
      const data = await api.linkedinSearch({
        keywords: kw,
        company: ck,
        max_pages: pages,
      });
      setText(data.text || "");
      setFetchMeta({
        cardCount: data.cardCount,
        pagesFetched: data.pagesFetched,
        url: data.url,
        keywords: data.keywords,
        company: data.company,
        chars: (data.text || "").length,
      });
      if (!searchKeywords.trim()) setSearchKeywords(kw);
      if (!companyKeyword.trim()) setCompanyKeyword(ck);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPoolAfterGenerate() {
    setSelectedPool(null);
    setCompanyValue("");
    setDomain("");
    const res = await loadPool({ page: poolPage });
    return res;
  }

  useEffect(() => {
    if (!genJob || !["starting", "running"].includes(genJob.state)) {
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await api.generateJobStatus();
        if (cancelled) return;
        setGenJob(st);
        if (["completed", "failed"].includes(st.state) || !st.busy) {
          setBusy(false);
          if (st.state === "completed" && st.result) {
            setResult(st.result);
            if (st.result.text) setText(st.result.text);
            if (st.result.linkedin) {
              setFetchMeta({
                cardCount: st.result.linkedin.cardCount,
                pagesFetched: st.result.linkedin.pagesFetched,
                url: st.result.linkedin.url,
                keywords: st.result.linkedin.keywords,
                company: st.result.linkedin.company_filter,
                chars: (st.result.text || "").length,
              });
            }
            setCompanyValue(st.company || "");
            try {
              await loadCompanies();
              if (companyMode === "new") await refreshPoolAfterGenerate();
              onDone();
            } catch {
              /* non-fatal */
            }
          }
          if (st.state === "failed" && st.last_error) {
            setError(st.last_error);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    const id = setInterval(tick, 700);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // refreshPoolAfterGenerate closes over poolPage/loadPool — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genJob?.state, companyMode, loadCompanies, onDone, setBusy, setError]);

  async function onFetchAndGenerate() {
    const ck = companyKeyword.trim() || companyValue.trim() || newName.trim();
    const kw = searchKeywords.trim() || ck;
    if (!kw) {
      setError("Enter a company name for the main LinkedIn search box");
      return;
    }
    if (!ck) {
      setError("Enter a company keyword for the Current company filter");
      return;
    }
    if (companyMode === "new" && !selectedPool) {
      setError("Select a company from the pool list first");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setFetchMeta(null);
    try {
      const company = await ensureCompanySaved();
      const pages = Math.max(1, Math.min(Number(maxPages) || 10, 25));
      const st = await api.startGenerateFromLinkedIn({
        keywords: kw,
        company_filter: ck,
        company: company.name,
        domain: company.domain,
        email_format: company.email_format,
        max_pages: pages,
      });
      setGenJob(st);
      setCompanyValue(company.name);
      setNewName("");
      if (!searchKeywords.trim()) setSearchKeywords(kw);
      if (!companyKeyword.trim()) setCompanyKeyword(ck);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onGenerate(e) {
    e.preventDefault();
    if (companyMode === "new" && !selectedPool) {
      setError("Select a company from the pool list first");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const company = await ensureCompanySaved();
      const st = await api.startGenerate({
        text,
        company: company.name,
        domain: company.domain,
        email_format: company.email_format,
      });
      setGenJob(st);
      setCompanyValue(company.name);
      setNewName("");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const phaseLabel = {
    idle: "Idle",
    starting: "Starting",
    queued: "Queued",
    format_lookup: "Format lookup",
    scrape: "LinkedIn scrape",
    scrape_done: "Scrape done",
    llm_extract: "LLM extract",
    llm_repair: "LLM repair",
    format: "Build emails",
    persist: "DB insert",
    sync: "Sync status",
    done: "Done",
    failed: "Failed",
    skipped: "Skipped",
    stopped: "Stopped",
  };

  const genPct =
    genJob?.total > 0
      ? Math.min(100, Math.round((100 * (genJob.current || 0)) / genJob.total))
      : null;

  return (
    <section className="panel">
      <h1>Generate emails</h1>
      <p className="muted">
        Single company: Edit one row (or pick Existing), then Fetch & Generate.
        Batch: check several New-company pool rows and Run batch on selected —
        one Chrome scrapes them in order, then emails are saved (unique by
        address).
      </p>

      {genJob && genJob.state !== "idle" ? (
        <div className={`generate-progress ${genJob.state}`}>
          <div className="row-between">
            <strong>
              {phaseLabel[genJob.phase] || genJob.phase || genJob.state}
              {genJob.provider
                ? ` · ${genJob.provider}:${genJob.model || "?"}`
                : ""}
            </strong>
            <span className="mono muted">
              {((genJob.elapsed_ms || 0) / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="muted" style={{ margin: "0.35rem 0" }}>
            {genJob.message || genJob.phase_detail || "Working…"}
          </p>
          {genPct != null ? (
            <div className="generate-progress-bar" aria-hidden>
              <div style={{ width: `${genPct}%` }} />
            </div>
          ) : null}
          <div className="generate-progress-meta mono muted">
            {genJob.mode ? `${genJob.mode} · ` : ""}
            {genJob.current || 0}
            {genJob.total ? ` / ${genJob.total}` : ""}
            {genJob.names_found != null
              ? ` · names ${genJob.names_found}`
              : ""}
            {genJob.emails_built != null
              ? ` · emails ${genJob.emails_built}`
              : ""}
            {genJob.created != null ? ` · new ${genJob.created}` : ""}
            {genJob.duplicates != null ? ` · dup ${genJob.duplicates}` : ""}
            {genJob.text_chars ? ` · ${genJob.text_chars} chars` : ""}
          </div>
          {genJob.timings_ms && Object.keys(genJob.timings_ms).length ? (
            <div className="generate-timings mono muted">
              {Object.entries(genJob.timings_ms).map(([k, ms]) => (
                <span key={k}>
                  {phaseLabel[k] || k} {(ms / 1000).toFixed(1)}s
                </span>
              ))}
            </div>
          ) : null}
          {genJob.log?.length ? (
            <pre className="generate-log mono">
              {genJob.log.slice(-12).join("\n")}
            </pre>
          ) : null}
          {genJob.last_error ? (
            <p className="error-text">{genJob.last_error}</p>
          ) : null}
        </div>
      ) : null}

      <div className="row-actions full" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className={companyMode === "existing" ? "primary" : ""}
          disabled={genBusy}
          onClick={() => switchMode("existing")}
        >
          Existing companies
        </button>
        <button
          type="button"
          className={companyMode === "new" ? "primary" : ""}
          disabled={genBusy}
          onClick={() => switchMode("new")}
        >
          New companies
          {companyMode === "new" && poolTotal
            ? ` (${poolTotal.toLocaleString()})`
            : ""}
        </button>
      </div>

      <form className="form" onSubmit={onGenerate}>
        {companyMode === "existing" ? (
          <div className="full">
            <CompanyPicker
              companies={existingCompanies}
              value={companyValue}
              newName={newName}
              domain={domain}
              emailFormat={emailFormat}
              requireDomain
              onChange={onCompanyChange}
            />
          </div>
        ) : (
          <div className="full pool-browse">
            <div className="form compact pool-filters">
              <label>
                Tier
                <select
                  value={poolFilters.tier}
                  onChange={(e) =>
                    setPoolFilters((f) => ({ ...f, tier: e.target.value }))
                  }
                  disabled={genBusy}
                >
                  <option value="">Any tier</option>
                  <option value="S++,S+,S">S / S+ / S++</option>
                  <option value="A+,A">A+ / A</option>
                  <option value="S++,S+,S,A+,A">S + A tiers</option>
                  <option value="B+,B">B+ / B</option>
                  {POOL_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t} only
                    </option>
                  ))}
                </select>
              </label>
              <label>
                India
                <select
                  value={poolFilters.india}
                  onChange={(e) =>
                    setPoolFilters((f) => ({ ...f, india: e.target.value }))
                  }
                  disabled={busy}
                >
                  <option value="">Any</option>
                  <option value="yes">YES</option>
                  <option value="no">NO</option>
                  <option value="unknown">UNKNOWN / empty</option>
                  <option value="not_yes">Not YES</option>
                </select>
              </label>
              <label>
                Indian city
                <input
                  list="pool-filter-indian-city"
                  value={poolFilters.indian_city}
                  onChange={(e) =>
                    setPoolFilters((f) => ({
                      ...f,
                      indian_city: e.target.value,
                    }))
                  }
                  placeholder="Noida, Gurugram…"
                  disabled={busy}
                />
                <datalist id="pool-filter-indian-city">
                  <option value="empty">Unset</option>
                  <option value="Noida" />
                  <option value="Greater Noida" />
                  <option value="Gurugram" />
                  <option value="Gurgaon" />
                  <option value="New Delhi" />
                  <option value="Delhi" />
                  <option value="Bengaluru" />
                  <option value="Hyderabad" />
                  <option value="Mumbai" />
                  <option value="Pune" />
                  <option value="Chennai" />
                  <option value="N/A" />
                </datalist>
              </label>
              <label>
                Verified
                <select
                  value={poolFilters.verified}
                  onChange={(e) =>
                    setPoolFilters((f) => ({ ...f, verified: e.target.value }))
                  }
                  disabled={busy}
                >
                  <option value="">Any</option>
                  <option value="TRUE">Verified</option>
                  <option value="FALSE">Not verified</option>
                </select>
              </label>
              <label>
                Name contains
                <input
                  value={poolFilters.q}
                  onChange={(e) =>
                    setPoolFilters((f) => ({ ...f, q: e.target.value }))
                  }
                  placeholder="optional"
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyPoolFilters();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy || poolLoading}
                onClick={applyPoolFilters}
              >
                Apply filters
              </button>
              <button
                type="button"
                disabled={busy || poolLoading || !poolTotal}
                onClick={pickNextCompany}
                title="Select the next company in the filtered list"
              >
                Next company
              </button>
            </div>

            <div className="pool-batch-bar">
              <div className="pool-batch-primary">
                <button
                  type="button"
                  className="primary"
                  disabled={genBusy || selectedPoolCount === 0}
                  onClick={() => startPoolBatch({ mode: "selected" })}
                  title="Scrape + generate only the checked companies (one Chrome)"
                >
                  {batchBusy
                    ? "Batch running…"
                    : `Run batch on selected (${selectedPoolCount})`}
                </button>
                <button
                  type="button"
                  disabled={genBusy || !poolRows.length}
                  onClick={selectAllOnPage}
                  title="Check all companies on this page (max 25 total)"
                >
                  Select page{selectedOnPage ? ` (${selectedOnPage})` : ""}
                </button>
                <button
                  type="button"
                  disabled={genBusy || selectedPoolCount === 0}
                  onClick={clearPoolSelection}
                >
                  Clear
                </button>
                {batchBusy ? (
                  <button type="button" onClick={stopPoolBatch}>
                    Stop after current
                  </button>
                ) : null}
              </div>
              <div className="pool-batch-secondary">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={batchResolve}
                    onChange={(e) => setBatchResolve(e.target.checked)}
                    disabled={genBusy}
                  />
                  Auto-fill missing domain / format
                </label>
                <label>
                  Auto next
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={batchCount}
                    onChange={(e) => setBatchCount(e.target.value)}
                    disabled={genBusy}
                  />
                </label>
                <button
                  type="button"
                  disabled={genBusy}
                  onClick={() => startPoolBatch({ mode: "auto" })}
                  title="Auto-pick next N from current filters (no checkboxes needed)"
                >
                  Run auto
                </button>
              </div>
            </div>
            {selectedPoolCount > 0 ? (
              <p className="muted tight">
                Selected {selectedPoolCount}/25 for batch
                {batchJob?.company_names?.length
                  ? ` · queued: ${batchJob.company_names.join(", ")}`
                  : ""}
              </p>
            ) : (
              <p className="muted tight">
                Check 2–4 (up to 25) companies below, then{" "}
                <strong>Run batch on selected</strong>. LinkedIn scrapes one
                company at a time; as each scrape finishes, LLM starts
                immediately (pipelined). Auto-fill only hits RocketReach for
                missing domains.
              </p>
            )}
            {batchJob && batchJob.state !== "idle" ? (
              <div className={`generate-progress batch ${batchJob.state}`}>
                <div className="row-between">
                  <strong>
                    Batch · {batchJob.state}
                    {batchJob.selection_mode
                      ? ` · ${batchJob.selection_mode}`
                      : ""}
                    {batchJob.generate_workers
                      ? ` · ${batchJob.generate_workers} LLM workers`
                      : ""}
                  </strong>
                  <span className="mono muted">
                    {batchJob.processed || 0}/{batchJob.count || "?"}
                  </span>
                </div>
                <p className="muted" style={{ margin: "0.35rem 0" }}>
                  {batchJob.message ||
                    (batchJob.current
                      ? `Working on ${batchJob.current}`
                      : "Working…")}
                </p>
                {batchJob.count > 0 ? (
                  <div className="generate-progress-bar" aria-hidden>
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (100 * (batchJob.processed || 0)) /
                              batchJob.count,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
                <div className="generate-progress-meta mono muted">
                  ok {batchJob.succeeded || 0}
                  {" · "}failed {batchJob.failed || 0}
                  {" · "}skipped {batchJob.skipped || 0}
                  {batchJob.created_emails
                    ? ` · new emails ${batchJob.created_emails}`
                    : ""}
                  {batchJob.formats_resolved
                    ? ` · formats ${batchJob.formats_resolved}`
                    : ""}
                </div>
                {batchJob.companies?.length ? (
                  <div className="batch-company-grid">
                    {batchJob.companies.map((c) => {
                      const pct =
                        c.total > 0
                          ? Math.min(
                              100,
                              Math.round((100 * (c.current || 0)) / c.total),
                            )
                          : null;
                      return (
                        <div
                          key={c.id}
                          className={`batch-company-card phase-${c.phase || "queued"}`}
                        >
                          <div className="row-between">
                            <strong className="batch-company-name">
                              {c.index ? `${c.index}. ` : ""}
                              {c.name}
                            </strong>
                            <span className="mono muted">
                              {((c.elapsed_ms || 0) / 1000).toFixed(1)}s
                            </span>
                          </div>
                          <div className="batch-company-phase">
                            {phaseLabel[c.phase] || c.phase || "—"}
                            {c.domain ? ` · ${c.domain}` : ""}
                          </div>
                          <p className="muted tight">{c.message || "…"}</p>
                          {pct != null ? (
                            <div className="generate-progress-bar" aria-hidden>
                              <div style={{ width: `${pct}%` }} />
                            </div>
                          ) : null}
                          <div className="generate-progress-meta mono muted">
                            {c.people ? `${c.people} people` : ""}
                            {c.pages_fetched
                              ? ` · ${c.pages_fetched}p`
                              : ""}
                            {c.emails_built != null && c.phase !== "queued"
                              ? ` · emails ${c.emails_built}`
                              : ""}
                            {c.created ? ` · new ${c.created}` : ""}
                            {c.duplicates ? ` · dup ${c.duplicates}` : ""}
                          </div>
                          {c.timings_ms &&
                          Object.keys(c.timings_ms).length ? (
                            <div className="generate-timings mono muted">
                              {Object.entries(c.timings_ms).map(([k, ms]) => (
                                <span key={k}>
                                  {phaseLabel[k] || k} {(ms / 1000).toFixed(1)}
                                  s
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {c.log?.length ? (
                            <pre className="generate-log mono batch-company-log">
                              {c.log.slice(-8).join("\n")}
                            </pre>
                          ) : null}
                          {c.error ? (
                            <p className="error-text">{c.error}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : batchJob.results?.length ? (
                  <ul className="batch-result-list mono">
                    {batchJob.results.slice(-12).map((r, i) => (
                      <li key={`${r.company_id || r.company}-${i}`}>
                        {r.generate_ok
                          ? `✓ ${r.company}: +${r.created || 0} new`
                          : `✗ ${r.company}: ${r.error || "failed"}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {batchJob.last_error ? (
                  <p className="error-text">{batchJob.last_error}</p>
                ) : null}
              </div>
            ) : null}

            <Pagination
              page={poolPage}
              pages={poolPages}
              total={poolTotal}
              pageSize={poolPageSize}
              disabled={busy || poolLoading}
              onPageChange={setPoolPage}
              onPageSizeChange={(size) => {
                setPoolPageSize(size);
                setPoolPage(1);
              }}
            />

            <div className="pool-table-wrap">
              <table className="pool-table">
                <thead>
                  <tr>
                    <th className="pool-check-col" title="Select for batch">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={
                          poolRows.length > 0 &&
                          selectedOnPage === poolRows.length
                        }
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedOnPage > 0 &&
                              selectedOnPage < poolRows.length;
                          }
                        }}
                        onChange={() => {
                          if (
                            poolRows.length > 0 &&
                            selectedOnPage === poolRows.length
                          ) {
                            setSelectedPoolIds((prev) => {
                              const next = new Set(prev);
                              for (const c of poolRows) next.delete(c.id);
                              return next;
                            });
                          } else {
                            selectAllOnPage();
                          }
                        }}
                        disabled={genBusy || poolLoading}
                      />
                    </th>
                    <th>Company</th>
                    <th>Tier</th>
                    <th>India</th>
                    <th>City</th>
                    <th>Verified</th>
                    <th>Country</th>
                    <th>Domain</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {poolLoading ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Loading…
                      </td>
                    </tr>
                  ) : poolRows.length ? (
                    poolRows.map((c) => {
                      const active = selectedPool?.id === c.id;
                      const checked = selectedPoolIds.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={
                            active
                              ? "selected"
                              : checked
                                ? "batch-checked"
                                : undefined
                          }
                        >
                          <td className="pool-check-col">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePoolId(c.id)}
                              disabled={genBusy}
                              aria-label={`Select ${c.name} for batch`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td onClick={() => onPickPool(c)}>
                            <div className="pool-name">{c.name}</div>
                            {c.roles_hired ? (
                              <div className="muted tight">{c.roles_hired}</div>
                            ) : null}
                          </td>
                          <td onClick={() => onPickPool(c)}>{c.tier || "—"}</td>
                          <td onClick={() => onPickPool(c)}>
                            {c.india_presence || "—"}
                          </td>
                          <td onClick={() => onPickPool(c)}>
                            {c.indian_city || "—"}
                          </td>
                          <td onClick={() => onPickPool(c)}>
                            {c.verified === "TRUE" ? "Yes" : c.verified || "—"}
                          </td>
                          <td onClick={() => onPickPool(c)}>
                            {c.country || "—"}
                          </td>
                          <td className="mono" onClick={() => onPickPool(c)}>
                            {c.domain || "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={active ? "primary" : ""}
                              onClick={(e) => {
                                e.stopPropagation();
                                onPickPool(c);
                              }}
                            >
                              {active ? "Editing" : "Edit"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="muted">
                        No companies match — loosen filters or import CSV in Settings
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedPool ? (
              <p className="muted tight">
                Editing: {selectedPool.name} ·{" "}
                {selectedPool.outreach_status || "POOL"}
                {selectedPool.matched_as
                  ? ` · LinkedIn as “${selectedPool.matched_as}”`
                  : ""}
                {selectedPool.focus ? ` · ${selectedPool.focus}` : ""}
                {" · "}use Edit for single Fetch & Generate; checkboxes for batch
              </p>
            ) : (
              <p className="muted tight">
                Check companies for batch, or Edit one to set domain and run
                single Fetch & Generate.
              </p>
            )}

            <div className="pool-selected-fields">
              <label>
                Domain
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="company.com"
                  required
                  disabled={busy || !selectedPool}
                />
              </label>
              <label>
                Email format
                <select
                  value={
                    EMAIL_FORMATS.includes(emailFormat)
                      ? emailFormat
                      : emailFormat || "firstname.lastname"
                  }
                  onChange={(e) => setEmailFormat(e.target.value)}
                  disabled={busy || !selectedPool}
                >
                  {!EMAIL_FORMATS.includes(emailFormat) && emailFormat ? (
                    <option value={emailFormat}>{emailFormat}</option>
                  ) : null}
                  {EMAIL_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pool-format-lookup">
                <button
                  type="button"
                  disabled={busy || !selectedPool}
                  onClick={lookupEmailFormat}
                  title="Search RocketReach for this company's email format and domain"
                >
                  Look up format
                </button>
                {formatNote ? (
                  <span className="muted tight">{formatNote}</span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <label>
          Main search box
          <input
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
            placeholder="Company name (e.g. Adobe) — not job titles"
            disabled={busy}
          />
        </label>
        <label>
          Company filter keyword
          <input
            value={companyKeyword}
            onChange={(e) => setCompanyKeyword(e.target.value)}
            placeholder="e.g. Adobe (Current company filter)"
            disabled={busy}
          />
        </label>
        <label>
          Pages to fetch
          <input
            type="number"
            min="1"
            max="25"
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="full row-actions">
          <button
            type="button"
            className="primary"
            disabled={
              genBusy || !domain.trim() || (companyMode === "new" && !selectedPool)
            }
            onClick={onFetchAndGenerate}
            title="Scrape LinkedIn, generate emails, and save (unique by email)"
          >
            {genBusy && genJob?.mode === "linkedin"
              ? `Working… ${phaseLabel[genJob.phase] || genJob.phase || ""}`
              : genBusy
                ? "Working…"
                : "Fetch & Generate"}
          </button>
          <button
            type="button"
            disabled={genBusy}
            onClick={onFetchLinkedIn}
            title="Only scrape LinkedIn into the text box (no LLM)"
          >
            Fetch only
          </button>
          {fetchMeta ? (
            <span className="muted">
              {fetchMeta.cardCount || 0} people · {fetchMeta.pagesFetched || "?"}{" "}
              page(s) · {fetchMeta.chars || 0} chars
            </span>
          ) : null}
        </div>

        <label className="full">
          LinkedIn results text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Use Fetch & Generate, Fetch only, or paste search results here…"
            required
          />
        </label>
        <button
          type="submit"
          disabled={
            genBusy ||
            !text.trim() ||
            (companyMode === "new" && !selectedPool)
          }
          title={
            genBusy
              ? `Generating… ${phaseLabel[genJob?.phase] || ""}`
              : "Generate emails from results text"
          }
        >
          {genBusy && genJob?.mode === "text"
            ? `Generating… ${phaseLabel[genJob.phase] || ""}`
            : genBusy
              ? "Generating…"
              : "Generate from text"}
        </button>
      </form>
      {result ? (
        <p className="muted">
          Created {result.created} · Already had email {result.duplicates} · Blocked{" "}
          {result.skipped_blocked}
          {result.linkedin?.peopleCount != null
            ? ` · LinkedIn ${result.linkedin.peopleCount} people`
            : ""}
          {genJob?.elapsed_ms
            ? ` · last run ${(genJob.elapsed_ms / 1000).toFixed(1)}s`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
