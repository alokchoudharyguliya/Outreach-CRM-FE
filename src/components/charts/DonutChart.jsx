import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  CHART_COLORS,
  STATUS_COLORS,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  sumValues,
} from "./chartTheme.js";

function colorFor(name, index) {
  const key = String(name || "").toLowerCase();
  if (STATUS_COLORS[key]) return STATUS_COLORS[key];
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Donut / pie for categorical counts.
 * @param {{ title?: string, subtitle?: string, data: Array<{name:string,value:number}>, height?: number, innerRadius?: number }} props
 */
export default function DonutChart({
  title,
  subtitle,
  data,
  height = 220,
  innerRadius = 52,
  emptyLabel = "No data yet",
}) {
  const rows = (data || []).filter((d) => (Number(d.value) || 0) > 0);
  const total = sumValues(rows);

  return (
    <div className="chart-card">
      {(title || subtitle) && (
        <div className="chart-card-head">
          {title ? <h3 className="chart-card-title">{title}</h3> : null}
          {subtitle ? <p className="muted tight">{subtitle}</p> : null}
        </div>
      )}
      {!rows.length ? (
        <p className="muted chart-empty">{emptyLabel}</p>
      ) : (
        <div className="chart-body" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="46%"
                innerRadius={innerRadius}
                outerRadius={Math.min(88, height / 2 - 18)}
                paddingAngle={rows.length > 1 ? 2 : 0}
                stroke="#151c26"
                strokeWidth={2}
              >
                {rows.map((entry, i) => (
                  <Cell key={entry.name} fill={colorFor(entry.name, i)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(value, name) => {
                  const pct =
                    total > 0
                      ? ` (${Math.round((Number(value) / total) * 100)}%)`
                      : "";
                  return [`${value}${pct}`, name];
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: "0.75rem", color: "#8b9aab" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-center-label" aria-hidden>
            <strong>{total}</strong>
            <span>total</span>
          </div>
        </div>
      )}
    </div>
  );
}
