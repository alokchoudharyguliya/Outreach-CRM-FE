import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import CompanyLetterFilter from "./CompanyLetterFilter.jsx";
import { EMAIL_FORMATS, EMAIL_STATUSES, EMAIL_VALIDITIES } from "../constants";
import { useSelection } from "../hooks/useSelection";
import { useActionFeedback, ToastStack } from "./ActionToast.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";
import Pagination from "./Pagination.jsx";
import VariantsButton from "./VariantsButton.jsx";
import DonutChart from "./charts/DonutChart.jsx";
import {
  IconBan,
  IconCheck,
  IconEdit,
  IconSearch,
  IconSend,
  IconSkip,
  IconTrash,
  IconX,
} from "./icons.jsx";

const emptyEmailForm = {
  email: "",
  status: "NEW",
  validity: "UNKNOWN",
  email_format: "",
  notes: "",
  person_id: "",
};

const CONFIRM_KEYS = new Set(["INVALID", "SKIPPED"]);

export default function HistoryPanel({ setError, onChanged, canWrite = false }) {
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState("");
  const [validity, setValidityFilter] = useState("");
  const [sentFrom, setSentFrom] = useState("");
  const [senderAccounts, setSenderAccounts] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState([]);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyEmailForm);
  const [pendingAction, setPendingAction] = useState(null);
  const { flash, toasts, dismiss } = useActionFeedback();
  const {
    selected,
    selectedItems,
    allSelected,
    someSelected,
    toggleOne,
    toggleAll,
    clear,
  } = useSelection(rows);

  async function search(e) {
    e?.preventDefault();
    try {
      const requests = [
        api.listEmails({
          company,
          status,
          validity,
          sent_from_account_id: sentFrom || undefined,
          q: appliedQ,
          page,
          page_size: pageSize,
        }),
        company
          ? api.stats(company)
          : Promise.resolve([]),
        canWrite
          ? api.listPeople(
              company
                ? { company, page: 1, page_size: 200 }
                : { page: 1, page_size: 100 }
            )
          : Promise.resolve({ items: [] }),
        canWrite ? api.sendConfig().catch(() => null) : Promise.resolve(null),
      ];
      const [list, companyStats, peopleList, sendCfg] = await Promise.all(requests);
      setRows(list.items || []);
      setTotal(list.total || 0);
      setPages(list.pages || 0);
      setStats(companyStats);
      setPeople(peopleList.items || []);
      if (sendCfg?.accounts) setSenderAccounts(sendCfg.accounts);
      clear();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, company, status, validity, sentFrom, appliedQ]);

  const peopleForEdit = useMemo(() => {
    if (!editing) return people;
    const current = people.find((p) => String(p.id) === String(form.person_id));
    const companyName = current?.company;
    if (!companyName) return people;
    const filtered = people.filter((p) => p.company === companyName);
    return filtered.length ? filtered : people;
  }, [people, editing, form.person_id]);

  function openEdit(row) {
    setEditing(row);
    setForm({
      email: row.email || "",
      status: row.status || "NEW",
      validity: row.validity || "UNKNOWN",
      email_format: row.email_format || "",
      notes: row.notes || "",
      person_id: String(row.person_id || ""),
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    if (!form.person_id) {
      setError("Select a person");
      return;
    }
    setBusy(true);
    try {
      await api.updateEmail(editing.id, {
        email: form.email.trim(),
        status: form.status,
        validity: form.validity,
        email_format: form.email_format,
        notes: form.notes,
        person_id: Number(form.person_id),
      });
      flash("Saved changes");
      setEditing(null);
      await search();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyPatch(targetRows, patch, label) {
    setBusy(true);
    try {
      await Promise.all(targetRows.map((r) => api.updateStatus(r.id, patch)));
      flash(label || "Updated");
      clear();
      setPendingAction(null);
      await search();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function askPatch(targetRows, patch) {
    if (!targetRows.length) return;
    const key = patch.validity || patch.status;
    if (!CONFIRM_KEYS.has(key)) {
      applyPatch(
        targetRows,
        patch,
        targetRows.length > 1
          ? `Marked ${key} · ${targetRows.length}`
          : `Marked ${key}`
      );
      return;
    }
    const n = targetRows.length;
    const sample =
      n === 1 ? targetRows[0].email : `${n} selected emails`;
    setPendingAction({
      type: "patch",
      rows: targetRows,
      patch,
      title:
        key === "INVALID"
          ? "Mark as invalid?"
          : key === "SKIPPED"
            ? "Skip emails?"
            : "Confirm?",
      message: `Are you sure you want to mark ${sample} as ${key}?`,
      confirmLabel:
        key === "SKIPPED"
          ? "Yes, skip"
          : key === "INVALID"
            ? "Yes, mark invalid"
            : "Yes, continue",
      confirmTone: "primary",
      label: n > 1 ? `Marked ${key} · ${n}` : `Marked ${key}`,
    });
  }

  function askDelete(targetRows) {
    if (!targetRows.length) return;
    const n = targetRows.length;
    const sample =
      n === 1
        ? `${targetRows[0].email} (${targetRows[0].person_name})`
        : `${n} selected emails`;
    setPendingAction({
      type: "delete",
      rows: targetRows,
      title: "Are you sure?",
      message: `Delete ${sample}? This cannot be undone.`,
      confirmLabel: "Yes, delete",
      confirmTone: "danger",
    });
  }

  async function confirmPending() {
    if (!pendingAction?.rows?.length) return;
    if (pendingAction.type === "delete") {
      setBusy(true);
      try {
        await Promise.all(pendingAction.rows.map((r) => api.deleteEmail(r.id)));
        flash(
          `Deleted ${pendingAction.rows.length} email${
            pendingAction.rows.length === 1 ? "" : "s"
          }`
        );
        setPendingAction(null);
        clear();
        await search();
        onChanged?.();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    await applyPatch(
      pendingAction.rows,
      pendingAction.patch,
      pendingAction.label
    );
  }

  function domainFor(row) {
    if (row.email?.includes("@")) return row.email.split("@")[1];
    return "";
  }

  return (
    <section className="panel">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <h1>History</h1>
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
          value={company}
          onChange={setCompany}
          source="all"
          hasEmails
          anyLabel="Any"
          onPageReset={() => setPage(1)}
        />
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any</option>
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
            value={validity}
            onChange={(e) => {
              setValidityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any</option>
            {EMAIL_VALIDITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sent from
          <select
            value={sentFrom}
            onChange={(e) => {
              setSentFrom(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any account</option>
            {senderAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.emailHint ? ` (${a.emailHint})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-with-icon" title="Search emails">
          <IconSearch />
          Search
        </button>
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

      {stats.length ? (
        <>
          <div className="chart-grid chart-grid-2">
            <DonutChart
              title={stats[0]?.company || "Company"}
              subtitle="Status mix"
              data={[
                { name: "pending", value: Number(stats[0]?.pending) || 0 },
                { name: "sent", value: Number(stats[0]?.sent) || 0 },
                { name: "skipped", value: Number(stats[0]?.skipped) || 0 },
              ]}
            />
            <DonutChart
              title="Validity"
              subtitle="Valid · invalid · unknown"
              data={[
                { name: "valid", value: Number(stats[0]?.valid) || 0 },
                { name: "invalid", value: Number(stats[0]?.invalid) || 0 },
                { name: "unknown", value: Number(stats[0]?.unknown) || 0 },
              ]}
            />
          </div>
          <div className="stats">
            {stats.slice(0, 8).map((s) => (
              <div key={s.company} className="stat">
                <strong>{s.company}</strong>
                <span>
                  {s.total || 0} total · {s.sent || 0} sent · {s.invalid || 0}{" "}
                  invalid · {s.valid || 0} valid · {s.unknown || 0} unknown ·{" "}
                  {s.pending || 0} pending · {s.skipped || 0} skipped
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {canWrite && selected.size > 0 ? (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <button
            type="button"
            className="primary btn-with-icon"
            title="Mark selected emails as sent"
            onClick={() => askPatch(selectedItems, { status: "SENT" })}
            disabled={busy}
          >
            <IconSend />
            Mark sent
          </button>
          <button
            type="button"
            className="btn-with-icon"
            title="Mark selected emails as valid"
            onClick={() => askPatch(selectedItems, { validity: "VALID" })}
            disabled={busy}
          >
            <IconCheck />
            Valid
          </button>
          <button
            type="button"
            className="btn-with-icon"
            title="Mark selected emails as invalid"
            onClick={() => askPatch(selectedItems, { validity: "INVALID" })}
            disabled={busy}
          >
            <IconBan />
            Invalid
          </button>
          <button
            type="button"
            className="btn-with-icon"
            title="Skip selected emails"
            onClick={() => askPatch(selectedItems, { status: "SKIPPED" })}
            disabled={busy}
          >
            <IconSkip />
            Skip
          </button>
          <button
            type="button"
            title="Move selected emails back to queue (NEW)"
            onClick={() => askPatch(selectedItems, { status: "NEW" })}
            disabled={busy}
          >
            Requeue
          </button>
          <button
            type="button"
            className="danger btn-with-icon"
            title="Delete selected emails"
            onClick={() => askDelete(selectedItems)}
            disabled={busy}
          >
            <IconTrash />
            Delete
          </button>
          <IconButton
            icon={IconX}
            label="Clear selection"
            className="ghost"
            onClick={clear}
            disabled={busy}
          />
        </div>
      ) : null}

      {rows.length ? (
        <div className="select-list">
          <div className={`select-list-head history-head${canWrite ? "" : " readonly"}`}>
            {canWrite ? (
              <label className="check-cell">
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
            ) : (
              <span />
            )}
            <span>Person</span>
            <span>Email</span>
            <span>Sent from</span>
            <span>Status</span>
            <span>Validity</span>
            <span>Actions</span>
          </div>
          <ul className="list select-body">
            {rows.map((r) => {
              const checked = selected.has(r.id);
              const sentFromLabel =
                r.sent_from_email ||
                r.sent_from_label ||
                r.sent_from_account_id ||
                "—";
              return (
                <li
                  key={r.id}
                  className={
                    checked
                      ? "item selectable checked history-row"
                      : "item selectable history-row"
                  }
                >
                  {canWrite ? (
                    <label className="check-cell">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.email}`}
                      />
                    </label>
                  ) : (
                    <span />
                  )}
                  <div>
                    <div>{r.person_name}</div>
                    <div className="muted">{r.company}</div>
                    {r.notes ? <div className="muted notes">{r.notes}</div> : null}
                  </div>
                  <span className="mono">{r.email}</span>
                  <div title={r.sent_from_account_id || ""}>
                    <div className="mono">{sentFromLabel}</div>
                    {r.sent_from_label && r.sent_from_email ? (
                      <div className="muted tight">{r.sent_from_label}</div>
                    ) : null}
                  </div>
                  {canWrite ? (
                    <label className="inline-status">
                      <select
                        value={r.status}
                        disabled={busy}
                        title="Change lifecycle status"
                        onChange={(e) =>
                          askPatch([r], { status: e.target.value })
                        }
                      >
                        {EMAIL_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="status">{r.status}</span>
                  )}
                  {canWrite ? (
                    <label className="inline-status">
                      <select
                        value={r.validity || "UNKNOWN"}
                        disabled={busy}
                        title="Change validity"
                        onChange={(e) =>
                          askPatch([r], { validity: e.target.value })
                        }
                      >
                        {EMAIL_VALIDITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="status">{r.validity || "UNKNOWN"}</span>
                  )}
                  <div className="row-actions">
                    {canWrite ? (
                      <>
                        <VariantsButton
                          name={r.person_name}
                          domain={domainFor(r)}
                          company={r.company}
                          personId={r.person_id}
                          emailId={r.id}
                          busy={busy}
                          setBusy={setBusy}
                          setError={setError}
                          onDone={() => {
                            search();
                            onChanged?.();
                          }}
                        />
                        <IconButton
                          icon={IconEdit}
                          label="Edit"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                        />
                        <IconButton
                          icon={IconTrash}
                          label="Delete"
                          tone="danger"
                          onClick={() => askDelete([r])}
                          disabled={busy}
                        />
                      </>
                    ) : (
                      <span className="muted">view only</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="muted">No emails match these filters.</p>
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
        <Modal title={`Edit email #${editing.id}`} onClose={() => setEditing(null)}>
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
            <label>
              Person
              <select
                value={form.person_id}
                onChange={(e) => setForm({ ...form, person_id: e.target.value })}
                required
              >
                <option value="" disabled>
                  Select person…
                </option>
                {peopleForEdit.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.company})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                value={form.email_format || ""}
                onChange={(e) => setForm({ ...form, email_format: e.target.value })}
              >
                <option value="">—</option>
                {EMAIL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Notes
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
