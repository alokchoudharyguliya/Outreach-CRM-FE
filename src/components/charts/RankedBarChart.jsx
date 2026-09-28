import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, CHART_COLORS, TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from "./chartTheme.js";

/**
 * Horizontal bar chart for ranked counts (companies, senders, …).
 * @param {{ title?: string, subtitle?: string, data: Array<{name:string,value:number}>, height?: number, valueLabel?: string }} props
 */
export default function RankedBarChart({
  title,
  subtitle,
  data,
  height = 260,
  valueLabel = "Count",
  emptyLabel = "No data yet",
}) {
  const rows = (data || [])
    .map((d) => ({
      name: String(d.name || "(unknown)"),
      value: Number(d.value) || 0,
    }))
    .filter((d) => d.value > 0);

  // Truncate long company names for the axis
  const chartRows = rows.map((r) => ({
    ...r,
    short:
      r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
  }));

  const chartHeight = Math.max(height, 36 + chartRows.length * 28);

  return (
    <div className="chart-card">
      {(title || subtitle) && (
        <div className="chart-card-head">
          {title ? <h3 className="chart-card-title">{title}</h3> : null}
          {subtitle ? <p className="muted tight">{subtitle}</p> : null}
        </div>
      )}
      {!chartRows.length ? (
        <p className="muted chart-empty">{emptyLabel}</p>
      ) : (
        <div className="chart-body" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2a3544"
                horizontal={false}
              />
              <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="short"
                width={120}
                tick={AXIS_TICK}
                interval={0}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.name || ""
                }
                formatter={(value) => [value, valueLabel]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {chartRows.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
