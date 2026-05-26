"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
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

type HistoricalMode = "GAP" | "RETURN";

type ChartPoint = {
  month: string;
  label: string;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  portfolioReturn: number | null;
};

type BenchmarkComparison = {
  benchmarkReturn: number | null;
  displayName: string;
  gap: number | null;
  periodLabel: string | null;
  portfolioReturn: number | null;
  quote: DashboardBenchmarkQuote;
};

function formatSignedPercent(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatSignedPercentagePoint(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
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

function getBenchmarkLabel(symbol: string) {
  return symbol === "SPYM" ? "S&P 500" : symbol;
}

function buildBenchmarkComparisons({
  locale,
  monthlyReturns,
  quotes
}: {
  locale: string;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
}): BenchmarkComparison[] {
  return quotes.map((quote) => {
    const latestReturn = monthlyReturns
      .filter((entry) => entry.symbol === quote.symbol)
      .sort((left, right) => right.month.localeCompare(left.month))[0] ?? null;

    return {
      benchmarkReturn: latestReturn?.returnPercent ?? null,
      displayName: getBenchmarkLabel(quote.symbol),
      gap: latestReturn?.excessReturnPercent ?? null,
      periodLabel: latestReturn == null ? null : formatMonthLabel(latestReturn.month, locale),
      portfolioReturn: latestReturn?.portfolioReturnPercent ?? null,
      quote
    };
  });
}

function BenchmarkTooltip({
  active,
  benchmarkLabel,
  mode,
  label,
  payload
}: {
  active?: boolean;
  benchmarkLabel: string;
  mode: HistoricalMode;
  label?: string;
  payload?: Array<{ dataKey?: string; payload?: ChartPoint; value?: number }>;
}) {
  const point = payload?.[0]?.payload;

  if (!active || point == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{label ?? point.label}</span>
      {mode === "GAP" ? (
        <div className="chart-tooltip-row">
          <span>Gap</span>
          <strong className={point.excessReturn == null || point.excessReturn >= 0 ? "value-positive" : "value-negative"}>
            {formatSignedPercentagePoint(point.excessReturn)}
          </strong>
        </div>
      ) : (
        <>
          <div className="chart-tooltip-row">
            <span>Portfolio</span>
            <strong className={point.portfolioReturn == null || point.portfolioReturn >= 0 ? "value-positive" : "value-negative"}>
              {formatSignedPercent(point.portfolioReturn)}
            </strong>
          </div>
          <div className="chart-tooltip-row">
            <span>{benchmarkLabel}</span>
            <strong className={point.benchmarkReturn == null || point.benchmarkReturn >= 0 ? "value-positive" : "value-negative"}>
              {formatSignedPercent(point.benchmarkReturn)}
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

export function MarketBenchmarks({
  language,
  monthlyReturns,
  quotes
}: MarketBenchmarksProps) {
  const locale = getUiLocale(language);
  const [selectedSymbol, setSelectedSymbol] = useState(quotes[0]?.symbol ?? "SPYM");
  const [mode, setMode] = useState<HistoricalMode>("GAP");
  const selectedQuote = quotes.find((quote) => quote.symbol === selectedSymbol) ?? quotes[0] ?? null;
  const benchmarkLabel = getBenchmarkLabel(selectedSymbol);
  const comparisons = useMemo(
    () => buildBenchmarkComparisons({ locale, monthlyReturns, quotes }),
    [locale, monthlyReturns, quotes]
  );
  const chartData = useMemo<ChartPoint[]>(
    () =>
      monthlyReturns
        .filter((entry) => entry.symbol === selectedSymbol)
        .slice(-12)
        .map((entry) => ({
          month: entry.month,
          label: formatMonthLabel(entry.month, locale),
          benchmarkReturn: entry.returnPercent,
          excessReturn: entry.excessReturnPercent,
          portfolioReturn: entry.portfolioReturnPercent
        })),
    [locale, monthlyReturns, selectedSymbol]
  );
  const hasQuoteData = comparisons.some((comparison) => comparison.gap != null);
  const hasChartData = chartData.some((point) =>
    mode === "GAP"
      ? point.excessReturn != null
      : point.portfolioReturn != null || point.benchmarkReturn != null
  );

  return (
    <section className={styles.section} aria-labelledby="market-benchmarks-title">
      <div className="dashboard-holdings-header">
        <div>
          <p className="eyebrow">Benchmarks</p>
          <h2 id="market-benchmarks-title" className="section-title">
            Portfolio vs benchmarks
          </h2>
          <span className={styles.sectionSubtitle}>Latest monthly return gap, compared by %</span>
        </div>
        <span className="state-pill state-pill-muted">SPYM QQQ TDEX NVDA GOOGL</span>
      </div>

      <div className={styles.cardStrip} aria-busy={!hasQuoteData}>
        {comparisons.map((comparison) => (
          <button
            aria-pressed={selectedSymbol === comparison.quote.symbol}
            className={styles.miniCard}
            key={comparison.quote.symbol}
            onClick={() => setSelectedSymbol(comparison.quote.symbol)}
            type="button"
          >
            <span className={styles.cardSymbol}>{comparison.quote.symbol}</span>
            <strong className={comparison.gap == null || comparison.gap >= 0 ? "value-positive" : "value-negative"}>
              {formatSignedPercentagePoint(comparison.gap)}
            </strong>
            <span className={styles.cardRows}>
              <span>
                <b>Portfolio</b>
                <em className={comparison.portfolioReturn == null || comparison.portfolioReturn >= 0 ? "value-positive" : "value-negative"}>
                  {formatSignedPercent(comparison.portfolioReturn)}
                </em>
              </span>
              <span>
                <b>{comparison.displayName}</b>
                <em className={comparison.benchmarkReturn == null || comparison.benchmarkReturn >= 0 ? "value-positive" : "value-negative"}>
                  {formatSignedPercent(comparison.benchmarkReturn)}
                </em>
              </span>
            </span>
            <small>
              {comparison.periodLabel ?? "No return cache"}
              {comparison.quote.price == null
                ? ""
                : ` · ${formatCurrency(comparison.quote.price, {
                    currency: comparison.quote.currency,
                    locale,
                    maximumFractionDigits: comparison.quote.price >= 100 ? 2 : 4
                  })}`}
            </small>
          </button>
        ))}
      </div>

      <article className={`surface-card ${styles.historicalCard}`}>
        <div className={styles.historicalHeader}>
          <div>
            <p className="eyebrow">{mode === "GAP" ? "Monthly gap" : "Monthly return"}</p>
            <h3>Portfolio vs {selectedQuote?.displayName ?? benchmarkLabel}</h3>
            <span className={styles.comparisonLabel}>
              {mode === "GAP"
                ? "Positive bars mean the portfolio beat the benchmark"
                : "Portfolio and benchmark monthly returns side by side"}
            </span>
          </div>
          <div className={`chart-view-modes ${styles.modeToggle}`} aria-label="Historical return mode">
            <button
              aria-pressed={mode === "GAP"}
              className={mode === "GAP" ? "active" : ""}
              onClick={() => setMode("GAP")}
              type="button"
            >
              Gap
            </button>
            <button
              aria-pressed={mode === "RETURN"}
              className={mode === "RETURN" ? "active" : ""}
              onClick={() => setMode("RETURN")}
              type="button"
            >
              Return
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
                <ReferenceLine y={0} stroke="var(--chart-axis)" strokeOpacity={0.45} />
                <Tooltip
                  content={<BenchmarkTooltip benchmarkLabel={benchmarkLabel} mode={mode} />}
                  cursor={{ fill: "rgba(17, 27, 23, 0.06)" }}
                />
                {mode === "GAP" ? (
                  <Bar dataKey="excessReturn" name="Gap" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                    {chartData.map((point) => (
                      <Cell
                        fill={point.excessReturn == null || point.excessReturn >= 0 ? "var(--accent)" : "var(--danger)"}
                        key={point.month}
                      />
                    ))}
                  </Bar>
                ) : null}
                {mode === "RETURN" ? (
                  <Bar
                    dataKey="portfolioReturn"
                    name="Portfolio"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((point) => (
                      <Cell
                        fill={point.portfolioReturn == null || point.portfolioReturn >= 0 ? "var(--accent)" : "var(--danger)"}
                        key={`portfolio-${point.month}`}
                      />
                    ))}
                  </Bar>
                ) : null}
                {mode === "RETURN" ? (
                  <Bar
                    dataKey="benchmarkReturn"
                    name={benchmarkLabel}
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((point) => (
                      <Cell
                        fill={point.benchmarkReturn == null || point.benchmarkReturn >= 0 ? "rgba(197, 125, 35, 0.92)" : "rgba(184, 75, 67, 0.62)"}
                        key={`benchmark-${point.month}`}
                      />
                    ))}
                  </Bar>
                ) : null}
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
