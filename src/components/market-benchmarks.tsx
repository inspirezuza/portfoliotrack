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
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
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
type BenchmarkTimeframe = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

type ChartPoint = {
  month: string;
  label: string;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  portfolioReturn: number | null;
};

const TIMEFRAME_OPTIONS: Array<{ key: BenchmarkTimeframe; label: string }> = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" }
];

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

function getLatestMonth(monthlyReturns: DashboardBenchmarkMonthlyReturn[]) {
  return monthlyReturns
    .map((entry) => entry.month)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getTimeframeStartMonth(timeframe: BenchmarkTimeframe, latestMonth: string | null) {
  if (latestMonth == null || timeframe === "ALL") {
    return null;
  }

  const latestDate = new Date(`${latestMonth}-01T00:00:00.000Z`);

  if (Number.isNaN(latestDate.getTime())) {
    return null;
  }

  if (timeframe === "YTD") {
    return `${latestMonth.slice(0, 4)}-01`;
  }

  const months = timeframe === "1M" ? 1 : timeframe === "3M" ? 3 : timeframe === "6M" ? 6 : 12;
  const startDate = new Date(latestDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - months + 1);

  return startDate.toISOString().slice(0, 7);
}

function filterMonthlyReturnsByTimeframe<T extends { month: string }>({
  entries,
  latestMonth,
  timeframe
}: {
  entries: T[];
  latestMonth: string | null;
  timeframe: BenchmarkTimeframe;
}) {
  const startMonth = getTimeframeStartMonth(timeframe, latestMonth);

  return entries.filter((entry) => startMonth == null || entry.month >= startMonth);
}

function compoundReturn(values: Array<number | null>) {
  const usableValues = values.filter((value): value is number => value != null);

  if (usableValues.length === 0) {
    return null;
  }

  return (usableValues.reduce((total, value) => total * (1 + value / 100), 1) - 1) * 100;
}

function formatPeriodLabel({
  entries,
  locale,
  timeframe
}: {
  entries: Array<{ month: string }>;
  locale: string;
  timeframe: BenchmarkTimeframe;
}) {
  if (entries.length === 0) {
    return null;
  }

  const orderedMonths = entries.map((entry) => entry.month).sort((left, right) => left.localeCompare(right));
  const firstMonth = orderedMonths[0];
  const lastMonth = orderedMonths[orderedMonths.length - 1];

  if (timeframe !== "ALL") {
    return `${TIMEFRAME_OPTIONS.find((option) => option.key === timeframe)?.label ?? timeframe} - ${formatMonthLabel(lastMonth, locale)}`;
  }

  return firstMonth === lastMonth
    ? formatMonthLabel(lastMonth, locale)
    : `${formatMonthLabel(firstMonth, locale)}-${formatMonthLabel(lastMonth, locale)}`;
}

function getBenchmarkLabel(symbol: string) {
  return symbol === "SPYM" ? "S&P 500" : symbol;
}

function buildBenchmarkComparisons({
  latestMonth,
  locale,
  monthlyReturns,
  quotes,
  timeframe
}: {
  latestMonth: string | null;
  locale: string;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
  timeframe: BenchmarkTimeframe;
}): BenchmarkComparison[] {
  return quotes.map((quote) => {
    const timeframeReturns = filterMonthlyReturnsByTimeframe({
      entries: monthlyReturns.filter((entry) => entry.symbol === quote.symbol),
      latestMonth,
      timeframe
    }).sort((left, right) => left.month.localeCompare(right.month));
    const portfolioReturn = compoundReturn(timeframeReturns.map((entry) => entry.portfolioReturnPercent));
    const benchmarkReturn = compoundReturn(timeframeReturns.map((entry) => entry.returnPercent));

    return {
      benchmarkReturn,
      displayName: getBenchmarkLabel(quote.symbol),
      gap: portfolioReturn == null || benchmarkReturn == null ? null : portfolioReturn - benchmarkReturn,
      periodLabel: formatPeriodLabel({ entries: timeframeReturns, locale, timeframe }),
      portfolioReturn,
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
  const [timeframe, setTimeframe] = useState<BenchmarkTimeframe>("1Y");
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const selectedQuote = quotes.find((quote) => quote.symbol === selectedSymbol) ?? quotes[0] ?? null;
  const benchmarkLabel = getBenchmarkLabel(selectedSymbol);
  const latestMonth = useMemo(() => getLatestMonth(monthlyReturns), [monthlyReturns]);
  const comparisons = useMemo(
    () => buildBenchmarkComparisons({ latestMonth, locale, monthlyReturns, quotes, timeframe }),
    [latestMonth, locale, monthlyReturns, quotes, timeframe]
  );
  const chartData = useMemo<ChartPoint[]>(
    () =>
      filterMonthlyReturnsByTimeframe({
        entries: monthlyReturns.filter((entry) => entry.symbol === selectedSymbol),
        latestMonth,
        timeframe
      })
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((entry) => ({
          month: entry.month,
          label: formatMonthLabel(entry.month, locale),
          benchmarkReturn: entry.returnPercent,
          excessReturn: entry.excessReturnPercent,
          portfolioReturn: entry.portfolioReturnPercent
        })),
    [latestMonth, locale, monthlyReturns, selectedSymbol, timeframe]
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
          <span className={styles.sectionSubtitle}>Return difference by timeframe</span>
        </div>
        <span className="state-pill state-pill-muted">SPYM QQQ TDEX NVDA GOOGL</span>
      </div>

      <div className={styles.timeframeControls} aria-label="Benchmark comparison timeframe">
        {TIMEFRAME_OPTIONS.map((option) => (
          <button
            aria-pressed={timeframe === option.key}
            key={option.key}
            onClick={() => setTimeframe(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
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
            <span className={styles.cardMetric}>
              <strong className={comparison.gap == null || comparison.gap >= 0 ? "value-positive" : "value-negative"}>
                {formatSignedPercent(comparison.gap)}
              </strong>
              <span>Difference %</span>
            </span>
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
                : ` - ${formatCurrency(comparison.quote.price, {
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
          <div className={styles.chartShell} ref={chartContainerRef}>
            <ResponsiveContainer height={260} key={chartRenderKey} width="100%">
              <BarChart data={chartData} margin={{ top: 18, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
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
          <div className="empty-panel">
            <strong>No return cache</strong>
            <p>Benchmark returns will appear after the next market data refresh.</p>
          </div>
        )}
      </article>
    </section>
  );
}
