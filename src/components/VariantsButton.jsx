import { useState } from "react";
import { api } from "../api";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";
import { IconLayers } from "./icons.jsx";

/**
 * Generate / save local email variants (no LLM) from a person + domain.
 */
export default function VariantsButton({
  name,
  domain,
  company,
  personId,
  emailId,
  busy,
  setBusy,
  setError,
  onDone,
  label = "Variants",
  iconOnly = true,
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);

  async function run(save) {
    setBusy(true);
    setError("");
    try {
      const data = await api.variants({
        name,
        domain,
        company,
        person_id: personId || undefined,
        email_id: emailId || undefined,
        save,
      });
      setRows(data.candidates || []);
      setSummary({
        created: data.created,
        existing: data.existing,
        skipped_blocked: data.skipped_blocked,
      });
      setOpen(true);
      if (save) onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {iconOnly ? (
        <IconButton
          icon={IconLayers}
          label={label}
          onClick={() => run(true)}
          disabled={busy}
        />
      ) : (
        <button
          type="button"
          className="btn-with-icon"
          onClick={() => run(true)}
          disabled={busy}
          title={label}
        >
          <IconLayers />
          {label}
        </button>
      )}
      {open ? (
        <Modal title={`Variants for ${name || "person"}`} wide onClose={() => setOpen(false)}>
          {summary ? (
            <p className="muted">
              New {summary.created} · Already known {summary.existing} · Blocked{" "}
              {summary.skipped_blocked}
            </p>
          ) : null}
          <ul className="list">
            {rows.map((r) => (
              <li key={`${r.email}-${r.email_format}`} className="item">
                <span className="mono">{r.email}</span>
                <span className="muted">{r.email_format}</span>
                <span className="status">
                  {r.is_new ? "NEW" : r.status}
                  {r.validity && r.validity !== "UNKNOWN" ? ` · ${r.validity}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="confirm-actions">
            <button type="button" onClick={() => setOpen(false)} title="Close variants">
              Close
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => run(true)}
              disabled={busy}
              title="Regenerate email variants and save"
            >
              Regenerate & save
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
