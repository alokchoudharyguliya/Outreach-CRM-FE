import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EMAIL_STATUSES, EMAIL_VALIDITIES } from "../constants";
import { useActionFeedback, ToastStack } from "./ActionToast.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";
import Pagination from "./Pagination.jsx";
import CompanyLetterFilter from "./CompanyLetterFilter.jsx";
import VariantsButton from "./VariantsButton.jsx";
import DonutChart from "./charts/DonutChart.jsx";
import RankedBarChart from "./charts/RankedBarChart.jsx";
import { topNWithOther } from "./charts/chartTheme.js";
import {
  IconBan,
  IconCopy,
  IconEdit,
  IconSearch,
  IconSend,
  IconSkip,
  IconTrash,
  IconX,
} from "./icons.jsx";

export default function QueuePanel({
  busy,
  setBusy,
  setError,
  onChange,
  canWrite = false,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [company, setCompany] = useState("");
  const [companyFilterKey, setCompanyFilterKey] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    email: "",
    notes: "",
    status: "NEW",
    validity: "UNKNOWN",
  });
  const [pendingAction, setPendingAction] = useState(null);
  const [flashRowId, setFlashRowId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [sendJob, setSendJob] = useState(null);
  const [sendDryRun, setSendDryRun] = useState(true);
  const [sendLimit, setSendLimit] = useState("");
  const [sendAccountId, setSendAccountId] = useState("");
  const [sendTemplate, setSendTemplate] = useState("");
  const [sendAccounts, setSendAccounts] = useState([]);
  const [sendTemplates, setSendTemplates] = useState([]);
  const [pendingByCompany, setPendingByCompany] = useState([]);
  const [companyStat, setCompanyStat] = useState(null);
  const [chartsOpen, setChartsOpen] = useState(true);
  const { flash, toasts, dismiss } = useActionFeedback();

  const filterParams = useMemo(
    () => ({
      ...(company ? { company } : {}),
      ...(appliedQ.trim() ? { q: appliedQ.trim() } : {}),
      page,
      page_size: pageSize,
    }),
    [company, appliedQ, page, pageSize]
  );

  const loadSendStatus = useCallback(async () => {
    try {
      const status = await api.sendStatus();
      setSendJob(status);
    } catch {
      /* ignore soft poll errors */
    }
  }, []);

  const loadSendOptions = useCallback(async () => {
    try {
      const data = await api.sendConfig();
      const accounts = data.accounts || data.config?.accounts || [];
      const templates = data.templates || data.config?.templates || [];
      setSendAccounts(accounts);
      setSendTemplates(templates);
      setSendAccountId((prev) => {
        if (prev && accounts.some((a) => a.id === prev)) return prev;
        return data.defaultAccountId || accounts[0]?.id || "";
      });
      setSendTemplate((prev) => {
        if (prev && templates.includes(prev)) return prev;
        return data.defaultTemplate || templates[0] || "";
      });
    } catch {
      /* keep previous */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.pending(filterParams);
      setRows(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 0);
      if (data.page && data.page !== page) setPage(data.page);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [filterParams, page, setError]);

  const loadQueueCharts = useCallback(async () => {
    try {
      if (company) {
        const stats = await api.stats(company);
        setCompanyStat(stats?.[0] || null);
        setPendingByCompany([]);
      } else {
        const list = await api.pendingCompanies();
        setPendingByCompany(Array.isArray(list) ? list : []);
        setCompanyStat(null);
      }
    } catch {
      /* charts are non-blocking */
    }
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSendStatus();
    loadSendOptions();
  }, [loadSendStatus, loadSendOptions]);

  useEffect(() => {
    loadQueueCharts();
  }, [loadQueueCharts]);

  useEffect(() => {
    const running =
      sendJob?.state === "running" || sendJob?.state === "starting";
    if (!running) return undefined;
    const id = setInterval(() => {
      loadSendStatus();
      load();
      loadQueueCharts();
    }, 2000);
    return () => clearInterval(id);
  }, [sendJob?.state, loadSendStatus, load, loadQueueCharts]);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (rowIds.includes(id)) next.add(id);
      }
      return next;
    });
  }, [rowIds]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  async function refreshAll() {
    await Promise.all([
      load(),
      loadSendStatus(),
      loadSendOptions(),
      loadQueueCharts(),
    ]);
    await onChange?.();
  }

  const companyPie = useMemo(
    () =>
      topNWithOther(
        pendingByCompany.map((r) => ({
          name: r.company,
          value: r.pending,
        })),
        10
      ),
    [pendingByCompany]
  );

  const companyBar = useMemo(
    () =>
      topNWithOther(
        pendingByCompany.map((r) => ({
          name: r.company,
          value: r.pending,
        })),
        12
      ),
    [pendingByCompany]
  );

  const filteredCompanyPie = useMemo(() => {
    if (!companyStat) return [];
    return [
      { name: "pending", value: Number(companyStat.pending) || 0 },
      { name: "sent", value: Number(companyStat.sent) || 0 },
      { name: "skipped", value: Number(companyStat.skipped) || 0 },
    ].filter((r) => r.value > 0);
  }, [companyStat]);

  const filteredValidityPie = useMemo(() => {
    if (!companyStat) return [];
    return [
      { name: "valid", value: Number(companyStat.valid) || 0 },
      { name: "invalid", value: Number(companyStat.invalid) || 0 },
      { name: "unknown", value: Number(companyStat.unknown) || 0 },
    ].filter((r) => r.value > 0);
  }, [companyStat]);

  async function startSend(live) {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        dry_run: !live,
        company: company || null,
        account_id: sendAccountId || null,
        template: sendTemplate || null,
      };
      const lim = Number(sendLimit);
      if (lim > 0) body.limit = lim;
      const status = await api.sendStart(body);
      setSendJob(status);
      flash(live ? "Live send started" : "Dry-run send started");
      await onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopSend() {
    if (!canWrite) return;
    setBusy(true);
    try {
      const status = await api.sendStop();
      setSendJob(status);
      flash("Stop requested");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rowIds));
  }

  function pulseRow(id) {
    setFlashRowId(id);
    setTimeout(() => setFlashRowId(null), 700);
  }

  async function applyPatch(ids, patch, label) {
    setBusy(true);
    setError("");
    try {
      await Promise.all(ids.map((id) => api.updateStatus(id, patch)));
      if (ids.length === 1) pulseRow(ids[0]);
      flash(ids.length > 1 ? `${label} · ${ids.length}` : label);
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      await refreshAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setLifecycle(id, status, label) {
    if (status === "SKIPPED") {
      const row = rows.find((r) => r.id === id);
      askAction([row].filter(Boolean), { status }, label);
      return;
    }
    await applyPatch([id], { status }, label || `Marked ${status}`);
  }

  async function setValidity(id, validity, label) {
    if (validity === "INVALID") {
      const row = rows.find((r) => r.id === id);
      askAction([row].filter(Boolean), { validity }, label);
      return;
    }
    await applyPatch([id], { validity }, label || `Marked ${validity}`);
  }

  async function copyEmail(row) {
    try {
      await navigator.clipboard.writeText(row.email);
      setCopiedId(row.id);
      pulseRow(row.id);
      flash(`Copied ${row.email}`);
      setTimeout(() => setCopiedId(null), 1200);
    } catch (err) {
      setError(err.message || "Could not copy");
    }
  }

  async function copyAll() {
    setBusy(true);
    try {
      const data = await api.copyPending({
        ...(company ? { company } : {}),
        ...(appliedQ.trim() ? { q: appliedQ.trim() } : {}),
      });
      await navigator.clipboard.writeText(data.text || "");
      flash(
        data.count
          ? `Copied ${data.count} pending${
              company || appliedQ.trim() ? " (filtered)" : ""
            }`
          : "Nothing to copy"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function domainFor(row) {
    if (row.email && row.email.includes("@")) return row.email.split("@")[1];
    return "";
  }

  function askAction(targetRows, patch, label) {
    if (!targetRows.length) return;
    const key = patch.validity || patch.status || "UPDATE";
    const titles = {
      INVALID: "Mark as invalid?",
      SKIPPED: "Skip these emails?",
      DELETE: "Are you sure?",
    };
    const verbs = {
      INVALID: "mark as invalid",
      SKIPPED: "skip",
      DELETE: "delete",
    };
    const n = targetRows.length;
    const sample =
      n === 1
        ? `${targetRows[0].email} (${targetRows[0].person_name})`
        : `${n} selected emails`;
    setPendingAction({
      type: key === "DELETE" ? "delete" : "patch",
      patch,
      rows: targetRows,
      title: titles[key] || "Are you sure?",
      message: `Are you sure you want to ${verbs[key] || "update"} ${sample}?`,
      confirmLabel:
        key === "DELETE"
          ? "Yes, delete"
          : key === "SKIPPED"
            ? "Yes, skip"
            : key === "INVALID"
              ? "Yes, mark invalid"
              : "Yes, continue",
      confirmTone: key === "DELETE" ? "danger" : "primary",
      label: label || `Updated ${key}`,
    });
  }

  function askDelete(row) {
    setPendingAction({
      type: "delete",
      rows: [row],
      title: "Are you sure?",
      message: `Are you sure you want to delete ${row.email} (${row.person_name})?`,
      confirmLabel: "Yes, delete",
      confirmTone: "danger",
      label: "Deleted",
    });
  }

  function askBulkDelete() {
    if (!selectedRows.length) return;
    const n = selectedRows.length;
    const sample =
      n === 1
        ? `${selectedRows[0].email} (${selectedRows[0].person_name})`
        : `${n} selected emails`;
    setPendingAction({
      type: "delete",
      rows: selectedRows,
      title: "Are you sure?",
      message: `Are you sure you want to delete ${sample}?`,
      confirmLabel: "Yes, delete",
      confirmTone: "danger",
      label: "Deleted",
    });
  }

  function askBulkPatch(patch, label) {
    if (!selectedRows.length) return;
    askAction(selectedRows, patch, label);
  }

  async function confirmPending() {
    if (!pendingAction?.rows?.length) return;
    const ids = pendingAction.rows.map((r) => r.id);
    if (pendingAction.type === "delete") {
      setBusy(true);
      try {
        await Promise.all(ids.map((id) => api.deleteEmail(id)));
        flash(`Deleted ${ids.length} email${ids.length === 1 ? "" : "s"}`);
        setPendingAction(null);
        setSelected(new Set());
        await refreshAll();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    const patch = pendingAction.patch;
    setPendingAction(null);
    await applyPatch(ids, patch, pendingAction.label);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      email: row.email || "",
      notes: row.notes || "",
      status: row.status || "NEW",
      validity: row.validity || "UNKNOWN",
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.updateEmail(editing.id, {
        email: form.email.trim(),
        notes: form.notes,
        status: form.status,
        validity: form.validity,
      });
      flash("Saved changes");
      pulseRow(editing.id);
      setEditing(null);
      await refreshAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filterActive = !!(company || appliedQ.trim());

  return (
    <section className="panel queue-panel">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <div className="row-between queue-header">
        <div>
          <h1>Queue &amp; Send</h1>
          <p className="muted tight">
            {total} ready to send
            {filterActive ? " (filtered)" : ""}
            {pages > 1 ? ` · page ${page}/${pages}` : ""}
            {!company && pendingByCompany.length
              ? ` · ${pendingByCompany.length} companies`
              : ""}
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setChartsOpen((v) => !v)}
            title={chartsOpen ? "Hide charts" : "Show charts"}
          >
            {chartsOpen ? "Hide charts" : "Show charts"}
          </button>
          <button
            type="button"
            className="btn-with-icon"
            onClick={copyAll}
            disabled={busy || !rows.length}
            title={
              filterActive
                ? "Copy all filtered pending emails"
                : "Copy all pending emails"
            }
          >
            <IconCopy />
            Copy {filterActive ? "filtered" : "all"}
          </button>
        </div>
      </div>

      {chartsOpen ? (
        <div className="queue-charts">
          {company ? (
            <div className="chart-grid chart-grid-2">
              <DonutChart
                title={company}
                subtitle="Status mix for this company"
                data={filteredCompanyPie}
                emptyLabel="No email stats for this company"
              />
              <DonutChart
                title="Validity"
                subtitle="Valid · invalid · unknown"
                data={filteredValidityPie}
                emptyLabel="No validity data"
              />
            </div>
          ) : (
            <div className="chart-grid chart-grid-2">
              <DonutChart
                title="Pending by company"
                subtitle="Share of ready-to-send emails"
                data={companyPie}
                emptyLabel="Queue is empty"
              />
              <RankedBarChart
                title="Companies in queue"
                subtitle="Top pending counts"
                data={companyBar}
                valueLabel="Pending"
                emptyLabel="Queue is empty"
              />
            </div>
          )}
        </div>
      ) : null}

      {canWrite ? (
        <div className="send-bar">
          <div className="send-bar-meta">
            <strong>Gmail send</strong>
            <span className="status">{sendJob?.state || "idle"}</span>
            {sendJob?.account_id ? (
              <span className="muted">acct {sendJob.account_id}</span>
            ) : null}
            {sendJob?.template ? (
              <span className="muted truncate" title={sendJob.template}>
                tmpl {sendJob.template}
              </span>
            ) : null}
            {sendJob?.profile_ready === false ? (
              <span className="muted">Profile not ready — Settings → Open login</span>
            ) : null}
            {sendJob?.current ? (
              <span className="mono muted">{sendJob.current}</span>
            ) : null}
            {(sendJob?.state === "running" || sendJob?.state === "starting") && (
              <span className="muted">
                sent {sendJob.sent || 0} · failed {sendJob.failed || 0} · left{" "}
                {sendJob.remaining || 0}
              </span>
            )}
          </div>
          <label className="send-select">
            Account
            <select
              value={sendAccountId}
              onChange={(e) => setSendAccountId(e.target.value)}
              disabled={
                busy ||
                sendJob?.state === "running" ||
                sendJob?.state === "starting"
              }
            >
              {sendAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.profile_ready ? "" : " (login needed)"}
                </option>
              ))}
            </select>
          </label>
          <label className="send-select">
            Template
            <select
              value={sendTemplate}
              onChange={(e) => setSendTemplate(e.target.value)}
              disabled={
                busy ||
                sendJob?.state === "running" ||
                sendJob?.state === "starting"
              }
            >
              {sendTemplates.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="send-limit">
            Limit
            <input
              type="number"
              min="1"
              placeholder="all"
              value={sendLimit}
              onChange={(e) => setSendLimit(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={sendDryRun}
              onChange={(e) => setSendDryRun(e.target.checked)}
              disabled={busy}
            />
            Dry run
          </label>
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              sendJob?.state === "running" ||
              sendJob?.state === "starting" ||
              !total ||
              !sendAccountId ||
              !sendTemplate
            }
            onClick={() => startSend(!sendDryRun)}
            title={
              company
                ? `Start send for ${company} queue only`
                : "Start send for full pending queue"
            }
          >
            {sendDryRun ? "Start dry run" : "Start live send"}
          </button>
          <button
            type="button"
            className="danger"
            disabled={
              busy ||
              !(sendJob?.state === "running" || sendJob?.state === "starting")
            }
            onClick={stopSend}
          >
            Stop
          </button>
        </div>
      ) : null}

      {(sendJob?.log_tail || []).length ? (
        <pre className="send-log">{(sendJob.log_tail || []).slice(-12).join("\n")}</pre>
      ) : null}

      <form
        className="form compact"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedQ(q.trim());
        }}
      >
        <label>
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="any characters: name, company, email…"
          />
        </label>
        <CompanyLetterFilter
          key={companyFilterKey}
          value={company}
          onChange={setCompany}
          source="pending"
          anyLabel="Any company"
          onPageReset={() => setPage(1)}
        />
        <button type="submit" className="btn-with-icon" title="Search pending emails">
          <IconSearch />
          Search
        </button>
        {filterActive || q.trim() ? (
          <IconButton
            icon={IconX}
            label="Clear filters"
            className="ghost"
            onClick={() => {
              setQ("");
              setAppliedQ("");
              setCompany("");
              setPage(1);
              setCompanyFilterKey((k) => k + 1);
            }}
          />
        ) : null}
      </form>

      <Pagination
        page={page}
        pages={pages}
        total={total}
        pageSize={pageSize}
        disabled={busy}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {canWrite && selected.size > 0 ? (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <button
            type="button"
            className="primary btn-with-icon"
            title="Mark selected emails as sent"
            onClick={() =>
              applyPatch(
                selectedRows.map((r) => r.id),
                { status: "SENT" },
                `Marked sent · ${selectedRows.length}`
              )
            }
            disabled={busy}
          >
            <IconSend />
            Mark sent
          </button>
          <button
            type="button"
            className="btn-with-icon"
            title="Mark selected emails as invalid"
            onClick={() =>
              askBulkPatch({ validity: "INVALID" }, "Marked invalid")
            }
            disabled={busy}
          >
            <IconBan />
            Invalid
          </button>
          <button
            type="button"
            className="btn-with-icon"
            title="Skip selected emails"
            onClick={() => askBulkPatch({ status: "SKIPPED" }, "Skipped")}
            disabled={busy}
          >
            <IconSkip />
            Skip
          </button>
          <button
            type="button"
            className="danger btn-with-icon"
            title="Delete selected emails"
            onClick={askBulkDelete}
            disabled={busy}
          >
            <IconTrash />
            Delete
          </button>
          <IconButton
            icon={IconX}
            label="Clear selection"
            className="ghost"
            onClick={() => setSelected(new Set())}
            disabled={busy}
          />
        </div>
      ) : null}

      {!rows.length ? (
        <p className="muted">
          {filterActive
            ? "No pending emails match these filters."
            : "No pending emails. Generate some from LinkedIn paste."}
        </p>
      ) : (
        <div className={`queue-table${canWrite ? "" : " readonly"}`} role="table">
          <div className="queue-head" role="row">
            {canWrite ? (
              <label className="check-cell" role="columnheader">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </label>
            ) : null}
            <div className="queue-copy-head" role="presentation">
              <span role="columnheader">Person</span>
              <span role="columnheader">Email · click to copy</span>
            </div>
            {canWrite ? (
              <span role="columnheader" className="actions-head">
                Actions
              </span>
            ) : null}
          </div>

          <ul className="queue-body">
            {rows.map((r) => {
              const isChecked = selected.has(r.id);
              const justCopied = copiedId === r.id;
              return (
                <li
                  key={r.id}
                  className={[
                    "queue-row",
                    isChecked ? "checked" : "",
                    flashRowId === r.id ? "flash" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="row"
                >
                  {canWrite ? (
                    <label
                      className="check-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.email}`}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className={[
                      "queue-copy-target",
                      justCopied ? "copied" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => copyEmail(r)}
                    title={
                      justCopied
                        ? `Copied ${r.email}`
                        : `Click to copy ${r.email}`
                    }
                  >
                    <div className="queue-person">
                      <div className="strong">{r.person_name}</div>
                      <div className="muted">{r.company}</div>
                    </div>
                    <div className="queue-email">
                      <span className="mono">{r.email}</span>
                      {r.email_format ? (
                        <span className="muted tight">{r.email_format}</span>
                      ) : null}
                      {justCopied ? (
                        <span className="copied-hint">Copied</span>
                      ) : null}
                    </div>
                  </button>
                  {canWrite ? (
                    <div
                      className="row-actions queue-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconButton
                        icon={IconSend}
                        label="Mark sent"
                        tone="primary"
                        onClick={() =>
                          setLifecycle(r.id, "SENT", "Marked sent")
                        }
                        disabled={busy}
                      />
                      <VariantsButton
                        name={r.person_name}
                        domain={domainFor(r)}
                        company={r.company}
                        personId={r.person_id}
                        busy={busy}
                        setBusy={setBusy}
                        setError={setError}
                        onDone={refreshAll}
                      />
                      <IconButton
                        icon={IconEdit}
                        label="Edit"
                        onClick={() => openEdit(r)}
                        disabled={busy}
                      />
                      <IconButton
                        icon={IconBan}
                        label="Mark invalid"
                        onClick={() =>
                          setValidity(r.id, "INVALID", "Marked invalid")
                        }
                        disabled={busy}
                      />
                      <IconButton
                        icon={IconSkip}
                        label="Skip"
                        onClick={() => setLifecycle(r.id, "SKIPPED", "Skipped")}
                        disabled={busy}
                      />
                      <IconButton
                        icon={IconTrash}
                        label="Delete"
                        tone="danger"
                        onClick={() => askDelete(r)}
                        disabled={busy}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {total > 0 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          disabled={busy}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.email}`} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={saveEdit}>
            <label className="full">
              Email
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {EMAIL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Validity
              <select
                value={form.validity}
                onChange={(e) => setForm({ ...form, validity: e.target.value })}
              >
                {EMAIL_VALIDITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </label>
            <button type="submit" disabled={busy} title="Save email changes">
              Save
            </button>
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!pendingAction}
        title={pendingAction?.title || "Are you sure?"}
        message={pendingAction?.message || ""}
        confirmLabel={pendingAction?.confirmLabel || "Yes, continue"}
        confirmTone={pendingAction?.confirmTone || "primary"}
        busyLabel={pendingAction?.type === "delete" ? "Deleting…" : "Updating…"}
        busy={busy}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPending}
      />
    </section>
  );
}
