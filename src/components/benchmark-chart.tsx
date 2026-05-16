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
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimelineStatus
} from "@/lib/portfolio/timeline";

type BenchmarkChartProps = {
  benchmarkSymbol: string | null;
  portfolioCurrency: string | null;
  series: BenchmarkTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

type TimeframeKey = "1W" | "1M" | "3M" | "YTD" | "1Y" | "START" | "ALL";

type ChartPoint = BenchmarkTimelinePoint & {
  benchmarkChangeFromRangeStart: number | null;
  portfolioChangeFromRangeStart: number | null;
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
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "START", label: "Start" },
  { key: "ALL", label: "All" }
];

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

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function getTimeframeStartDate(key: TimeframeKey, latestDate: string, sinceStartDate: string | null) {
  const latest = new Date(`${latestDate}T00:00:00.000Z`);

  if (key === "ALL") {
    return null;
  }

  if (key === "START") {
    return sinceStartDate;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD" | "START">, number> = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365
  };
  latest.setUTCDate(latest.getUTCDate() - daysByKey[key]);

  return latest.toISOString().slice(0, 10);
}

function getVisibleSeries(series: BenchmarkTimelinePoint[], timeframe: TimeframeKey) {
  const latestPoint = series[series.length - 1];
  const sinceStartDate = series[0]?.date ?? null;

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date, sinceStartDate);
  const filteredSeries =
    startDate == null ? series : series.filter((point) => point.date >= startDate);

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

function getChartPoint(state: ChartMouseState | undefined) {
  return state?.activePayload?.[0]?.payload ?? null;
}

function BenchmarkChartTooltip({ active, label, payload }: BenchmarkChartTooltipProps) {
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
          item.dataKey === "portfolio"
            ? point.portfolioChangeFromRangeStart
            : point.benchmarkChangeFromRangeStart;

        return (
          <div className="chart-tooltip-row" key={item.dataKey}>
            <span>{item.name ?? item.dataKey}</span>
            <strong>{formatIndexedReturn(value)}</strong>
            {change == null ? null : (
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
  portfolioCurrency,
  series,
  status
}: BenchmarkChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const hasSeries = series.length > 0;
  const visibleSeries = useMemo(() => getVisibleSeries(series, timeframe), [series, timeframe]);
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstPoint = visibleSeries[0] ?? null;

    return visibleSeries.map((point) => ({
      ...point,
      benchmarkChangeFromRangeStart:
        firstPoint == null
          ? null
          : calculatePercentChange(firstPoint.benchmark, point.benchmark),
      portfolioChangeFromRangeStart:
        firstPoint == null
          ? null
          : calculatePercentChange(firstPoint.portfolio, point.portfolio)
    }));
  }, [visibleSeries]);
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
  const selectedPortfolioChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.portfolio, selectionPoints.endPoint.portfolio);
  const selectedBenchmarkChange =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.benchmark, selectionPoints.endPoint.benchmark);
  const yDomain = useMemo(
    () =>
      getPaddedDomain(
        chartData.flatMap((point) => [point.portfolio, point.benchmark])
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
      currentSelection == null
        ? null
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
                <span>Gap</span>
                <strong
                  className={
                    rangeStats.gap == null
                      ? ""
                      : rangeStats.gap >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.gap == null ? "-" : formatSignedPercent(rangeStats.gap)}
                </strong>
              </div>
              <div>
                <span>Latest index</span>
                <strong>{formatIndexedReturn(rangeStats.latestPoint.portfolio)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
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
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatIndexedReturn(value)}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  domain={yDomain}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(17, 27, 23, 0.16)", strokeWidth: 1 }}
                  content={<BenchmarkChartTooltip />}
                />
                {selection == null || selection.startDate === selection.endDate ? null : (
                  <ReferenceArea
                    x1={selection.startDate}
                    x2={selection.endDate}
                    stroke="rgba(23, 107, 85, 0.18)"
                    fill="rgba(23, 107, 85, 0.10)"
                    ifOverflow="hidden"
                  />
                )}
                <Line
                  type="linear"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--accent-strong)" }}
                />
                <Line
                  type="linear"
                  dataKey="benchmark"
                  name={benchmarkSymbol ?? "Benchmark"}
                  stroke="var(--warm)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--warm)" }}
                />
              </LineChart>
            </ResponsiveContainer>
            {selectionPoints == null ||
            selectedPortfolioChange == null ||
            selectedBenchmarkChange == null ? null : (
              <div className="chart-selection-readout">
                <span>
                  {formatChartDate(selectionPoints.startPoint.date)} to{" "}
                  {formatChartDate(selectionPoints.endPoint.date)}
                </span>
                <strong className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}>
                  Portfolio {formatSignedPercent(selectedPortfolioChange)}
                </strong>
                <span>
                  {benchmarkSymbol ?? "Benchmark"} {formatSignedPercent(selectedBenchmarkChange)}
                </span>
              </div>
            )}
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
