"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency, formatPercentRatio } from "@/lib/format";
import type {
  BenchmarkComparisonBasis,
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimelineStatus
} from "@/lib/portfolio/timeline";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";

type BenchmarkChartProps = {
  absoluteSeries: BenchmarkTimelinePoint[];
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  language: UiLanguage;
  performanceSummary: BenchmarkPerformanceSummary;
  portfolioCurrency: string | null;
  series: BenchmarkTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

type BenchmarkPerformanceSummary = {
  status:
    | "ready"
    | "no-transactions"
    | "mixed-currency"
    | "missing-market-value"
    | "no-positive-net-invested";
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "START" | "ALL";
type PerformanceMode = "INDEXED" | "GAP" | "DRAWDOWN";
type ReturnBasis = "TWR" | "ABSOLUTE";

type ChartPoint = BenchmarkTimelinePoint & {
  benchmarkChangeFromRangeStart: number | null;
  benchmarkDisplay: number;
  benchmarkDrawdown: number;
  benchmarkReturn: number;
  gap: number;
  portfolioDisplay: number;
  portfolioChangeFromRangeStart: number | null;
  portfolioDrawdown: number;
  portfolioReturn: number;
};

type ChartMouseState = {
  activePayload?: Array<{
    payload?: ChartPoint;
  }>;
};

type SelectionRange = {
  startDate: string;
  endDate: string;
};

type BenchmarkChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    payload?: ChartPoint;
    value?: number;
  }>;
};

const TIMEFRAME_OPTIONS: TimeframeKey[] = ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "START", "ALL"];

const PERFORMANCE_MODE_OPTIONS: PerformanceMode[] = ["INDEXED", "GAP", "DRAWDOWN"];
const RETURN_BASIS_OPTIONS: ReturnBasis[] = ["TWR", "ABSOLUTE"];

function parseChartDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

function isIntradayDate(value: string) {
  return value.includes("T");
}

function formatChartDate(value: string, locale: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC"
  }).format(parseChartDate(value));
}

function formatAxisDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseChartDate(value));
}

