"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
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
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import { BenchmarkComparisonPicker } from "@/components/benchmark-comparison-picker";
import {
  buildBenchmarkChartDataWithOverlays,
  buildBenchmarkComparisonItems,
  getBenchmarkYAxisValues,
  getInitialSelectedComparisonSymbols,
  getOverlayDataKey,
  getRoundedPercentAxis,
  getVisibleOverlayPoints,
  mergeOverlays,
  mergeQuotes,
} from "@/components/benchmark-chart/chart-helpers";
import {
  PERFORMANCE_MODE_OPTIONS,
  RETURN_BASIS_OPTIONS,
  TIMEFRAME_OPTIONS,
  getSelectionChangeSummary,
  getSelectionPoints,
  getVisibleSeries,
  hasSelectionSpan,
  type SelectionRange,
} from "@/components/benchmark-chart/chart-selection";
import { BenchmarkChartTooltip } from "@/components/benchmark-chart/chart-tooltip";
import {
  formatAbsoluteReturn,
  formatChartDate,
  formatModeValue,
  formatPercentagePoint,
  formatPerformanceMoney,
  formatSeriesPointValue,
  formatSignedPercent,
  getAbsoluteSummaryMessage,
  getBasisLabel,
  getSeriesChangeValue,
  getUnavailableMessage,
  getValueClassName,
  type BenchmarkPerformanceSummaryStatus,
} from "@/components/benchmark-chart/formatting";
import type {
  ChartPoint,
  PerformanceMode,
  ReturnBasis,
  TimeframeKey,
} from "@/components/benchmark-chart/types";
import type {
  BenchmarkComparisonBasis,
  PortfolioBenchmarkTimelineStatus,
} from "@/lib/portfolio/timeline";
import type { PortfolioPerformanceSeries } from "@/lib/portfolio/performance-series";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";

type BenchmarkChartProps = {
  benchmarkOverlays: DashboardBenchmarkOverlay[];
  benchmarkQuotes: DashboardBenchmarkQuote[];
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  language: UiLanguage;
  performanceSeries: PortfolioPerformanceSeries;
  performanceSummary: BenchmarkPerformanceSummary;
  portfolioCurrency: string | null;
  status: PortfolioBenchmarkTimelineStatus;
};

