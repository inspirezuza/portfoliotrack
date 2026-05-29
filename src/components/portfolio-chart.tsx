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
import type {
  PortfolioBenchmarkTimelineStatus,
  PortfolioTimelinePoint,
} from "@/lib/portfolio/timeline";
import {
  buildTimeAxisTicks,
  formatTimeAxisTick,
  getTimeAxisDomain,
  getUtcDateTime,
} from "@/lib/charts/time-axis";
import { getRechartsPayloadPoint, type RechartsMouseState } from "@/lib/charts/recharts-state";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import {
  TIMEFRAME_OPTIONS,
  buildPortfolioChartData,
  calculatePercentChange,
  formatAxisValue,
  formatChartDate,
  formatChartValue,
  formatSignedPercent,
  getPaddedDomain,
  getRangeStats,
  getSelectionPoints,
  getUnavailableMessage,
  getVisibleSeries,
  hasSelectionSpan,
  type ChartPoint,
  type SelectionRange,
  type TimeframeKey,
} from "@/components/portfolio-chart/helpers";

type PortfolioChartProps = {
  currency: string | null;
  language: UiLanguage;
  series: PortfolioTimelinePoint[];
  status: PortfolioBenchmarkTimelineStatus;
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
  const chartData = useMemo<ChartPoint[]>(
    () => buildPortfolioChartData(visibleSeries),
    [visibleSeries],
  );
  const rangeStats = useMemo(() => getRangeStats(chartData), [chartData]);
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

  function handleChartMouseDown(state: RechartsMouseState | undefined) {
    const point = getRechartsPayloadPoint<ChartPoint>(state);

    if (point == null) {
      return;
    }

    isDraggingRef.current = true;
    setSelection({
      startDate: point.date,
      endDate: point.date,
    });
  }

  function handleChartMouseMove(state: RechartsMouseState | undefined) {
    const point = getRechartsPayloadPoint<ChartPoint>(state);

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
