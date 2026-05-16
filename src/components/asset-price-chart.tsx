"use client";

import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { AssetDetail } from "@/server/assets";

type AssetPriceChartProps = {
  asset: AssetDetail;
};

type TimeframeKey = "1W" | "1M" | "3M" | "YTD" | "1Y" | "START" | "ALL";

type ChartPoint = AssetDetail["marketData"]["priceHistory"][number] & {
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

type AssetChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    payload?: ChartPoint;
  }>;
  currency: string;
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
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCompactChartDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPrice(value: number, currency: string) {
  return formatCurrency(value, {
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4
  });
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getUnavailableMessage(asset: AssetDetail) {
  return asset.marketData.historyUnavailableReason ?? "No price history is available for this chart yet.";
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

function getVisibleHistory(
  history: AssetDetail["marketData"]["priceHistory"],
  timeframe: TimeframeKey,
  sinceStartDate: string | null
) {
  const latestPoint = history[history.length - 1];

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date, sinceStartDate);
  const filteredHistory =
    startDate == null ? history : history.filter((point) => point.date >= startDate);

  return filteredHistory.length > 0 ? filteredHistory : history;
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

function AssetChartTooltip({ active, label, payload, currency }: AssetChartTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(label)}</span>
      <strong>{formatPrice(point.close, currency)}</strong>
      {point.changeFromRangeStart == null ? null : (
        <em className={point.changeFromRangeStart >= 0 ? "value-positive" : "value-negative"}>
          {formatSignedPercent(point.changeFromRangeStart)} from range start
        </em>
      )}
    </div>
  );
}

export function AssetPriceChart({ asset }: AssetPriceChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const hasHistory = asset.marketData.priceHistory.length > 0;
  const hasAverageCostLine = asset.position.hasOpenPosition && asset.position.averageCost != null;
  const visibleHistory = useMemo(
    () =>
      getVisibleHistory(
        asset.marketData.priceHistory,
        timeframe,
        asset.position.firstTradeDate
      ),
    [asset.marketData.priceHistory, asset.position.firstTradeDate, timeframe]
  );
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstClose = visibleHistory[0]?.close ?? null;

    return visibleHistory.map((point) => ({
      ...point,
      changeFromRangeStart:
        firstClose == null ? null : calculatePercentChange(firstClose, point.close)
    }));
  }, [visibleHistory]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const firstPoint = chartData[0];
    const latestPoint = chartData[chartData.length - 1];
    const highPoint = chartData.reduce((highest, point) =>
      point.close > highest.close ? point : highest
    );
    const lowPoint = chartData.reduce((lowest, point) =>
      point.close < lowest.close ? point : lowest
    );
    const percentChange = calculatePercentChange(firstPoint.close, latestPoint.close);

    return {
      firstPoint,
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
      : calculatePercentChange(selectionPoints.startPoint.close, selectionPoints.endPoint.close);
  const yDomain = useMemo(() => {
    const values = chartData.map((point) => point.close);

    if (hasAverageCostLine && asset.position.averageCost != null) {
      values.push(asset.position.averageCost);
    }

    return getPaddedDomain(values);
  }, [asset.position.averageCost, chartData, hasAverageCostLine]);

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
    <article className="surface-card chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">Performance</p>
          <h2 className="section-title">
            {asset.dr == null
              ? "Price versus average cost"
              : `${asset.instrument.symbol} and parent-share equivalent`}
          </h2>
        </div>
        <div className="chart-timeframes" aria-label="Chart timeframe">
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

      {hasHistory ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <div className="chart-stat-strip" aria-label="Selected price range summary">
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
                <strong>{formatPrice(rangeStats.latestPoint.close, asset.instrument.currency)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>{formatPrice(rangeStats.highPoint.close, asset.instrument.currency)}</strong>
              </div>
              <div>
                <span>Low</span>
                <strong>{formatPrice(rangeStats.lowPoint.close, asset.instrument.currency)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseUp}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
                <defs>
                  <linearGradient id="assetArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(23, 107, 85, 0.30)" />
                    <stop offset="100%" stopColor="rgba(23, 107, 85, 0.04)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  stroke="var(--muted)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatPrice(value, asset.instrument.currency)}
                  tickLine={false}
                  axisLine={false}
                  width={92}
                  domain={yDomain}
                  stroke="var(--muted)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(23, 107, 85, 0.18)", strokeWidth: 1 }}
                  content={<AssetChartTooltip currency={asset.instrument.currency} />}
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
                {hasAverageCostLine ? (
                  <ReferenceLine
                    y={asset.position.averageCost ?? undefined}
                    stroke="var(--warm)"
                    strokeDasharray="6 6"
                    ifOverflow="extendDomain"
                    label={{
                      value: `Avg ${formatPrice(
                        asset.position.averageCost ?? 0,
                        asset.instrument.currency
                      )}`,
                      fill: "var(--warm)",
                      fontSize: 12,
                      position: "insideTopLeft"
                    }}
                  />
                ) : null}
                <Area
                  type="linear"
                  dataKey="close"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  fill="url(#assetArea)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--accent)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {selectionPoints == null || selectionPercent == null ? null : (
              <div className="chart-selection-readout">
                <span>
                  {formatCompactChartDate(selectionPoints.startPoint.date)} to{" "}
                  {formatCompactChartDate(selectionPoints.endPoint.date)}
                </span>
                <strong className={selectionPercent >= 0 ? "value-positive" : "value-negative"}>
                  {formatSignedPercent(selectionPercent)}
                </strong>
                <span>
                  {formatPrice(selectionPoints.startPoint.close, asset.instrument.currency)} to{" "}
                  {formatPrice(selectionPoints.endPoint.close, asset.instrument.currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="chart-empty-state">
          <p>{getUnavailableMessage(asset)}</p>
        </div>
      )}
    </article>
  );
}
