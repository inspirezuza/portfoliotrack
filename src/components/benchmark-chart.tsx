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
import { formatPercentRatio } from "@/lib/format";
import type {
  BenchmarkComparisonBasis,
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimelineStatus
} from "@/lib/portfolio/timeline";

type BenchmarkChartProps = {
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolioCurrency: string | null;
  series: BenchmarkTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "START" | "ALL";
type PerformanceMode = "INDEXED" | "GAP" | "DRAWDOWN";

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

const TIMEFRAME_OPTIONS: Array<{
  key: TimeframeKey;
  label: string;
}> = [
  { key: "1D", label: "1D" },
  { key: "5D", label: "5D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "START", label: "Start" },
  { key: "ALL", label: "All" }
];

const PERFORMANCE_MODE_OPTIONS: Array<{
  key: PerformanceMode;
  label: string;
}> = [
  { key: "INDEXED", label: "Indexed" },
  { key: "GAP", label: "Gap" },
  { key: "DRAWDOWN", label: "Drawdown" }
];

function parseChartDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

function isIntradayDate(value: string) {
  return value.includes("T");
}

function formatChartDate(value: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC"
  }).format(parseChartDate(value));
}

function formatIndexedReturn(value: number) {
  return formatPercentRatio(value / 100 - 1, {
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

function formatModeValue(value: number, mode: PerformanceMode) {
  if (mode === "INDEXED") {
    return formatIndexedReturn(value);
  }

  return mode === "GAP" ? formatPercentagePoint(value) : formatSignedPercent(value);
}

function getModeCopy(mode: PerformanceMode) {
  switch (mode) {
    case "GAP":
      return {
        portfolioName: "Portfolio gap",
        benchmarkName: "Benchmark baseline",
        yAxisLabel: "Gap"
      };
    case "DRAWDOWN":
      return {
        portfolioName: "Portfolio drawdown",
        benchmarkName: "Benchmark drawdown",
        yAxisLabel: "Drawdown"
      };
    default:
      return {
        portfolioName: "Portfolio",
        benchmarkName: "Benchmark",
        yAxisLabel: "Return"
      };
  }
}

function getBasisLabel({
  benchmarkCurrency,
  comparisonBasis,
  portfolioCurrency
}: {
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolioCurrency: string | null;
}) {
  if (comparisonBasis === "same-currency") {
    return portfolioCurrency == null ? "Same-currency return" : `${portfolioCurrency} return`;
  }

  if (comparisonBasis === "native-currency-return") {
    return benchmarkCurrency == null
      ? "Native-currency benchmark return"
      : `${benchmarkCurrency} benchmark return, compared by %`;
  }

  return "Performance return";
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
  mode,
  payload
}: BenchmarkChartTooltipProps & { mode: PerformanceMode }) {
  const point = payload?.[0]?.payload;

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(label)}</span>
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
            <strong>{formatModeValue(value, mode)}</strong>
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
  benchmarkSymbol,
  benchmarkCurrency,
  comparisonBasis,
  portfolioCurrency,
  series,
  status
}: BenchmarkChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [mode, setMode] = useState<PerformanceMode>("INDEXED");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const hasSeries = series.length > 0;
  const visibleSeries = useMemo(() => getVisibleSeries(series, timeframe), [series, timeframe]);
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
  const modeCopy = getModeCopy(mode);
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
          <p className="eyebrow">Performance</p>
          <h2 className="section-title">
            {benchmarkSymbol == null
              ? "Performance vs benchmark"
              : `Performance vs ${benchmarkSymbol}`}
          </h2>
          {hasSeries ? (
            <p className="chart-subtitle">
              {getBasisLabel({ benchmarkCurrency, comparisonBasis, portfolioCurrency })}
            </p>
          ) : null}
        </div>
        <div className="chart-control-stack">
          <div className="chart-view-modes" aria-label="Benchmark performance mode">
            {PERFORMANCE_MODE_OPTIONS.map((option) => (
              <button
                aria-pressed={mode === option.key}
                className={mode === option.key ? "active" : ""}
                key={option.key}
                onClick={() => {
                  setMode(option.key);
                  setSelection(null);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="chart-timeframes" aria-label="Benchmark chart timeframe">
            {TIMEFRAME_OPTIONS.map((option) => (
              <button
                aria-pressed={timeframe === option.key}
                className={timeframe === option.key ? "active" : ""}
                key={option.key}
                onClick={() => {
                  setTimeframe(option.key);
                  setSelection(null);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasSeries ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <div className="chart-stat-strip" aria-label="Benchmark comparison range summary">
              <div>
                <span>Portfolio</span>
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
                <span>{benchmarkSymbol ?? "Benchmark"}</span>
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
                <span>{mode === "GAP" ? "Latest gap" : "Gap"}</span>
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
                <strong>{formatModeValue(rangeStats.latestPoint.portfolioDisplay, mode)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 18, left: 14, bottom: 14 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseUp}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  height={36}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatModeValue(value, mode)}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  domain={yDomain}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(17, 27, 23, 0.16)", strokeWidth: 1 }}
                  content={<BenchmarkChartTooltip mode={mode} />}
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
                <span>Drag across the chart to compare</span>
              ) : (
                <>
                <span>
                  {formatChartDate(selectionPoints.startPoint.date)} to{" "}
                  {formatChartDate(selectionPoints.endPoint.date)}
                </span>
                <strong className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}>
                  Portfolio {formatSignedPercent(selectedPortfolioChange)}
                </strong>
                <span className={selectedBenchmarkChange >= 0 ? "value-positive" : "value-negative"}>
                  {benchmarkSymbol ?? "Benchmark"} {formatSignedPercent(selectedBenchmarkChange)}
                </span>
                {selectedGap == null ? null : (
                  <span className={selectedGap >= 0 ? "value-positive" : "value-negative"}>
                    Gap {formatPercentagePoint(selectedGap)}
                  </span>
                )}
                </>
              )}
            </div>
          </div>
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
