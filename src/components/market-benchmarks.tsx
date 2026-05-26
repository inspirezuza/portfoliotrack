"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type {
  DashboardBenchmarkMonthlyReturn,
  DashboardBenchmarkQuote
} from "@/server/dashboard";
import styles from "./market-benchmarks.module.css";

type MarketBenchmarksProps = {
  language: UiLanguage;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
};

type HistoricalMode = "RETURN" | "EXCESS";

type ChartPoint = {
  month: string;
  label: string;
  value: number | null;
};

function formatSignedPercent(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMonthLabel(month: string, locale: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
    year: "2-digit"
  }).format(date);
}

function BenchmarkTooltip({
  active,
  mode,
  label,
  payload
}: {
  active?: boolean;
  mode: HistoricalMode;
  label?: string;
  payload?: Array<{ payload?: ChartPoint; value?: number }>;
}) {
  const point = payload?.[0]?.payload;
  const value = payload?.[0]?.value ?? point?.value ?? null;

  if (!active || point == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{label ?? point.label}</span>
      <div className="chart-tooltip-row">
        <span>{mode === "EXCESS" ? "Excess" : "Return"}</span>
        <strong className={value == null || value >= 0 ? "value-positive" : "value-negative"}>
          {formatSignedPercent(value)}
        </strong>
      </div>
    </div>
  );
}

export function MarketBenchmarks({
  language,
  monthlyReturns,
  quotes
}: MarketBenchmarksProps) {
  const locale = getUiLocale(language);
  const [selectedSymbol, setSelectedSymbol] = useState(quotes[0]?.symbol ?? "SPY");
  const [mode, setMode] = useState<HistoricalMode>("RETURN");
  const selectedQuote = quotes.find((quote) => quote.symbol === selectedSymbol) ?? quotes[0] ?? null;
  const chartData = useMemo<ChartPoint[]>(
    () =>
      monthlyReturns
        .filter((entry) => entry.symbol === selectedSymbol)
        .slice(-12)
        .map((entry) => ({
          month: entry.month,
          label: formatMonthLabel(entry.month, locale),
          value: mode === "EXCESS" ? entry.excessReturnPercent : entry.returnPercent
        })),
    [locale, mode, monthlyReturns, selectedSymbol]
  );
  const hasQuoteData = quotes.some((quote) => quote.price != null);
  const hasChartData = chartData.some((point) => point.value != null);

  return (
    <section className={styles.section} aria-labelledby="market-benchmarks-title">
      <div className="dashboard-holdings-header">
        <div>
          <p className="eyebrow">Benchmarks</p>
          <h2 id="market-benchmarks-title" className="section-title">
            Market benchmarks
          </h2>
        </div>
        <span className="state-pill state-pill-muted">SPY QQQ TDEX NVDA GOOGL</span>
      </div>

      <div className={styles.cardStrip} aria-busy={!hasQuoteData}>
        {quotes.map((quote) => (
          <button
            aria-pressed={selectedSymbol === quote.symbol}
            className={styles.miniCard}
            key={quote.symbol}
            onClick={() => setSelectedSymbol(quote.symbol)}
            type="button"
          >
            <span>{quote.symbol}</span>
            <strong>
              {quote.price == null
                ? "-"
                : formatCurrency(quote.price, {
                    currency: quote.currency,
                    locale,
                    maximumFractionDigits: quote.price >= 100 ? 2 : 4
                  })}
            </strong>
            <em className={quote.dailyChange == null || quote.dailyChange >= 0 ? "value-positive" : "value-negative"}>
              {quote.dailyChange == null
                ? "No cache"
                : `${quote.dailyChange >= 0 ? "+" : ""}${quote.dailyChange.toFixed(2)} (${formatSignedPercent(quote.dailyChangePercent)})`}
            </em>
          </button>
        ))}
      </div>

      <article className={`surface-card ${styles.historicalCard}`}>
        <div className={styles.historicalHeader}>
          <div>
            <p className="eyebrow">Historical return</p>
            <h3>{selectedQuote?.displayName ?? selectedSymbol}</h3>
          </div>
          <div className={`chart-view-modes ${styles.modeToggle}`} aria-label="Historical return mode">
            <button
              aria-pressed={mode === "RETURN"}
              className={mode === "RETURN" ? "active" : ""}
              onClick={() => setMode("RETURN")}
              type="button"
            >
              Return
            </button>
            <button
              aria-pressed={mode === "EXCESS"}
              className={mode === "EXCESS" ? "active" : ""}
              onClick={() => setMode("EXCESS")}
              type="button"
            >
              Excess
            </button>
          </div>
        </div>

        {hasChartData ? (
          <div className={styles.chartShell}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 18, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                  tickLine={false}
                  width={54}
                  stroke="var(--chart-axis)"
                />
                <Tooltip content={<BenchmarkTooltip mode={mode} />} cursor={{ fill: "rgba(17, 27, 23, 0.06)" }} />
                <Bar
                  dataKey="value"
                  radius={[5, 5, 0, 0]}
                  isAnimationActive={false}
                >
                  {chartData.map((point) => (
                    <Cell
                      fill={point.value == null || point.value >= 0 ? "var(--accent)" : "var(--danger)"}
                      key={point.month}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={styles.loadingGrid} aria-hidden="true">
            <div className="loading-skeleton-panel" />
            <div className="loading-skeleton-panel" />
            <div className="loading-skeleton-panel" />
          </div>
        )}
      </article>
    </section>
  );
}
