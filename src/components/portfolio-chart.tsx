"use client";

import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
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

type TimeframeKey = "1W" | "1M" | "3M" | "YTD" | "1Y" | "START" | "ALL";

type ChartPoint = PortfolioTimelinePoint & {
  changeFromRangeStart: number | null;
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

type PortfolioChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    payload?: ChartPoint;
  }>;
  currency: string | null;
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

function formatChartValue(value: number, currency: string | null) {
  if (currency == null) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0
    }).format(value);
  }

  return formatCurrency(value, {
    currency,
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2
  });
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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

function getVisibleSeries(series: PortfolioTimelinePoint[], timeframe: TimeframeKey) {
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
  const padding = spread === 0 ? Math.max(Math.abs(max) * 0.05, 1) : spread * 0.12;

  return [Math.max(0, min - padding), max + padding] satisfies [number, number];
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

function PortfolioChartTooltip({ active, label, payload, currency }: PortfolioChartTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(label)}</span>
      <strong>{formatChartValue(point.value, currency)}</strong>
      {point.changeFromRangeStart == null ? null : (
        <em className={point.changeFromRangeStart >= 0 ? "value-positive" : "value-negative"}>
          {formatSignedPercent(point.changeFromRangeStart)} from range start
        </em>
      )}
    </div>
  );
}

export function PortfolioChart({ currency, series, status }: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const hasSeries = series.length > 0;
  const visibleSeries = useMemo(() => getVisibleSeries(series, timeframe), [series, timeframe]);
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstValue = visibleSeries[0]?.value ?? null;

    return visibleSeries.map((point) => ({
      ...point,
      changeFromRangeStart:
        firstValue == null ? null : calculatePercentChange(firstValue, point.value)
    }));
  }, [visibleSeries]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const firstPoint = chartData[0];
    const latestPoint = chartData[chartData.length - 1];
    const highPoint = chartData.reduce((highest, point) =>
      point.value > highest.value ? point : highest
    );
    const lowPoint = chartData.reduce((lowest, point) =>
      point.value < lowest.value ? point : lowest
    );
    const percentChange = calculatePercentChange(firstPoint.value, latestPoint.value);

    return {
      latestPoint,
      highPoint,
      lowPoint,
      percentChange
    };
  }, [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const selectionPercent =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.value, selectionPoints.endPoint.value);
  const yDomain = useMemo(
    () => getPaddedDomain(chartData.map((point) => point.value)),
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
    <article className="surface-card chart-card portfolio-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Portfolio value</p>
          <h2 className="section-title">Portfolio value history</h2>
        </div>
        <div className="chart-timeframes" aria-label="Portfolio chart timeframe">
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
            <div className="chart-stat-strip" aria-label="Portfolio value range summary">
              <div>
                <span>Range</span>
                <strong
                  className={
                    rangeStats.percentChange == null
                      ? ""
                      : rangeStats.percentChange >= 0
                        ? "value-positive"
                        : "value-negative"
                  }
                >
                  {rangeStats.percentChange == null
                    ? "-"
                    : formatSignedPercent(rangeStats.percentChange)}
                </strong>
              </div>
              <div>
                <span>Latest</span>
                <strong>{formatChartValue(rangeStats.latestPoint.value, currency)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>{formatChartValue(rangeStats.highPoint.value, currency)}</strong>
              </div>
              <div>
                <span>Low</span>
                <strong>{formatChartValue(rangeStats.lowPoint.value, currency)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseUp}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
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
                  domain={yDomain}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(10, 126, 101, 0.2)", strokeWidth: 1 }}
                  content={<PortfolioChartTooltip currency={currency} />}
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
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  fill="url(#portfolioArea)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--accent-strong)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {selectionPoints == null || selectionPercent == null ? null : (
              <div className="chart-selection-readout">
                <span>
                  {formatChartDate(selectionPoints.startPoint.date)} to{" "}
                  {formatChartDate(selectionPoints.endPoint.date)}
                </span>
                <strong className={selectionPercent >= 0 ? "value-positive" : "value-negative"}>
                  {formatSignedPercent(selectionPercent)}
                </strong>
                <span>
                  {formatChartValue(selectionPoints.startPoint.value, currency)} to{" "}
                  {formatChartValue(selectionPoints.endPoint.value, currency)}
                </span>
              </div>
            )}
          </div>
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
