"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type {
  PortfolioBenchmarkTimelineStatus,
  PortfolioTimelinePoint
} from "@/lib/portfolio/timeline";

type PortfolioChartProps = {
  currency: string | null;
  series: PortfolioTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatChartValue(value: number, currency: string | null) {
  if (currency == null) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0
    }).format(value);
  }

  return formatCurrency(value, {
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2
  });
}

function getUnavailableMessage(status: PortfolioBenchmarkTimelineStatus) {
  switch (status) {
    case "no-transactions":
      return "Add a transaction to start building the portfolio value timeline.";
    case "mixed-currency":
      return "The portfolio currently spans multiple currencies, so a single value line would be misleading.";
    case "missing-portfolio-history":
      return "Historical prices are not available yet for one or more held symbols.";
    default:
      return "Portfolio timeline data is unavailable right now.";
  }
}

export function PortfolioChart({ currency, series, status }: PortfolioChartProps) {
  const hasSeries = series.length > 0;

  return (
    <article className="surface-card chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Portfolio chart</p>
          <h2 className="section-title">Value through time</h2>
        </div>
        <p className="surface-copy">
          {hasSeries
            ? "Server-side holdings math, visualized without re-deriving positions in the browser."
            : getUnavailableMessage(status)}
        </p>
      </div>

      {hasSeries ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(12, 122, 102, 0.34)" />
                  <stop offset="100%" stopColor="rgba(12, 122, 102, 0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(31, 28, 22, 0.08)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                stroke="rgba(110, 102, 93, 0.9)"
              />
              <YAxis
                tickFormatter={(value: number) => formatChartValue(value, currency)}
                tickLine={false}
                axisLine={false}
                width={88}
                stroke="rgba(110, 102, 93, 0.9)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(12, 122, 102, 0.18)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(31, 28, 22, 0.12)",
                  background: "rgba(255, 251, 244, 0.96)",
                  boxShadow: "0 24px 80px rgba(53, 40, 21, 0.12)"
                }}
                formatter={(value: number) => [formatChartValue(value, currency), "Portfolio value"]}
                labelFormatter={(value: string) => formatChartDate(value)}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#portfolioArea)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent-strong)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty-state">
          <p>{getUnavailableMessage(status)}</p>
        </div>
      )}
    </article>
  );
}
