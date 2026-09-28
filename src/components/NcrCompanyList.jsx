import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const PANEL_OPEN_KEY = "mp.ncrFabOpen";
const CITY_OPEN_KEY = "mp.ncrCityOpen";

/**
 * Global floating NCR company list: FAB on every screen.
 * City sections expand/collapse independently; names load only when expanded.
 * Checkboxes + Mark verified for selected companies.
 */
export default function NcrCompanyList() {
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return sessionStorage.getItem(PANEL_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [verifying, setVerifying] = useState(false);
  /** @type {Record<string, boolean>} */
  const [expanded, setExpanded] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CITY_OPEN_KEY) || "{}") || {};
    } catch {
      return {};
    }
  });
  /** @type {Record<string, Array<{id:number,name:string,verified?:string}>>} */
  const [companiesByCity, setCompaniesByCity] = useState({});
  /** @type {Record<string, boolean>} */
  const [loadingCity, setLoadingCity] = useState({});
  /** @type {Set<number>} */
  const [selected, setSelected] = useState(() => new Set());

  const selectedCount = selected.size;

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setError("");
    try {
      const data = await api.listNcrCompanyNames();
      setGroups(data.groups || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load NCR summary");
      setGroups([]);
      setTotal(0);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadCityNames = useCallback(async (cityKey) => {
    setLoadingCity((m) => ({ ...m, [cityKey]: true }));
    setError("");
    try {
      const data = await api.listNcrCompanyNames({ city: cityKey });
      const group = (data.groups || []).find((g) => g.key === cityKey);
      const companies =
        group?.companies ||
        (group?.names || []).map((name, i) => ({
          id: -(i + 1),
          name,
          verified: null,
        }));
      setCompaniesByCity((m) => ({
        ...m,
        [cityKey]: companies,
      }));
      if (group && typeof group.count === "number") {
        setGroups((prev) =>
          prev.map((g) =>
            g.key === cityKey ? { ...g, count: group.count } : g
          )
        );
      }
    } catch (err) {
      setError(err.message || `Failed to load ${cityKey}`);
    } finally {
      setLoadingCity((m) => ({ ...m, [cityKey]: false }));
    }
  }, []);

  function persistExpanded(next) {
    setExpanded(next);
    try {
      sessionStorage.setItem(CITY_OPEN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function togglePanel() {
    setPanelOpen((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(PANEL_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleCity(cityKey) {
    const willOpen = !expanded[cityKey];
    const next = { ...expanded, [cityKey]: willOpen };
    persistExpanded(next);
    if (willOpen && companiesByCity[cityKey] == null) {
      loadCityNames(cityKey);
    }
  }

  function toggleSelect(id) {
    if (!id || id < 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllInCity(cityKey) {
    const list = companiesByCity[cityKey] || [];
    const ids = list.map((c) => c.id).filter((id) => id > 0);
    if (!ids.length) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function copyCompanyName(c) {
    const text = (c?.name || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopiedId(c.id);
    setFlash(`Copied “${text}”`);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === c.id ? null : cur));
    }, 1500);
  }

  async function markSelectedVerified() {
    const ids = [...selected].filter((id) => id > 0);
    if (!ids.length) {
      setError("Select at least one company");
      return;
    }
    setVerifying(true);
    setError("");
    setFlash("");
    try {
      const res = await api.bulkUpdateCompanies({
        company_ids: ids,
        verified: "TRUE",
      });
      const updated = res.updated ?? ids.length;
      setFlash(`Marked ${updated} compan${updated === 1 ? "y" : "ies"} verified`);
      // Reflect locally
      setCompaniesByCity((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = (next[key] || []).map((c) =>
            selected.has(c.id) ? { ...c, verified: "TRUE" } : c
          );
        }
        return next;
      });
      clearSelection();
    } catch (err) {
      setError(err.message || "Failed to mark verified");
    } finally {
      setVerifying(false);
    }
  }

  function refreshAll() {
    setCompaniesByCity({});
    clearSelection();
    loadSummary().then(() => {
      Object.entries(expanded)
        .filter(([, on]) => on)
        .forEach(([key]) => loadCityNames(key));
    });
  }

  const citySelectState = useMemo(() => {
    /** @type {Record<string, {all:boolean, some:boolean}>} */
    const map = {};
    for (const [key, list] of Object.entries(companiesByCity)) {
      const ids = (list || []).map((c) => c.id).filter((id) => id > 0);
      const on = ids.filter((id) => selected.has(id)).length;
      map[key] = {
        all: ids.length > 0 && on === ids.length,
        some: on > 0 && on < ids.length,
      };
    }
    return map;
  }, [companiesByCity, selected]);

  return (
    <div className="ncr-fab-root">
      {panelOpen ? (
        <aside className="ncr-fab-panel" aria-label="NCR company names">
          <div className="ncr-fab-panel-header">
            <div>
              <strong className="ncr-fab-panel-title">NCR companies</strong>
              <span className="pill soft" style={{ marginLeft: "0.4rem" }}>
                {total}
              </span>
            </div>
            <div className="ncr-fab-panel-actions">
              <button
                type="button"
                className="ghost"
                onClick={refreshAll}
                disabled={summaryLoading}
                title="Refresh counts and open cities"
              >
                Refresh
              </button>
              <button
                type="button"
                className="ghost"
                onClick={togglePanel}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="muted ncr-fab-hint">
            Expand a city · check companies · Mark verified
          </p>
          <div className="ncr-fab-verify-bar">
            <button
              type="button"
              className="primary"
              disabled={!selectedCount || verifying}
              onClick={markSelectedVerified}
              title="Set verified=TRUE on selected companies"
            >
              {verifying
                ? "Saving…"
                : `Mark verified${selectedCount ? ` (${selectedCount})` : ""}`}
            </button>
            {selectedCount ? (
              <button
                type="button"
                className="ghost"
                onClick={clearSelection}
                disabled={verifying}
              >
                Clear
              </button>
            ) : null}
          </div>
          {flash ? <p className="ncr-fab-flash">{flash}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {summaryLoading && !groups.length ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="ncr-city-accordion">
              {groups.map((g) => {
                const isOpen = !!expanded[g.key];
                const companies = companiesByCity[g.key];
                const cityLoading = !!loadingCity[g.key];
                const sel = citySelectState[g.key] || { all: false, some: false };
                return (
                  <div
                    key={g.key}
                    className={`ncr-city-section${isOpen ? " open" : ""}`}
                  >
                    <button
                      type="button"
                      className="ncr-city-section-head"
                      onClick={() => toggleCity(g.key)}
                      aria-expanded={isOpen}
                    >
                      <span className="ncr-city-chevron" aria-hidden="true">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="ncr-city-label">{g.label}</span>
                      <span className="pill soft">{g.count ?? 0}</span>
                    </button>
                    {isOpen ? (
                      <div className="ncr-city-section-body">
                        {cityLoading && companies == null ? (
                          <p className="muted ncr-city-empty">Loading names…</p>
                        ) : companies && companies.length ? (
                          <>
                            <label className="ncr-select-all">
                              <input
                                type="checkbox"
                                checked={sel.all}
                                ref={(el) => {
                                  if (el) el.indeterminate = sel.some;
                                }}
                                onChange={() => toggleSelectAllInCity(g.key)}
                              />
                              <span>Select all in {g.label}</span>
                            </label>
                            <ul className="ncr-name-list">
                              {companies.map((c) => {
                                const checked = selected.has(c.id);
                                const isVerified =
                                  String(c.verified || "").toUpperCase() ===
                                  "TRUE";
                                const justCopied = copiedId === c.id;
                                return (
                                  <li
                                    key={`${g.key}-${c.id}`}
                                    className={`ncr-name-item${
                                      isVerified ? " verified" : ""
                                    }${justCopied ? " copied" : ""}`}
                                  >
                                    <label className="ncr-name-row">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!c.id || c.id < 0}
                                        onChange={() => toggleSelect(c.id)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <button
                                        type="button"
                                        className="ncr-name-copy"
                                        title={`Copy “${c.name}”`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          copyCompanyName(c);
                                        }}
                                      >
                                        <span className="ncr-name-text">
                                          {c.name}
                                        </span>
                                        <span
                                          className="ncr-copy-icon"
                                          aria-hidden="true"
                                        >
                                          {justCopied ? "✓" : "⧉"}
                                        </span>
                                      </button>
                                      {isVerified ? (
                                        <span className="ncr-verified-tag">
                                          verified
                                        </span>
                                      ) : null}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        ) : (
                          <p className="muted ncr-city-empty">
                            No companies tagged yet
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      ) : null}

      <button
        type="button"
        className={`ncr-fab-button${panelOpen ? " active" : ""}`}
        onClick={togglePanel}
        title={panelOpen ? "Close NCR companies" : "Open NCR companies"}
        aria-expanded={panelOpen}
      >
        <span className="ncr-fab-label">NCR</span>
        {total > 0 ? <span className="ncr-fab-badge">{total}</span> : null}
      </button>
    </div>
  );
}
