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
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { DashboardBenchmarkMonthlyReturn, DashboardBenchmarkQuote } from "@/server/dashboard";
import {
  buildBenchmarkChartData,
  buildBenchmarkComparisons,
  formatSignedPercent,
  formatSignedPercentagePoint,
  getBenchmarkLabel,
  getLatestMonth,
  hasBenchmarkChartData,
  hasBenchmarkQuoteData,
  TIMEFRAME_OPTIONS,
  type BenchmarkTimeframe,
  type ChartPoint,
  type HistoricalMode,
} from "@/components/market-benchmarks/helpers";
import styles from "./market-benchmarks.module.css";

type MarketBenchmarksProps = {
  language: UiLanguage;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
};

function BenchmarkTooltip({
  active,
  benchmarkLabel,
  mode,
  label,
  payload,
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
          <strong
            className={
              point.excessReturn == null || point.excessReturn >= 0
                ? "value-positive"
                : "value-negative"
            }
          >
            {formatSignedPercentagePoint(point.excessReturn)}
          </strong>
        </div>
      ) : (
        <>
          <div className="chart-tooltip-row">
            <span>Portfolio</span>
            <strong
              className={
                point.portfolioReturn == null || point.portfolioReturn >= 0
                  ? "value-positive"
                  : "value-negative"
              }
            >
              {formatSignedPercent(point.portfolioReturn)}
            </strong>
          </div>
          <div className="chart-tooltip-row">
            <span>{benchmarkLabel}</span>
            <strong
              className={
                point.benchmarkReturn == null || point.benchmarkReturn >= 0
                  ? "value-positive"
                  : "value-negative"
              }
            >
              {formatSignedPercent(point.benchmarkReturn)}
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

export function MarketBenchmarks({ language, monthlyReturns, quotes }: MarketBenchmarksProps) {
  const locale = getUiLocale(language);
  const [selectedSymbol, setSelectedSymbol] = useState(quotes[0]?.symbol ?? "SPYM");
  const [mode, setMode] = useState<HistoricalMode>("GAP");
  const [timeframe, setTimeframe] = useState<BenchmarkTimeframe>("1Y");
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const selectedQuote =
    quotes.find((quote) => quote.symbol === selectedSymbol) ?? quotes[0] ?? null;
  const benchmarkLabel = getBenchmarkLabel(selectedSymbol);
  const latestMonth = useMemo(() => getLatestMonth(monthlyReturns), [monthlyReturns]);
  const comparisons = useMemo(
    () => buildBenchmarkComparisons({ latestMonth, locale, monthlyReturns, quotes, timeframe }),
    [latestMonth, locale, monthlyReturns, quotes, timeframe],
  );
  const chartData = useMemo<ChartPoint[]>(
    () =>
      buildBenchmarkChartData({
        latestMonth,
        locale,
        monthlyReturns,
        selectedSymbol,
        timeframe,
      }),
    [latestMonth, locale, monthlyReturns, selectedSymbol, timeframe],
  );
  const hasQuoteData = hasBenchmarkQuoteData(comparisons);
  const hasChartData = hasBenchmarkChartData({ chartData, mode });

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
              <strong
                className={
                  comparison.gap == null || comparison.gap >= 0
                    ? "value-positive"
                    : "value-negative"
                }
              >
                {formatSignedPercent(comparison.gap)}
              </strong>
              <span>Difference %</span>
            </span>
            <span className={styles.cardRows}>
              <span>
                <b>Portfolio</b>
                <em
                  className={
                    comparison.portfolioReturn == null || comparison.portfolioReturn >= 0
                      ? "value-positive"
                      : "value-negative"
                  }
                >
                  {formatSignedPercent(comparison.portfolioReturn)}
                </em>
              </span>
              <span>
                <b>{comparison.displayName}</b>
                <em
                  className={
                    comparison.benchmarkReturn == null || comparison.benchmarkReturn >= 0
                      ? "value-positive"
                      : "value-negative"
                  }
                >
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
                    maximumFractionDigits: comparison.quote.price >= 100 ? 2 : 4,
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
          <div
            className={`chart-view-modes ${styles.modeToggle}`}
            aria-label="Historical return mode"
          >
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
                  <Bar
                    dataKey="excessReturn"
                    name="Gap"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((point) => (
                      <Cell
                        fill={
                          point.excessReturn == null || point.excessReturn >= 0
                            ? "var(--accent)"
                            : "var(--danger)"
                        }
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
                        fill={
                          point.portfolioReturn == null || point.portfolioReturn >= 0
                            ? "var(--accent)"
                            : "var(--danger)"
                        }
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
                        fill={
                          point.benchmarkReturn == null || point.benchmarkReturn >= 0
                            ? "rgba(197, 125, 35, 0.92)"
                            : "rgba(184, 75, 67, 0.62)"
                        }
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
