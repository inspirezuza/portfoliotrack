"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatPercentRatio } from "@/lib/format";
import type {
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimelineStatus
} from "@/lib/portfolio/timeline";

type BenchmarkChartProps = {
  benchmarkSymbol: string | null;
  portfolioCurrency: string | null;
  series: BenchmarkTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatIndexedReturn(value: number) {
  return formatPercentRatio(value / 100 - 1, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });
}

function getUnavailableMessage({
  benchmarkSymbol,
  portfolioCurrency,
  status
}: {
  benchmarkSymbol: string | null;
  portfolioCurrency: string | null;
  status: PortfolioBenchmarkTimelineStatus;
}) {
  switch (status) {
    case "no-transactions":
      return "Add a transaction to start the benchmark chart.";
    case "mixed-currency":
      return "Benchmark comparison is disabled for mixed open-position currencies.";
    case "missing-portfolio-history":
      return "Price history is incomplete for current holdings.";
    case "benchmark-currency-mismatch":
      return benchmarkSymbol == null || portfolioCurrency == null
        ? "The benchmark currency does not match the portfolio currency."
        : `${benchmarkSymbol} is not quoted in ${portfolioCurrency}.`;
    case "missing-benchmark-history":
      return benchmarkSymbol == null
        ? "Set a benchmark to enable comparison."
        : `No cached history for ${benchmarkSymbol}.`;
    default:
      return "Benchmark chart is not available yet.";
  }
}

export function BenchmarkChart({
  benchmarkSymbol,
  portfolioCurrency,
  series,
  status
}: BenchmarkChartProps) {
  const hasSeries = series.length > 0;

  return (
    <article className="surface-card chart-card benchmark-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Performance</p>
          <h2 className="section-title">
            {benchmarkSymbol == null
              ? "Performance vs benchmark"
              : `Performance vs ${benchmarkSymbol}`}
          </h2>
        </div>
        <p className="surface-copy">
          {hasSeries
            ? "Indexed to 100; cash flows are excluded."
            : getUnavailableMessage({ benchmarkSymbol, portfolioCurrency, status })}
        </p>
      </div>

      {hasSeries ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
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
                tickFormatter={(value: number) => formatIndexedReturn(value)}
                tickLine={false}
                axisLine={false}
                width={76}
                stroke="var(--chart-axis)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(17, 27, 23, 0.16)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "var(--tooltip-bg)",
                  boxShadow: "var(--tooltip-shadow)",
                  color: "var(--ink)"
                }}
                formatter={(value: number, name: string) => [formatIndexedReturn(value), name]}
                labelFormatter={(value: string) => formatChartDate(value)}
              />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio"
                stroke="var(--accent)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent-strong)" }}
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                name={benchmarkSymbol ?? "Benchmark"}
                stroke="var(--warm)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "var(--warm)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty-state">
          <strong>No chart data</strong>
          <p>{getUnavailableMessage({ benchmarkSymbol, portfolioCurrency, status })}</p>
        </div>
      )}
    </article>
  );
}