type BenchmarkPerformanceSummary = {
  status: BenchmarkPerformanceSummaryStatus;
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

type BenchmarkComparisonPayload = {
  overlay: DashboardBenchmarkOverlay;
  quote: DashboardBenchmarkQuote;
};

export function BenchmarkChart({
  benchmarkOverlays,
  benchmarkQuotes,
  benchmarkSymbol,
  benchmarkCurrency,
  comparisonBasis,
  language,
  performanceSeries,
  performanceSummary,
  portfolioCurrency,
  status,
}: BenchmarkChartProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("ALL");
  const [returnBasis, setReturnBasis] = useState<ReturnBasis>("TWR");
  const [mode, setMode] = useState<PerformanceMode>("INDEXED");
  const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [comparisonOverlayState, setComparisonOverlayState] = useState(benchmarkOverlays);
  const [comparisonQuoteState, setComparisonQuoteState] = useState(benchmarkQuotes);
  const [selectedComparisonSymbols, setSelectedComparisonSymbols] = useState<string[]>(() =>
    getInitialSelectedComparisonSymbols(benchmarkOverlays, benchmarkSymbol),
  );
  const isDraggingRef = useRef(false);
  const { chartContainerRef, chartRenderKey } = useChartVisibilityKey();
  const activeSeries =
    returnBasis === "ABSOLUTE"
      ? performanceSeries.absolute
      : returnBasis === "MWR"
        ? performanceSeries.mwr
        : performanceSeries.twr;
  const hasSeries = activeSeries.length > 0;
  const hasAnySeries =
    performanceSeries.twr.length > 0 ||
    performanceSeries.absolute.length > 0 ||
    performanceSeries.mwr.length > 0;
  const returnBasisCopy = copy.charts.benchmark.returnBasis[returnBasis];
  const absoluteSummaryMessage = getAbsoluteSummaryMessage({
    copy: copy.charts.benchmark,
    status: performanceSummary.status,
  });
  const shouldShowAbsoluteSummary = performanceSummary.status !== "no-transactions";
  useEffect(() => {
    if (returnBasis !== "TWR" && mode === "DRAWDOWN") {
      setMode("INDEXED");
      setHoverPoint(null);
      setSelection(null);
    }
  }, [mode, returnBasis]);
  useEffect(() => {
    setComparisonOverlayState(benchmarkOverlays);
    setComparisonQuoteState(benchmarkQuotes);
    setSelectedComparisonSymbols(
      getInitialSelectedComparisonSymbols(benchmarkOverlays, benchmarkSymbol),
    );
    setHoverPoint(null);
    setSelection(null);
  }, [benchmarkOverlays, benchmarkQuotes, benchmarkSymbol]);
  const visibleSeries = useMemo(
    () => getVisibleSeries(activeSeries, timeframe),
    [activeSeries, timeframe],
  );
  const comparisonOverlays = useMemo(
    () => comparisonOverlayState.filter((overlay) => overlay.points.length > 0),
    [comparisonOverlayState],
  );
  const selectedOverlays = useMemo(
    () =>
      selectedComparisonSymbols
        .map((symbol) => comparisonOverlays.find((overlay) => overlay.symbol === symbol) ?? null)
        .filter((overlay): overlay is DashboardBenchmarkOverlay => overlay != null),
    [comparisonOverlays, selectedComparisonSymbols],
  );
  const shouldShowOverlayComparisons = mode === "INDEXED";
  const visibleOverlayPointsBySymbol = useMemo(() => {
    const latestPoint = visibleSeries[visibleSeries.length - 1] ?? null;

    if (latestPoint == null) {
      return new Map<string, DashboardBenchmarkOverlay["points"]>();
    }

    return new Map(
      comparisonOverlays.map((overlay) => [
        overlay.symbol,
        getVisibleOverlayPoints(overlay.points, timeframe, latestPoint.date),
      ]),
    );
  }, [comparisonOverlays, timeframe, visibleSeries]);
  const chartData = useMemo<ChartPoint[]>(() => {
    return buildBenchmarkChartDataWithOverlays({
      mode,
      returnBasis,
      selectedOverlays,
      shouldShowOverlayComparisons,
      visibleOverlayPointsBySymbol,
      visibleSeries,
    });
  }, [
    mode,
    returnBasis,
    selectedOverlays,
    shouldShowOverlayComparisons,
    visibleOverlayPointsBySymbol,
    visibleSeries,
  ]);
  const basisReturn = useMemo(() => {
    const latestPoint = chartData[chartData.length - 1] ?? null;

    return latestPoint?.portfolioReturn ?? null;
  }, [chartData]);
  const rangeStats = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const latestPoint = chartData[chartData.length - 1];

    return {
      latestPoint,
      portfolioChange: latestPoint.portfolioReturn,
      benchmarkChange: latestPoint.benchmarkReturn,
      gap: latestPoint.gap,
    };
  }, [chartData]);
  const selectionPoints = getSelectionPoints(chartData, selection);
  const hasActiveSelection = hasSelectionSpan(selectionPoints);
  const {
    portfolioChange: selectedPortfolioChange,
    benchmarkChange: selectedBenchmarkChange,
    gap: selectedGap,
  } = getSelectionChangeSummary({ points: selectionPoints, returnBasis });
  const modeCopy =
    mode === "INDEXED"
      ? {
          portfolioName: returnBasisCopy.portfolioName,
          benchmarkName: copy.charts.benchmark.modeCopy.INDEXED.benchmarkName,
          yAxisLabel: returnBasisCopy.yAxisLabel,
        }
      : copy.charts.benchmark.modeCopy[mode];
  const shouldShowPrimaryBenchmarkLine = mode !== "INDEXED" || !shouldShowOverlayComparisons;
  const yAxis = useMemo(
    () =>
      getRoundedPercentAxis(
        getBenchmarkYAxisValues({
          chartData,
          mode,
          selectedOverlaySymbols: selectedOverlays.map((overlay) => overlay.symbol),
          shouldShowOverlayComparisons,
          shouldShowPrimaryBenchmarkLine,
        }),
      ),
    [
      chartData,
      mode,
      selectedOverlays,
      shouldShowOverlayComparisons,
      shouldShowPrimaryBenchmarkLine,
    ],
  );
  const xDomain = useMemo(() => getTimeAxisDomain(chartData), [chartData]);
  const xAxisTicks = useMemo(() => buildTimeAxisTicks(chartData), [chartData]);
  const xAxisSpan = xDomain == null ? 0 : xDomain[1] - xDomain[0];
  const readoutPoint = hoverPoint ?? rangeStats?.latestPoint ?? null;
  const comparisonItems = useMemo(
    () =>
      buildBenchmarkComparisonItems({
        benchmarkSymbol,
        overlays: comparisonOverlays,
        quotes: comparisonQuoteState,
        returnBasis,
        selectedSymbols: selectedComparisonSymbols,
        visibleOverlayPointsBySymbol,
        visibleSeries,
      }),
    [
      benchmarkSymbol,
      comparisonOverlays,
      comparisonQuoteState,
      returnBasis,
      selectedComparisonSymbols,
      visibleOverlayPointsBySymbol,
      visibleSeries,
    ],
  );

  function handleComparisonToggle(symbol: string) {
    setSelectedComparisonSymbols((currentSymbols) =>
      currentSymbols.includes(symbol)
        ? currentSymbols.filter((currentSymbol) => currentSymbol !== symbol)
        : [...currentSymbols, symbol],
    );
    setHoverPoint(null);
    setSelection(null);
  }

  function handleComparisonAdd({ overlay, quote }: BenchmarkComparisonPayload) {
    setComparisonOverlayState((currentOverlays) => mergeOverlays(currentOverlays, overlay));
    setComparisonQuoteState((currentQuotes) => mergeQuotes(currentQuotes, quote));
    setSelectedComparisonSymbols((currentSymbols) =>
      currentSymbols.includes(overlay.symbol)
        ? currentSymbols
        : [...currentSymbols, overlay.symbol],
    );
    setHoverPoint(null);
    setSelection(null);
  }

  function handleComparisonClear() {
    setSelectedComparisonSymbols([]);
    setHoverPoint(null);
    setSelection(null);
  }

  function ensurePrimaryBenchmarkSelected() {
    if (
      benchmarkSymbol == null ||
      !comparisonOverlays.some((overlay) => overlay.symbol === benchmarkSymbol)
    ) {
      return;
    }

    setSelectedComparisonSymbols((currentSymbols) =>
      currentSymbols.includes(benchmarkSymbol)
        ? currentSymbols
        : [...currentSymbols, benchmarkSymbol],
    );
  }

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

    if (point != null) {
      setHoverPoint(point);
    }

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

  function handleChartMouseLeave() {
    isDraggingRef.current = false;
    setHoverPoint(null);
  }

  function renderSeriesReadoutRow({
    change,
    markerClassName,
    markerColor,
    name,
    onRemove,
    removeLabel,
    value,
  }: {
    change: number;
    markerClassName?: string;
    markerColor?: string;
    name: string;
    onRemove?: () => void;
    removeLabel?: string;
    value: number;
  }) {
    const toneClassName = getValueClassName(change);

    return (
      <div className="chart-series-readout-row">
        <span
          className={["chart-series-marker", markerClassName].filter(Boolean).join(" ")}
          style={markerColor == null ? undefined : { backgroundColor: markerColor }}
          aria-hidden="true"
        />
        <strong>{name}</strong>
        <span className={`chart-series-percent-chip ${toneClassName}`}>
          {formatSeriesPointValue(value, mode, locale)}
        </span>
        {onRemove == null ? (
          <span className="chart-series-remove-spacer" aria-hidden="true" />
        ) : (
          <button
            aria-label={removeLabel}
            className="chart-series-remove-button"
            onClick={onRemove}
            type="button"
          >
            x
          </button>
        )}
      </div>
    );
  }

  function renderChartControls(className: string) {
    return (
      <div className={className}>
        <div className="chart-mode-row">
          <div className="chart-view-modes" aria-label={copy.charts.benchmark.performanceMode}>
            {PERFORMANCE_MODE_OPTIONS.map((option) => (
              <button
                aria-pressed={mode === option}
                className={mode === option ? "active" : ""}
                disabled={returnBasis !== "TWR" && option === "DRAWDOWN"}
                key={option}
                onClick={() => {
                  if (returnBasis !== "TWR" && option === "DRAWDOWN") {
                    return;
                  }
                  if (option !== "INDEXED") {
                    ensurePrimaryBenchmarkSelected();
                  }
                  setMode(option);
                  setHoverPoint(null);
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
                    if (option !== "TWR" && mode === "DRAWDOWN") {
                      setMode("INDEXED");
                    }
                    setHoverPoint(null);
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
                setHoverPoint(null);
                setSelection(null);
              }}
              type="button"
            >
              {copy.charts.common.timeframes[option]}
            </button>
          ))}
        </div>
      </div>
    );
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
                portfolioCurrency,
              })}
            </p>
          ) : null}
        </div>
        {renderChartControls("chart-control-stack chart-control-stack-desktop")}
      </div>

      {renderChartControls("chart-control-stack chart-control-stack-mobile")}

      {shouldShowAbsoluteSummary ? (
        <div className="chart-stat-strip" aria-label={copy.charts.benchmark.absoluteSummary.label}>
          <div
            title={
              returnBasis === "ABSOLUTE"
                ? copy.charts.benchmark.absoluteSummary.hints.absoluteReturn
                : returnBasisCopy.hint
            }
          >
            <span>
              {returnBasis === "ABSOLUTE"
                ? copy.charts.benchmark.absoluteSummary.absoluteReturn
                : returnBasisCopy.summaryLabel}
            </span>
            <strong
              className={getValueClassName(
                returnBasis === "ABSOLUTE" ? performanceSummary.absoluteReturn : basisReturn,
              )}
            >
              {returnBasis !== "ABSOLUTE"
                ? basisReturn == null
                  ? "-"
                  : formatSignedPercent(basisReturn)
                : formatAbsoluteReturn(performanceSummary.absoluteReturn, locale)}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.totalPnl}>
            <span>{copy.charts.benchmark.absoluteSummary.totalPnl}</span>
            <strong className={getValueClassName(performanceSummary.totalPnl)}>
              {formatPerformanceMoney(
                performanceSummary.totalPnl,
                performanceSummary.currency,
                locale,
              )}
            </strong>
          </div>
          <div title={copy.charts.benchmark.absoluteSummary.hints.netInvested}>
            <span>{copy.charts.benchmark.absoluteSummary.netInvested}</span>
            <strong>
              {formatPerformanceMoney(
                performanceSummary.netInvested,
                performanceSummary.currency,
                locale,
              )}
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
                <span>
                  {mode === "GAP" ? copy.charts.benchmark.latestGap : copy.charts.benchmark.gap}
                </span>
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
                <strong>
                  {formatModeValue(rangeStats.latestPoint.portfolioDisplay, mode, locale)}
                </strong>
              </div>
            </div>
          )}

          <div className="chart-shell" ref={chartContainerRef}>
            <ResponsiveContainer height={380} key={chartRenderKey} width="100%">
              <LineChart
                data={chartData}
                margin={{ top: 16, right: 14, left: 8, bottom: 8 }}
                onMouseDown={handleChartMouseDown}
                onMouseLeave={handleChartMouseLeave}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
              >
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
                  tickFormatter={(value: number) => formatModeValue(value, mode, locale)}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={yAxis?.domain}
                  ticks={yAxis?.ticks}
                  tickMargin={8}
                  stroke="var(--chart-axis)"
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--chart-hover)",
                    strokeDasharray: "2 1",
                    strokeWidth: 1.25,
                  }}
                  content={
                    <BenchmarkChartTooltip
                      language={language}
                      mode={mode}
                      returnBasis={returnBasis}
                    />
                  }
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
                {!shouldShowPrimaryBenchmarkLine ? null : (
                  <Line
                    isAnimationActive={false}
                    type="linear"
                    dataKey="benchmarkDisplay"
                    name={
                      mode === "GAP"
                        ? modeCopy.benchmarkName
                        : (benchmarkSymbol ?? modeCopy.benchmarkName)
                    }
                    stroke="var(--warm)"
                    strokeWidth={1.6}
                    strokeOpacity={0.72}
                    dot={false}
                    activeDot={{ r: 3.5, fill: "var(--warm)" }}
                  />
                )}
                {!shouldShowOverlayComparisons
                  ? null
                  : selectedOverlays.map((overlay) => {
                      const comparisonItem = comparisonItems.find(
                        (item) => item.symbol === overlay.symbol,
                      );

                      return (
                        <Line
                          activeDot={{
                            fill: comparisonItem?.color ?? "var(--ink)",
                            r: 3.5,
                          }}
                          dataKey={getOverlayDataKey(overlay.symbol)}
                          dot={false}
                          isAnimationActive={false}
                          key={overlay.symbol}
                          name={overlay.symbol}
                          stroke={comparisonItem?.color ?? "var(--ink)"}
                          strokeOpacity={0.86}
                          strokeWidth={1.9}
                          type="linear"
                        />
                      );
                    })}
              </LineChart>
            </ResponsiveContainer>
            {readoutPoint == null ? null : (
              <div className="chart-series-readout" aria-label={copy.charts.benchmark.rangeSummary}>
                <span className="chart-series-readout-date">
                  {formatChartDate(readoutPoint.date, locale)}
                </span>
                {renderSeriesReadoutRow({
                  change: getSeriesChangeValue(readoutPoint, "portfolio", mode),
                  markerClassName: "chart-series-marker-portfolio",
                  name: modeCopy.portfolioName,
                  value: readoutPoint.portfolioDisplay,
                })}
                {shouldShowOverlayComparisons
                  ? selectedOverlays.map((overlay) => {
                      const value = readoutPoint[getOverlayDataKey(overlay.symbol)];
                      const comparisonItem = comparisonItems.find(
                        (item) => item.symbol === overlay.symbol,
                      );

                      return typeof value !== "number" ? null : (
                        <div key={overlay.symbol}>
                          {renderSeriesReadoutRow({
                            change: value,
                            markerColor: comparisonItem?.color ?? "var(--ink)",
                            name: overlay.symbol,
                            onRemove: () => handleComparisonToggle(overlay.symbol),
                            removeLabel: copy.charts.benchmark.comparisonPicker.remove(
                              overlay.symbol,
                            ),
                            value,
                          })}
                        </div>
                      );
                    })
                  : renderSeriesReadoutRow({
                      change: getSeriesChangeValue(readoutPoint, "benchmark", mode),
                      markerClassName: "chart-series-marker-benchmark",
                      name:
                        mode === "GAP"
                          ? modeCopy.benchmarkName
                          : (benchmarkSymbol ?? modeCopy.benchmarkName),
                      value: readoutPoint.benchmarkDisplay,
                    })}
              </div>
            )}
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
                  <strong
                    className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}
                  >
                    {copy.charts.benchmark.portfolio}{" "}
                    {returnBasis === "TWR"
                      ? formatSignedPercent(selectedPortfolioChange)
                      : formatPercentagePoint(selectedPortfolioChange)}
                  </strong>
                  <span
                    className={selectedBenchmarkChange >= 0 ? "value-positive" : "value-negative"}
                  >
                    {benchmarkSymbol ?? copy.charts.benchmark.benchmark}{" "}
                    {returnBasis === "TWR"
                      ? formatSignedPercent(selectedBenchmarkChange)
                      : formatPercentagePoint(selectedBenchmarkChange)}
                  </span>
                  {selectedGap == null ? null : (
                    <span className={selectedGap >= 0 ? "value-positive" : "value-negative"}>
                      {copy.charts.benchmark.gap} {formatPercentagePoint(selectedGap)}
                    </span>
                  )}
                </>
              )}
            </div>
            {shouldShowOverlayComparisons ? (
              <BenchmarkComparisonPicker
                items={comparisonItems}
                labels={copy.charts.benchmark.comparisonPicker}
                language={language}
                onAddComparison={handleComparisonAdd}
                onClear={handleComparisonClear}
                onToggle={handleComparisonToggle}
                selectedSymbols={selectedComparisonSymbols}
              />
            ) : null}
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
              status,
            })}
          </p>
        </div>
      )}
    </article>
  );
}
