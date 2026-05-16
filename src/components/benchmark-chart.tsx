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
  return new Intl.DateTimeFormat(undefined, {
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
      return "A benchmark comparison appears after the portfolio has at least one recorded trade dated today or earlier.";
    case "mixed-currency":
      return "Benchmark comparison is disabled because current open holdings span more than one currency.";
    case "missing-portfolio-history":
      return "Current open holdings need comparable price history before the benchmark view can be shown honestly.";
    case "benchmark-currency-mismatch":
      return benchmarkSymbol == null || portfolioCurrency == null
        ? "The configured benchmark does not match the portfolio currency."
        : `${benchmarkSymbol} cannot be compared directly because it is not priced in ${portfolioCurrency}.`;
    case "missing-benchmark-history":
      return benchmarkSymbol == null
        ? "Set a benchmark instrument to enable the relative comparison chart."
        : `${benchmarkSymbol} does not have comparable price history yet.`;
    default:
      return "Benchmark comparison is unavailable right now.";
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
    <article className="surface-card chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Benchmark chart</p>
          <h2 className="section-title">
            {benchmarkSymbol == null
              ? "Cash-flow-adjusted return"
              : `Cash-flow-adjusted vs ${benchmarkSymbol}`}
          </h2>
        </div>
        <p className="surface-copy">
          {hasSeries
            ? "Both lines start at 100. The portfolio line removes dated trade cash flows first, so later buys and sells do not read as performance."
            : getUnavailableMessage({ benchmarkSymbol, portfolioCurrency, status })}
        </p>
      </div>

      {hasSeries ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
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
                tickFormatter={(value: number) => formatIndexedReturn(value)}
                tickLine={false}
                axisLine={false}
                width={76}
                stroke="rgba(110, 102, 93, 0.9)"
              />
              <Tooltip
                cursor={{ stroke: "rgba(31, 28, 22, 0.12)", strokeWidth: 1 }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(31, 28, 22, 0.12)",
                  background: "rgba(255, 251, 244, 0.96)",
                  boxShadow: "0 24px 80px rgba(53, 40, 21, 0.12)"
                }}
                formatter={(value: number, name: string) => [formatIndexedReturn(value), name]}
                labelFormatter={(value: string) => formatChartDate(value)}
              />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio (cash-flow-adjusted)"
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
          <p>{getUnavailableMessage({ benchmarkSymbol, portfolioCurrency, status })}</p>
        </div>
      )}
    </article>
  );
}
