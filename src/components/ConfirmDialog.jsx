import Modal from "./Modal.jsx";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel = "Working…",
  confirmTone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <Modal title={title} onClose={busy ? undefined : onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="confirm-actions">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          title={cancelLabel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={confirmTone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={busy}
          title={busy ? busyLabel : confirmLabel}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
