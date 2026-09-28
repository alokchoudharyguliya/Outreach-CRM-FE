import { useEffect, useState } from "react";
import { api } from "../api";
import { useActionFeedback, ToastStack } from "./ActionToast.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";
import Pagination from "./Pagination.jsx";
import {
  IconKey,
  IconPlus,
  IconSearch,
  IconTrash,
} from "./icons.jsx";

export default function UsersPanel({ setError }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const { flash, toasts, dismiss } = useActionFeedback();

  async function load() {
    try {
      const data = await api.listUsers({
        ...(appliedQ ? { q: appliedQ } : {}),
        page,
        page_size: pageSize,
      });
      setRows(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 0);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, appliedQ]);

  async function createUser(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser({
        email: form.email.trim(),
        password: form.password,
      });
      flash("User added (read-only access)");
      setCreating(false);
      setForm({ email: "", password: "" });
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    setBusy(true);
    try {
      await api.updateUser(row.id, { is_active: !row.is_active });
      flash(row.is_active ? "User deactivated" : "User activated");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (!resetUser) return;
    setBusy(true);
    try {
      await api.updateUser(resetUser.id, { password: newPassword });
      flash("Password updated");
      setResetUser(null);
      setNewPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteUser(pendingDelete.id);
      flash("User removed");
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <div className="row-between">
        <div>
          <h1>Permissions</h1>
          <p className="muted tight">
            Users listed here can sign in with read-only access. The superuser comes
            from <span className="mono">.env</span>.
          </p>
        </div>
        <button
          type="button"
          className="primary btn-with-icon"
          onClick={() => setCreating(true)}
          disabled={busy}
          title="Add a read-only user"
        >
          <IconPlus />
          Add user
        </button>
      </div>

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
            placeholder="email…"
          />
        </label>
        <button type="submit" className="btn-with-icon" title="Search users">
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

      {rows.length ? (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <div>
                <div className="mono">{r.email}</div>
                <div className="muted">
                  {r.is_active ? "Active · read-only" : "Inactive"} · added{" "}
                  {r.created_at?.slice(0, 10)}
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => toggleActive(r)}
                  disabled={busy}
                  title={r.is_active ? "Deactivate this user" : "Activate this user"}
                >
                  {r.is_active ? "Deactivate" : "Activate"}
                </button>
                <IconButton
                  icon={IconKey}
                  label="Reset password"
                  onClick={() => {
                    setResetUser(r);
                    setNewPassword("");
                  }}
                  disabled={busy}
                />
                <IconButton
                  icon={IconTrash}
                  label="Remove user"
                  tone="danger"
                  onClick={() => setPendingDelete(r)}
                  disabled={busy}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No users yet. Add someone to grant read-only login.</p>
      )}

      {creating ? (
        <Modal title="Add user" onClose={() => setCreating(false)}>
          <form className="form" onSubmit={createUser}>
            <label className="full">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label className="full">
              Temporary password
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={4}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy} title="Create user account">
              Create
            </button>
          </form>
        </Modal>
      ) : null}

      {resetUser ? (
        <Modal
          title={`Reset password · ${resetUser.email}`}
          onClose={() => setResetUser(null)}
        >
          <form className="form" onSubmit={savePassword}>
            <label className="full">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={4}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy} title="Save new password">
              Save password
            </button>
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove user?"
        message={`Remove login for ${pendingDelete?.email}? They will no longer be able to sign in.`}
        confirmLabel="Yes, remove"
        busyLabel="Removing…"
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
