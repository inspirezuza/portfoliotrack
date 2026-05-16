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
  return new Intl.DateTimeFormat("en-GB", {
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
      return "Add a transaction to start the portfolio chart.";
    case "mixed-currency":
      return "Portfolio chart is paused for mixed open-position currencies.";
    case "missing-portfolio-history":
      return "Price history is incomplete for current holdings.";
    default:
      return "No portfolio chart data yet.";
  }
}

export function PortfolioChart({ currency, series, status }: PortfolioChartProps) {
  const hasSeries = series.length > 0;

  return (
    <article className="surface-card chart-card portfolio-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Portfolio value</p>
          <h2 className="section-title">Portfolio value history</h2>
        </div>
      </div>

      {hasSeries ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolioArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(10, 126, 101, 0.34)" />
                  <stop offset="100%" stopColor="rgba(10, 126, 101, 0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                stroke="var(--chart-axis)"
              />
              <YAxis
                tickFormatter={(value: number) => formatChartValue(value, currency)}
                tickLine={false}
                axisLine={false}
                width={88}
                stroke="var(--chart-axis)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(10, 126, 101, 0.2)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--tooltip-bg)",
                  boxShadow: "var(--tooltip-shadow)",
                  color: "var(--ink)"
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
          <strong>No chart data</strong>
          <p>{getUnavailableMessage(status)}</p>
        </div>
      )}
    </article>
  );
}
