import IconButton from "./IconButton.jsx";
import { IconX } from "./icons.jsx";

export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose || undefined}
      role="presentation"
    >
      <div
        className={wide ? "modal wide" : "modal"}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="row-between">
          <h2>{title}</h2>
          {onClose ? (
            <IconButton icon={IconX} label="Close" className="ghost" onClick={onClose} />
          ) : (
            <span />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
