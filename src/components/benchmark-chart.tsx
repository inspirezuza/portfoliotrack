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
  BenchmarkAbsoluteSummaryStrip,
  type BenchmarkPerformanceSummary,
} from "@/components/benchmark-chart/absolute-summary-strip";
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
import { BenchmarkChartControls } from "@/components/benchmark-chart/chart-controls";
import {
  getSelectionChangeSummary,
  getSelectionPoints,
  getVisibleSeries,
  hasSelectionSpan,
  type SelectionRange,
} from "@/components/benchmark-chart/chart-selection";
import { BenchmarkChartTooltip } from "@/components/benchmark-chart/chart-tooltip";
import { BenchmarkSeriesReadoutRow } from "@/components/benchmark-chart/series-readout-row";
import {
  formatChartDate,
  formatModeValue,
  formatPercentagePoint,
  formatSignedPercent,
  getAbsoluteSummaryMessage,
  getBasisLabel,
  getSeriesChangeValue,
  getUnavailableMessage,
} from "@/components/benchmark-chart/formatting";
import { BenchmarkRangeSummaryStrip } from "@/components/benchmark-chart/range-summary-strip";
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

  function resetPointerState() {
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

  function handleModeChange(nextMode: PerformanceMode) {
    if (returnBasis !== "TWR" && nextMode === "DRAWDOWN") {
      return;
    }

    if (nextMode !== "INDEXED") {
      ensurePrimaryBenchmarkSelected();
    }

    setMode(nextMode);
    resetPointerState();
  }

  function handleReturnBasisChange(nextReturnBasis: ReturnBasis) {
    setReturnBasis(nextReturnBasis);

    if (nextReturnBasis !== "TWR" && mode === "DRAWDOWN") {
      setMode("INDEXED");
    }

    resetPointerState();
  }

  function handleTimeframeChange(nextTimeframe: TimeframeKey) {
    setTimeframe(nextTimeframe);
    resetPointerState();
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

  function renderChartControls(className: string) {
    return (
      <BenchmarkChartControls
        className={className}
        copy={copy.charts.benchmark}
        mode={mode}
        onModeChange={handleModeChange}
        onReturnBasisChange={handleReturnBasisChange}
        onTimeframeChange={handleTimeframeChange}
        returnBasis={returnBasis}
        timeframe={timeframe}
        timeframeLabels={copy.charts.common.timeframes}
      />
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
        <BenchmarkAbsoluteSummaryStrip
          basisReturn={basisReturn}
          copy={copy.charts.benchmark}
          locale={locale}
          message={absoluteSummaryMessage}
          performanceSummary={performanceSummary}
          returnBasis={returnBasis}
          returnBasisCopy={returnBasisCopy}
        />
      ) : null}

      {hasSeries ? (
        <div className="chart-workspace">
          {rangeStats == null ? null : (
            <BenchmarkRangeSummaryStrip
              benchmarkSymbol={benchmarkSymbol}
              copy={copy.charts.benchmark}
              locale={locale}
              mode={mode}
              modeCopy={modeCopy}
              rangeStats={rangeStats}
            />
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
                <BenchmarkSeriesReadoutRow
                  change={getSeriesChangeValue(readoutPoint, "portfolio", mode)}
                  locale={locale}
                  markerClassName="chart-series-marker-portfolio"
                  mode={mode}
                  name={modeCopy.portfolioName}
                  value={readoutPoint.portfolioDisplay}
                />
                {shouldShowOverlayComparisons ? (
                  selectedOverlays.map((overlay) => {
                    const value = readoutPoint[getOverlayDataKey(overlay.symbol)];
                    const comparisonItem = comparisonItems.find(
                      (item) => item.symbol === overlay.symbol,
                    );

                    return typeof value !== "number" ? null : (
                      <div key={overlay.symbol}>
                        <BenchmarkSeriesReadoutRow
                          change={value}
                          locale={locale}
                          markerColor={comparisonItem?.color ?? "var(--ink)"}
                          mode={mode}
                          name={overlay.symbol}
                          onRemove={() => handleComparisonToggle(overlay.symbol)}
                          removeLabel={copy.charts.benchmark.comparisonPicker.remove(
                            overlay.symbol,
                          )}
                          value={value}
                        />
                      </div>
                    );
                  })
                ) : (
                  <BenchmarkSeriesReadoutRow
                    change={getSeriesChangeValue(readoutPoint, "benchmark", mode)}
                    locale={locale}
                    markerClassName="chart-series-marker-benchmark"
                    mode={mode}
                    name={
                      mode === "GAP"
                        ? modeCopy.benchmarkName
                        : (benchmarkSymbol ?? modeCopy.benchmarkName)
                    }
                    value={readoutPoint.benchmarkDisplay}
                  />
                )}
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
