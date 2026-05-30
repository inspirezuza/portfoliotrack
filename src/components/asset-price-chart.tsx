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
  YAxis,
} from "recharts";
import {
  buildTimeAxisTicks,
  formatTimeAxisTick,
  getTimeAxisDomain,
  getUtcDateTime,
} from "@/lib/charts/time-axis";
import { getRechartsPayloadPoint, type RechartsMouseState } from "@/lib/charts/recharts-state";
import { useChartTouchScrub } from "@/lib/charts/use-chart-touch-scrub";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import {
  formatAxisPrice,
  formatChartDate,
  formatPrice,
  formatSignedPercent,
} from "@/components/asset-price-chart/formatting";
import {
  TIMEFRAME_OPTIONS,
  buildAssetChartData,
  calculatePercentChange,
  getPaddedDomain,
  getRangeStats,
  getSelectionPoints,
  getUnavailableMessage,
  getVisibleHistory,
  hasSelectionSpan,
  type ChartPoint,
  type SelectionRange,
  type TimeframeKey,
} from "@/components/asset-price-chart/helpers";
import { AssetPriceSelectionReadout } from "@/components/asset-price-chart/selection-readout";
import type { AssetDetail } from "@/server/assets";

type AssetPriceChartProps = {
  asset: AssetDetail;
};

type AssetChartTooltipProps = {
  active?: boolean;
  label?: number;
  payload?: Array<{
    payload?: ChartPoint;
  }>;
  currency: string;
};

function AssetChartTooltip({ active, label, payload, currency }: AssetChartTooltipProps) {
  const point = payload?.[0]?.payload;

  if (!active || point == null || label == null) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{formatChartDate(point.date)}</span>
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
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const hasHistory = asset.marketData.priceHistory.length > 0;
  const hasAverageCostLine = asset.position.hasOpenPosition && asset.position.averageCost != null;
  const visibleHistory = useMemo(
    () =>
      getVisibleHistory(asset.marketData.priceHistory, timeframe, asset.position.firstTradeDate),
    [asset.marketData.priceHistory, asset.position.firstTradeDate, timeframe],
  );
  const chartData = useMemo<ChartPoint[]>(
    () => buildAssetChartData(visibleHistory),
    [visibleHistory],
  );
  const rangeStats = useMemo(() => getRangeStats(chartData), [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const selectionPercent =
    selectionPoints == null
      ? null
      : calculatePercentChange(selectionPoints.startPoint.close, selectionPoints.endPoint.close);
  const hasActiveSelection = hasSelectionSpan(selectionPoints);
  const yDomain = useMemo(() => {
    const values = chartData.map((point) => point.close);

    if (hasAverageCostLine && asset.position.averageCost != null) {
      values.push(asset.position.averageCost);
    }

    return getPaddedDomain(values);
  }, [asset.position.averageCost, chartData, hasAverageCostLine]);
  const xDomain = useMemo(() => getTimeAxisDomain(chartData), [chartData]);
  const xAxisTicks = useMemo(() => buildTimeAxisTicks(chartData), [chartData]);
  const xAxisSpan = xDomain == null ? 0 : xDomain[1] - xDomain[0];

  function handleChartMouseDown(state: RechartsMouseState | undefined) {
    const point = getRechartsPayloadPoint<ChartPoint>(state, chartData);

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
    const point = getRechartsPayloadPoint<ChartPoint>(state, chartData);

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

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useChartTouchScrub({
    chartData,
    xDomain,
    containerRef: chartContainerRef,
    onStart: (state) => {
      handleChartMouseDown(state);
      handleChartMouseMove(state);
    },
    onMove: handleChartMouseMove,
    onEnd: () => {
      isDraggingRef.current = false;
      setSelection(null);
    },
  });

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
                <strong>
                  {formatPrice(rangeStats.latestPoint.close, asset.instrument.currency)}
                </strong>
              </div>
              <div>
                <span>High</span>
                <strong>
                  {formatPrice(rangeStats.highPoint.close, asset.instrument.currency)}
                </strong>
              </div>
              <div>
                <span>Low</span>
                <strong>{formatPrice(rangeStats.lowPoint.close, asset.instrument.currency)}</strong>
              </div>
            </div>
          )}

          <div
            className="chart-shell"
            ref={chartContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <ResponsiveContainer height={360} key={chartRenderKey} width="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 18, left: 14, bottom: 14 }}
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
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={xDomain}
                  ticks={xAxisTicks}
                  tickFormatter={(value: number | string) =>
                    formatTimeAxisTick(value, "en-GB", xAxisSpan)
                  }
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  height={36}
                  tickMargin={8}
                  stroke="var(--muted)"
                />
                <YAxis
                  tickFormatter={(value: number) => formatAxisPrice(value)}
                  tickLine={false}
                  axisLine={false}
                  width={78}
                  domain={yDomain}
                  tickMargin={12}
                  stroke="var(--muted)"
                />
                <Tooltip
                  cursor={{ stroke: "rgba(23, 107, 85, 0.18)", strokeWidth: 1 }}
                  content={<AssetChartTooltip currency={asset.instrument.currency} />}
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
                {hasAverageCostLine ? (
                  <ReferenceLine
                    y={asset.position.averageCost ?? undefined}
                    stroke="var(--warm)"
                    strokeDasharray="6 6"
                    ifOverflow="extendDomain"
                    label={{
                      value: `Avg ${formatPrice(
                        asset.position.averageCost ?? 0,
                        asset.instrument.currency,
                      )}`,
                      fill: "var(--warm)",
                      fontSize: 12,
                      position: "insideTopLeft",
                    }}
                  />
                ) : null}
                <Area
                  isAnimationActive={false}
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
            <AssetPriceSelectionReadout
              currency={asset.instrument.currency}
              hasActiveSelection={hasActiveSelection}
              selectionPercent={selectionPercent}
              selectionPoints={selectionPoints}
            />
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
