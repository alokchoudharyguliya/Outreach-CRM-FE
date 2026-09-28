/**
 * Icon-only control with accessible name via title + aria-label.
 */
export default function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  className = "",
  type = "button",
  tone,
}) {
  const classes = ["icon-btn", tone || "", className].filter(Boolean).join(" ");
  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon />
    </button>
  );
}
