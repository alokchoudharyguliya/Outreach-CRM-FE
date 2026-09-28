import { useEffect, useState } from "react";

let toastId = 0;

function ToastItem({ message, tone = "ok", onDone, duration = 1800 }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), duration - 250);
    const done = setTimeout(() => onDone?.(), duration);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [duration, onDone]);

  return (
    <div
      className={`action-toast ${tone} ${visible ? "show" : "hide"}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast-check" aria-hidden>
        ✓
      </span>
      <span>{message}</span>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          message={t.message}
          tone={t.tone}
          onDone={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
}

export function useActionFeedback() {
  const [toasts, setToasts] = useState([]);

  function flash(message, tone = "ok") {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
  }

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { flash, toasts, dismiss };
}
