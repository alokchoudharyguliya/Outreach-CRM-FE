/** Shared chart colors + data helpers — match Outreach Portal dark theme. */

export const CHART_COLORS = [
  "#2dd4bf", // accent
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#fbbf24", // warn
  "#fb7185", // danger
  "#4ade80", // success
  "#f472b6", // pink
  "#38bdf8", // sky
  "#c084fc", // purple
  "#94a3b8", // slate
];

export const STATUS_COLORS = {
  pending: "#2dd4bf",
  sent: "#4ade80",
  skipped: "#94a3b8",
  invalid: "#fb7185",
  valid: "#4ade80",
  unknown: "#fbbf24",
};

export const TOOLTIP_STYLE = {
  backgroundColor: "#1a2330",
  border: "1px solid #3d4f63",
  borderRadius: "0.5rem",
  color: "#e8eef4",
  fontSize: "0.8rem",
  padding: "0.45rem 0.65rem",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.55)",
};

/** Recharts applies these separately — contentStyle.color alone is not enough. */
export const TOOLTIP_LABEL_STYLE = {
  color: "#e8eef4",
  fontWeight: 600,
  marginBottom: 2,
};

export const TOOLTIP_ITEM_STYLE = {
  color: "#e8eef4",
};

export const AXIS_TICK = { fill: "#8b9aab", fontSize: 11 };

/**
 * Keep top `limit` slices by value; fold the rest into "Other".
 * @param {Array<{name: string, value: number}>} rows
 */
export function topNWithOther(rows, limit = 8) {
  const cleaned = (rows || [])
    .map((r) => ({
      name: String(r.name || "(unknown)"),
      value: Number(r.value) || 0,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (cleaned.length <= limit) return cleaned;
  const head = cleaned.slice(0, limit - 1);
  const rest = cleaned.slice(limit - 1);
  const other = rest.reduce((sum, r) => sum + r.value, 0);
  if (other > 0) head.push({ name: "Other", value: other });
  return head;
}

export function sumValues(rows) {
  return (rows || []).reduce((s, r) => s + (Number(r.value) || 0), 0);
}
