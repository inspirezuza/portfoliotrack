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
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type {
  PortfolioBenchmarkTimelineStatus,
  PortfolioTimelinePoint,
} from "@/lib/portfolio/timeline";
import {
  attachTimeAxis,
  buildTimeAxisTicks,
  formatTimeAxisTick,
  getTimeAxisDomain,
  getUtcDateTime,
  isDailyPoint,
  isIntradayDate,
  isIntradayPoint,
  parseChartDate,
  type TimeAxisPoint,
} from "@/lib/charts/time-axis";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";

type PortfolioChartProps = {
  currency: string | null;
  language: UiLanguage;
  series: PortfolioTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
};

type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

type ChartPoint = PortfolioTimelinePoint &
  TimeAxisPoint & {
    changeFromRangeStart: number | null;
  };

type ChartMouseState = unknown;

type SelectionRange = {
  startDate: string;
  endDate: string;
};

type PortfolioChartTooltipProps = {
  active?: boolean;
  label?: number;
  payload?: Array<{
    payload?: ChartPoint;
  }>;
  currency: string | null;
  language: UiLanguage;
};

const TIMEFRAME_OPTIONS: TimeframeKey[] = ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

function formatChartDate(value: string, locale: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(parseChartDate(value));
}

function formatChartValue(value: number, currency: string | null, locale: string) {
  if (currency == null) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return formatCurrency(value, {
    currency,
    locale,
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function formatAxisValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getUnavailableMessage(
  status: PortfolioBenchmarkTimelineStatus,
  copy: ReturnType<typeof getUiCopy>["charts"]["portfolio"],
) {
  switch (status) {
    case "no-transactions":
      return copy.unavailable.noTransactions;
    case "mixed-currency":
      return copy.unavailable.mixedCurrency;
    case "missing-portfolio-history":
      return copy.unavailable.missingPortfolioHistory;
    default:
      return copy.unavailable.default;
  }
}

function getTimeframeStartDate(key: TimeframeKey, latestDate: string) {
  const latest = parseChartDate(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD">, number> = {
    "1D": 1,
    "5D": 5,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
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

function getVisibleSeries(series: PortfolioTimelinePoint[], timeframe: TimeframeKey) {
  const latestPoint = series[series.length - 1];

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredSeries =
    startTime == null ? series : series.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradaySeries = filteredSeries.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradaySeries.length >= 2) {
      return preferredIntradaySeries;
    }

    const intradaySeries = filteredSeries.filter(isIntradayPoint);

    if (intradaySeries.length >= 2) {
      return intradaySeries;
    }
  } else {
    const dailySeries = filteredSeries.filter(isDailyPoint);

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
    endPoint,
  };
}

function hasSelectionSpan(points: ReturnType<typeof getSelectionPoints>) {
  return points != null && points.startPoint.date !== points.endPoint.date;
}

function getChartPoint(state: ChartMouseState) {
  return (
    (state as { activePayload?: Array<{ payload?: ChartPoint }> } | undefined)?.activePayload?.[0]
      ?.payload ?? null
  );
}

function PortfolioChartTooltip({
  active,
  label,
  language,
  payload,
  currency,
}: PortfolioChartTooltipProps) {
  const point = payload?.[0]?.payload;
  const copy = getUiCopy(language).charts.common;
  const locale = getUiLocale(language);

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(point.date, locale)}</span>
      <strong>{formatChartValue(point.value, currency, locale)}</strong>
      {point.changeFromRangeStart == null ? null : (
        <em className={point.changeFromRangeStart >= 0 ? "value-positive" : "value-negative"}>
          {formatSignedPercent(point.changeFromRangeStart)} {copy.fromRangeStart}
        </em>
      )}
    </div>
  );
}

export function PortfolioChart({ currency, language, series, status }: PortfolioChartProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const isDraggingRef = useRef(false);
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const hasSeries = series.length > 0;
  const visibleSeries = useMemo(() => getVisibleSeries(series, timeframe), [series, timeframe]);
  const chartData = useMemo<ChartPoint[]>(() => {
    const firstValue = visibleSeries[0]?.value ?? null;

    return attachTimeAxis(visibleSeries).map((point) => ({
      ...point,
      changeFromRangeStart:
        firstValue == null ? null : calculatePercentChange(firstValue, point.value),
    }));
  }, [visibleSeries]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const firstPoint = chartData[0];
    const latestPoint = chartData[chartData.length - 1];
    const highPoint = chartData.reduce((highest, point) =>
      point.value > highest.value ? point : highest,
    );
    const lowPoint = chartData.reduce((lowest, point) =>
      point.value < lowest.value ? point : lowest,
    );
    const percentChange = calculatePercentChange(firstPoint.value, latestPoint.value);

    return {
      latestPoint,
      highPoint,
      lowPoint,
      percentChange,
    };
  }, [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const selectionPercent =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.value, selectionPoints.endPoint.value);
  const hasActiveSelection = hasSelectionSpan(selectionPoints);
  const yDomain = useMemo(
    () => getPaddedDomain(chartData.map((point) => point.value)),
    [chartData],
  );
  const xDomain = useMemo(() => getTimeAxisDomain(chartData), [chartData]);
  const xAxisTicks = useMemo(() => buildTimeAxisTicks(chartData), [chartData]);
  const xAxisSpan = xDomain == null ? 0 : xDomain[1] - xDomain[0];

  function handleChartMouseDown(state: ChartMouseState | undefined) {
    const point = getChartPoint(state);

    if (point == null) {
      return;
    }

    isDraggingRef.current = true;
    setSelection({
      startDate: point.date,
      endDate: point.date,
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
            endDate: point.date,
          },
    );
  }

  function handleChartMouseUp() {
    isDraggingRef.current = false;
  }

  return (
    <article className="surface-card chart-card portfolio-chart-card">
      <div className="chart-card-header">
        <div>
          <p className="eyebrow">{copy.charts.portfolio.eyebrow}</p>
          <h2 className="section-title">{copy.charts.portfolio.title}</h2>
        </div>
        <div className="chart-timeframes" aria-label={copy.charts.portfolio.timeframe}>
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

      {hasSeries ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <div className="chart-stat-strip" aria-label={copy.charts.portfolio.rangeSummary}>
              <div>
                <span>{copy.charts.common.range}</span>
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
                <span>{copy.charts.common.latest}</span>
                <strong>{formatChartValue(rangeStats.latestPoint.value, currency, locale)}</strong>
              </div>
              <div>
                <span>{copy.charts.common.high}</span>
                <strong>{formatChartValue(rangeStats.highPoint.value, currency, locale)}</strong>
              </div>
              <div>
                <span>{copy.charts.common.low}</span>
                <strong>{formatChartValue(rangeStats.lowPoint.value, currency, locale)}</strong>
              </div>
            </div>
          )}

          <div className="chart-shell" ref={chartContainerRef}>
            <ResponsiveContainer height={300} key={chartRenderKey} width="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 10, left: 4, bottom: 8 }}
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
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={xDomain}
                  ticks={xAxisTicks}
                  tickFormatter={(value: number | string) =>
                    formatTimeAxisTick(value, locale, xAxisSpan)
                  }
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  height={36}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatAxisValue(value, locale)}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={yDomain}
                  tickCount={5}
                  tickMargin={12}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(10, 126, 101, 0.2)", strokeWidth: 1 }}
                  content={<PortfolioChartTooltip currency={currency} language={language} />}
                />
                {!hasActiveSelection || selection == null ? null : (
                  <ReferenceArea
                    x1={getUtcDateTime(selection.startDate)}
                    x2={getUtcDateTime(selection.endDate)}
                    stroke="rgba(23, 107, 85, 0.18)"
                    fill="rgba(23, 107, 85, 0.10)"
                    ifOverflow="hidden"
                  />
                )}
                <Area
                  isAnimationActive={false}
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
            <div
              className={
                hasActiveSelection && selectionPoints != null && selectionPercent != null
                  ? "chart-selection-readout"
                  : "chart-selection-readout chart-selection-readout-idle"
              }
            >
              {!hasActiveSelection || selectionPoints == null || selectionPercent == null ? (
                <span>{copy.charts.common.dragToCompare}</span>
              ) : (
                <>
                  <span>
                    {formatChartDate(selectionPoints.startPoint.date, locale)}{" "}
                    {copy.charts.common.to} {formatChartDate(selectionPoints.endPoint.date, locale)}
                  </span>
                  <strong className={selectionPercent >= 0 ? "value-positive" : "value-negative"}>
                    {formatSignedPercent(selectionPercent)}
                  </strong>
                  <span>
                    {formatChartValue(selectionPoints.startPoint.value, currency, locale)}{" "}
                    {copy.charts.common.to}{" "}
                    {formatChartValue(selectionPoints.endPoint.value, currency, locale)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="chart-empty-state">
          <strong>{copy.charts.common.noChartData}</strong>
          <p>{getUnavailableMessage(status, copy.charts.portfolio)}</p>
        </div>
      )}
    </article>
  );
}