function formatIndexedReturn(value: number, locale: string) {
  return formatPercentRatio(value / 100 - 1, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPercentagePoint(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

function formatPerformanceMoney(value: number | null, currency: string | null, locale: string) {
  if (value == null || currency == null) {
    return "-";
  }

  return formatCurrency(value, { currency, locale });
}

function formatAbsoluteReturn(value: number | null, locale: string) {
  if (value == null) {
    return "-";
  }

  return formatPercentRatio(value, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });
}

function formatModeValue(value: number, mode: PerformanceMode, locale: string) {
  if (mode === "INDEXED") {
    return formatIndexedReturn(value, locale);
  }

  return mode === "GAP" ? formatPercentagePoint(value) : formatSignedPercent(value);
}

function getBasisLabel({
  benchmarkCurrency,
  comparisonBasis,
  portfolioCurrency,
  copy
}: {
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolioCurrency: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
}) {
  if (comparisonBasis === "same-currency") {
    return portfolioCurrency == null
      ? copy.basis.sameCurrencyFallback
      : copy.basis.sameCurrency(portfolioCurrency);
  }

  if (comparisonBasis === "native-currency-return") {
    return benchmarkCurrency == null
      ? copy.basis.nativeCurrencyFallback
      : copy.basis.nativeCurrency(benchmarkCurrency);
  }

  return copy.basis.performanceReturn;
}

function getAbsoluteSummaryMessage({
  copy,
  status
}: {
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  status: BenchmarkPerformanceSummary["status"];
}) {
  switch (status) {
    case "mixed-currency":
      return copy.absoluteSummary.unavailable.mixedCurrency;
    case "missing-market-value":
      return copy.absoluteSummary.unavailable.missingMarketValue;
    case "no-positive-net-invested":
      return copy.absoluteSummary.unavailable.noPositiveNetInvested;
    case "no-transactions":
      return copy.absoluteSummary.unavailable.noTransactions;
    default:
      return null;
  }
}

function getValueClassName(value: number | null) {
  if (value == null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

function getUnavailableMessage({
  benchmarkSymbol,
  copy,
  portfolioCurrency,
  returnBasis,
  status
}: {
  benchmarkSymbol: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  portfolioCurrency: string | null;
  returnBasis: ReturnBasis;
  status: PortfolioBenchmarkTimelineStatus;
}) {
  if (status === "ready" && returnBasis === "ABSOLUTE") {
    return copy.unavailable.missingAbsoluteReturn;
  }

  switch (status) {
    case "no-transactions":
      return copy.unavailable.noTransactions;
    case "mixed-currency":
      return copy.unavailable.mixedCurrency;
    case "missing-portfolio-history":
      return copy.unavailable.missingPortfolioHistory;
    case "benchmark-currency-mismatch":
      return benchmarkSymbol == null || portfolioCurrency == null
        ? copy.unavailable.currencyMismatchFallback
        : copy.unavailable.currencyMismatch(benchmarkSymbol, portfolioCurrency);
    case "missing-benchmark-history":
      return benchmarkSymbol == null
        ? copy.unavailable.missingBenchmarkFallback
        : copy.unavailable.missingBenchmarkHistory(benchmarkSymbol);
    default:
      return copy.unavailable.default;
  }
}

function getUtcDateTime(value: string) {
  return parseChartDate(value).getTime();
}

function getTimeframeStartDate(key: TimeframeKey, latestDate: string, sinceStartDate: string | null) {
  const latest = parseChartDate(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "START") {
    return sinceStartDate == null || sinceStartDate.includes("T")
      ? sinceStartDate
      : `${sinceStartDate}T00:00:00.000Z`;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD" | "START">, number> = {
    "1D": 1,
    "5D": 5,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365
  };
  latest.setUTCDate(latest.getUTCDate() - daysByKey[key]);

  return latest.toISOString();
}

function isShortTimeframe(timeframe: TimeframeKey) {
  return timeframe === "1D" || timeframe === "5D" || timeframe === "1W" || timeframe === "1M";
}

function getPreferredIntradayInterval(timeframe: TimeframeKey) {
  if (timeframe === "1D") {
    return "5m";
  }

  if (timeframe === "5D" || timeframe === "1W" || timeframe === "1M") {
    return "1h";
  }

  return null;
}

function getVisibleSeries(series: BenchmarkTimelinePoint[], timeframe: TimeframeKey) {
  const latestPoint = series[series.length - 1];
  const sinceStartDate = series[0]?.date ?? null;

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date, sinceStartDate);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredSeries =
    startTime == null ? series : series.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradaySeries = filteredSeries.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval
    );

    if (preferredIntradaySeries.length >= 2) {
      return preferredIntradaySeries;
    }

    const intradaySeries = filteredSeries.filter((point) => isIntradayDate(point.date));

    if (intradaySeries.length >= 2) {
      return intradaySeries;
    }
  } else {
    const dailySeries = filteredSeries.filter((point) => !isIntradayDate(point.date));

    if (dailySeries.length >= 2) {
      return dailySeries;
    }
  }

  return filteredSeries.length > 0 ? filteredSeries : series;
}

function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

function getPaddedDomain(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return undefined;
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const spread = max - min;
  const padding = spread === 0 ? Math.max(Math.abs(max) * 0.04, 1) : spread * 0.14;

  return [min - padding, max + padding] satisfies [number, number];
}

function getSelectionPoints(data: ChartPoint[], selection: SelectionRange | null) {
  if (selection == null) {
    return null;
  }

  const startTime = getUtcDateTime(selection.startDate);
  const endTime = getUtcDateTime(selection.endDate);
  const minTime = Math.min(startTime, endTime);
  const maxTime = Math.max(startTime, endTime);
  const startPoint = data.find((point) => getUtcDateTime(point.date) === minTime) ?? null;
  const endPoint = data.find((point) => getUtcDateTime(point.date) === maxTime) ?? null;

  if (startPoint == null || endPoint == null) {
    return null;
  }

  return {
    startPoint,
    endPoint
  };
}

function hasSelectionSpan(points: ReturnType<typeof getSelectionPoints>) {
  return points != null && points.startPoint.date !== points.endPoint.date;
}

function getChartPoint(state: ChartMouseState | undefined) {
  return state?.activePayload?.[0]?.payload ?? null;
}

function BenchmarkChartTooltip({
  active,
  label,
  language,
  mode,
  payload
}: BenchmarkChartTooltipProps & { language: UiLanguage; mode: PerformanceMode }) {
  const point = payload?.[0]?.payload;
  const locale = getUiLocale(language);

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(label, locale)}</span>
      {payload?.map((item) => {
        const value = item.value;

        if (value == null || item.dataKey == null) {
          return null;
        }

        const change =
          item.dataKey === "portfolioDisplay"
            ? point.portfolioChangeFromRangeStart
            : point.benchmarkChangeFromRangeStart;

        return (
          <div className="chart-tooltip-row" key={item.dataKey}>
            <span>{item.name ?? item.dataKey}</span>
            <strong>{formatModeValue(value, mode, locale)}</strong>
            {mode !== "INDEXED" || change == null ? null : (
              <em className={change >= 0 ? "value-positive" : "value-negative"}>
                {formatSignedPercent(change)}
              </em>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BenchmarkChart({
  absoluteSeries,
  benchmarkSymbol,
  benchmarkCurrency,
  comparisonBasis,
  language,
  performanceSummary,
  portfolioCurrency,
  series,
  status
}: BenchmarkChartProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [returnBasis, setReturnBasis] = useState<ReturnBasis>("TWR");
  const [mode, setMode] = useState<PerformanceMode>("INDEXED");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const activeSeries = returnBasis === "ABSOLUTE" ? absoluteSeries : series;
  const hasSeries = activeSeries.length > 0;
  const hasAnySeries = series.length > 0 || absoluteSeries.length > 0;
  const returnBasisCopy = copy.charts.benchmark.returnBasis[returnBasis];
  const absoluteSummaryMessage = getAbsoluteSummaryMessage({
    copy: copy.charts.benchmark,
    status: performanceSummary.status
  });
  const shouldShowAbsoluteSummary = performanceSummary.status !== "no-transactions";
  const visibleSeries = useMemo(() => getVisibleSeries(activeSeries, timeframe), [activeSeries, timeframe]);
  const basisReturn = useMemo(() => {
    const firstPoint = visibleSeries[0] ?? null;
    const latestPoint = visibleSeries[visibleSeries.length - 1] ?? null;

    if (firstPoint == null || latestPoint == null) {
      return null;
    }

    return calculatePercentChange(firstPoint.portfolio, latestPoint.portfolio);
  }, [visibleSeries]);
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstPoint = visibleSeries[0] ?? null;
    let portfolioHighWatermark = firstPoint?.portfolio ?? 100;
    let benchmarkHighWatermark = firstPoint?.benchmark ?? 100;

    return visibleSeries.map((point) => {
      portfolioHighWatermark = Math.max(portfolioHighWatermark, point.portfolio);
      benchmarkHighWatermark = Math.max(benchmarkHighWatermark, point.benchmark);

      const portfolioReturn =
        firstPoint == null ? 0 : calculatePercentChange(firstPoint.portfolio, point.portfolio) ?? 0;
      const benchmarkReturn =
        firstPoint == null ? 0 : calculatePercentChange(firstPoint.benchmark, point.benchmark) ?? 0;
      const portfolioDrawdown =
        portfolioHighWatermark === 0
          ? 0
          : ((point.portfolio - portfolioHighWatermark) / portfolioHighWatermark) * 100;
      const benchmarkDrawdown =
        benchmarkHighWatermark === 0
          ? 0
          : ((point.benchmark - benchmarkHighWatermark) / benchmarkHighWatermark) * 100;

      return {
        ...point,
        benchmarkChangeFromRangeStart: firstPoint == null ? null : benchmarkReturn,
        benchmarkDisplay:
          mode === "DRAWDOWN" ? benchmarkDrawdown : mode === "GAP" ? 0 : point.benchmark,
        benchmarkDrawdown,
        benchmarkReturn,
        gap: portfolioReturn - benchmarkReturn,
        portfolioChangeFromRangeStart: firstPoint == null ? null : portfolioReturn,
        portfolioDisplay:
          mode === "DRAWDOWN"
            ? portfolioDrawdown
            : mode === "GAP"
              ? portfolioReturn - benchmarkReturn
              : point.portfolio,
        portfolioDrawdown,
        portfolioReturn
      };
    });
  }, [mode, visibleSeries]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const firstPoint = chartData[0];
    const latestPoint = chartData[chartData.length - 1];
    const portfolioChange = calculatePercentChange(firstPoint.portfolio, latestPoint.portfolio);
    const benchmarkChange = calculatePercentChange(firstPoint.benchmark, latestPoint.benchmark);
    const gap =
      portfolioChange == null || benchmarkChange == null
        ? null
        : portfolioChange - benchmarkChange;

    return {
      latestPoint,
      portfolioChange,
      benchmarkChange,
      gap
    };
  }, [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const hasActiveSelection = hasSelectionSpan(selectionPoints);
  const selectedPortfolioChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.portfolio, selectionPoints.endPoint.portfolio);
  const selectedBenchmarkChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.benchmark, selectionPoints.endPoint.benchmark);
  const selectedGap =
    selectedPortfolioChange == null || selectedBenchmarkChange == null
      ? null
      : selectedPortfolioChange - selectedBenchmarkChange;
  const modeCopy = mode === "INDEXED"
    ? {
        portfolioName: returnBasisCopy.portfolioName,
        benchmarkName: copy.charts.benchmark.modeCopy.INDEXED.benchmarkName,
        yAxisLabel: returnBasisCopy.yAxisLabel
      }
    : copy.charts.benchmark.modeCopy[mode];
  const yDomain = useMemo(
    () =>
      getPaddedDomain(
        chartData.flatMap((point) => [point.portfolioDisplay, point.benchmarkDisplay])
      ),
    [chartData]
  );

  function handleChartMouseDown(state: ChartMouseState | undefined) {
    const point = getChartPoint(state);

    if (point == null) {
      return;
    }

    isDraggingRef.current = true;
    setSelection({
      startDate: point.date,
      endDate: point.date
    });
  }

  function handleChartMouseMove(state: ChartMouseState | undefined) {
    const point = getChartPoint(state);

    if (!isDraggingRef.current || point == null) {
      return;
    }

    setSelection((currentSelection) =>
      currentSelection == null || currentSelection.endDate === point.date
        ? currentSelection
        : {
            ...currentSelection,
            endDate: point.date
          }
    );
  }

  function handleChartMouseUp() {
    isDraggingRef.current = false;
  }

  return (
    <article className="surface-card chart-card benchmark-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">{copy.charts.benchmark.eyebrow}</p>
          <h2 className="section-title">
            {benchmarkSymbol == null
              ? copy.charts.benchmark.titleDefault
              : copy.charts.benchmark.titleWithSymbol(benchmarkSymbol)}
          </h2>
          {hasAnySeries ? (
            <p className="chart-subtitle">
              {getBasisLabel({
                benchmarkCurrency,
                comparisonBasis,
                copy: copy.charts.benchmark,
                portfolioCurrency
              })}
            </p>
          ) : null}
        </div>
        <div className="chart-control-stack">
          <div className="chart-mode-row">
            <div className="chart-view-modes" aria-label={copy.charts.benchmark.performanceMode}>
              {PERFORMANCE_MODE_OPTIONS.map((option) => (
                <button
                  aria-pressed={mode === option}
                  className={mode === option ? "active" : ""}
                  key={option}
                  onClick={() => {
                    setMode(option);
                    setSelection(null);
                  }}
                  type="button"
                >
                  {copy.charts.benchmark.modes[option]}
                </button>
              ))}
            </div>
            <div className="chart-return-basis-group">
              <div
                className="chart-view-modes chart-return-basis"
                aria-label={copy.charts.benchmark.returnBasis.label}
              >
                {RETURN_BASIS_OPTIONS.map((option) => (
                  <button
                    aria-pressed={returnBasis === option}
                    className={returnBasis === option ? "active" : ""}
                    key={option}
                    onClick={() => {
                      setReturnBasis(option);
                      setSelection(null);
                    }}
                    type="button"
                  >
                    {copy.charts.benchmark.returnBasis.options[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-timeframes" aria-label={copy.charts.benchmark.timeframe}>
            {TIMEFRAME_OPTIONS.map((option) => (
              <button
                aria-pressed={timeframe === option}
                className={timeframe === option ? "active" : ""}
                key={option}
                onClick={() => {
                  setTimeframe(option);
                  setSelection(null);
                }}
                type="button"
              >
                {copy.charts.common.timeframes[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shouldShowAbsoluteSummary ? (
        <div className="chart-stat-strip" aria-label={copy.charts.benchmark.absoluteSummary.label}>
          <div title={returnBasis === "TWR" ? returnBasisCopy.hint : copy.charts.benchmark.absoluteSummary.hints.absoluteReturn}>
            <span>{returnBasis === "TWR" ? "TWR return" : copy.charts.benchmark.absoluteSummary.absoluteReturn}</span>
            <strong className={getValueClassName(returnBasis === "TWR" ? basisReturn : performanceSummary.absoluteReturn)}>
              {returnBasis === "TWR"
                ? basisReturn == null
                  ? "-"
                  : formatSignedPercent(basisReturn)
                : formatAbsoluteReturn(performanceSummary.absoluteReturn, locale)}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.totalPnl}>
            <span>{copy.charts.benchmark.absoluteSummary.totalPnl}</span>
            <strong className={getValueClassName(performanceSummary.totalPnl)}>
              {formatPerformanceMoney(performanceSummary.totalPnl, performanceSummary.currency, locale)}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.netInvested}>
            <span>{copy.charts.benchmark.absoluteSummary.netInvested}</span>
            <strong>
              {formatPerformanceMoney(performanceSummary.netInvested, performanceSummary.currency, locale)}
            </strong>
          </div>
          <div title={returnBasisCopy.hint}>
            <span>{copy.charts.benchmark.absoluteSummary.timeWeighted}</span>
            <strong>{returnBasisCopy.summaryValue}</strong>
          </div>
          {absoluteSummaryMessage == null ? null : (
            <div title={copy.charts.benchmark.absoluteSummary.hints.note}>
              <span>{copy.charts.benchmark.absoluteSummary.note}</span>
              <strong>{absoluteSummaryMessage}</strong>
            </div>
          )}
        </div>
      ) : null}

      {hasSeries ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <div className="chart-stat-strip" aria-label={copy.charts.benchmark.rangeSummary}>
              <div>
                <span>{copy.charts.benchmark.portfolio}</span>
                <strong
                  className={
                    rangeStats.portfolioChange == null
                      ? ""
                      : rangeStats.portfolioChange >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.portfolioChange == null
                    ? "-"
                    : formatSignedPercent(rangeStats.portfolioChange)}
                </strong>
              </div>
              <div>
                <span>{benchmarkSymbol ?? copy.charts.benchmark.benchmark}</span>
                <strong
                  className={
                    rangeStats.benchmarkChange == null
                      ? ""
                      : rangeStats.benchmarkChange >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.benchmarkChange == null
                    ? "-"
                    : formatSignedPercent(rangeStats.benchmarkChange)}
                </strong>
              </div>
              <div>
                <span>{mode === "GAP" ? copy.charts.benchmark.latestGap : copy.charts.benchmark.gap}</span>
                <strong
                  className={
                    rangeStats.gap == null
                      ? ""
                      : rangeStats.gap >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.gap == null ? "-" : formatPercentagePoint(rangeStats.gap)}
                </strong>
              </div>
              <div>
                <span>{modeCopy.yAxisLabel}</span>
                <strong>{formatModeValue(rangeStats.latestPoint.portfolioDisplay, mode, locale)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 10, left: 4, bottom: 8 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseUp}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => formatAxisDate(value, locale)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  height={36}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatModeValue(value, mode, locale)}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={yDomain}
                  tickCount={5}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(17, 27, 23, 0.16)", strokeWidth: 1 }}
                  content={<BenchmarkChartTooltip language={language} mode={mode} />}
                />
                {!hasActiveSelection || selection == null ? null : (
                  <ReferenceArea
                    x1={selection.startDate}
                    x2={selection.endDate}
                    stroke="rgba(23, 107, 85, 0.18)"
                    fill="rgba(23, 107, 85, 0.10)"
                    ifOverflow="hidden"
                  />
                )}
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="portfolioDisplay"
                  name={modeCopy.portfolioName}
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--accent-strong)" }}
                />
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="benchmarkDisplay"
                  name={mode === "GAP" ? modeCopy.benchmarkName : benchmarkSymbol ?? modeCopy.benchmarkName}
                  stroke="var(--warm)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--warm)" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div
              className={
                hasActiveSelection &&
                selectionPoints != null &&
                selectedPortfolioChange != null &&
                selectedBenchmarkChange != null
                  ? "chart-selection-readout"
                  : "chart-selection-readout chart-selection-readout-idle"
              }
            >
              {!hasActiveSelection ||
              selectionPoints == null ||
              selectedPortfolioChange == null ||
              selectedBenchmarkChange == null ? (
                <span>{copy.charts.common.dragToCompare}</span>
              ) : (
                <>
                <span>
                  {formatChartDate(selectionPoints.startPoint.date, locale)}{" "}
                  {copy.charts.common.to} {formatChartDate(selectionPoints.endPoint.date, locale)}
                </span>
                <strong className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}>
                  {copy.charts.benchmark.portfolio} {formatSignedPercent(selectedPortfolioChange)}
                </strong>
                <span className={selectedBenchmarkChange >= 0 ? "value-positive" : "value-negative"}>
                  {benchmarkSymbol ?? copy.charts.benchmark.benchmark} {formatSignedPercent(selectedBenchmarkChange)}
                </span>
                {selectedGap == null ? null : (
                  <span className={selectedGap >= 0 ? "value-positive" : "value-negative"}>
                    {copy.charts.benchmark.gap} {formatPercentagePoint(selectedGap)}
                  </span>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="chart-empty-state">
          <strong>{copy.charts.common.noChartData}</strong>
          <p>
            {getUnavailableMessage({
              benchmarkSymbol,
              copy: copy.charts.benchmark,
              portfolioCurrency,
              returnBasis,
              status
            })}
          </p>
        </div>
      )}
    </article>
  );
}
