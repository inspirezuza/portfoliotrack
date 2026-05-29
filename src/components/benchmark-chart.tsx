"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildTimeAxisTicks, getTimeAxisDomain } from "@/lib/charts/time-axis";
import { getRechartsPayloadPoint, type RechartsMouseState } from "@/lib/charts/recharts-state";
import {
  BenchmarkAbsoluteSummaryStrip,
  type BenchmarkPerformanceSummary,
} from "@/components/benchmark-chart/absolute-summary-strip";
import {
  buildBenchmarkChartDataWithOverlays,
  buildBenchmarkComparisonItems,
  getBenchmarkYAxisValues,
  getInitialSelectedComparisonSymbols,
  getRoundedPercentAxis,
  getVisibleOverlayPoints,
  mergeOverlays,
  mergeQuotes,
} from "@/components/benchmark-chart/chart-helpers";
import { BenchmarkChartControls } from "@/components/benchmark-chart/chart-controls";
import { BenchmarkChartHeader } from "@/components/benchmark-chart/chart-header";
import {
  getSelectionChangeSummary,
  getSelectionPoints,
  getVisibleSeries,
  hasSelectionSpan,
  type SelectionRange,
} from "@/components/benchmark-chart/chart-selection";
import { BenchmarkChartPlot } from "@/components/benchmark-chart/chart-plot";
import {
  getAbsoluteSummaryMessage,
  getBasisLabel,
  getBenchmarkModeCopy,
  getShouldShowPrimaryBenchmarkLine,
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
  const absoluteSummaryMessage = getAbsoluteSummaryMessage({
    copy: copy.charts.benchmark,
    status: performanceSummary.status,
  });
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
  const modeCopy = getBenchmarkModeCopy({
    copy: copy.charts.benchmark,
    mode,
    returnBasis,
  });
  const shouldShowPrimaryBenchmarkLine = getShouldShowPrimaryBenchmarkLine({
    mode,
    shouldShowOverlayComparisons,
  });
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
      <BenchmarkChartHeader
        benchmarkSymbol={benchmarkSymbol}
        controls={renderChartControls("chart-control-stack chart-control-stack-desktop")}
        copy={copy.charts.benchmark}
        hasAnySeries={hasAnySeries}
        subtitle={getBasisLabel({
          benchmarkCurrency,
          comparisonBasis,
          copy: copy.charts.benchmark,
          portfolioCurrency,
        })}
      />

      {renderChartControls("chart-control-stack chart-control-stack-mobile")}

      {performanceSummary.status !== "no-transactions" ? (
        <BenchmarkAbsoluteSummaryStrip
          basisReturn={basisReturn}
          copy={copy.charts.benchmark}
          locale={locale}
          message={absoluteSummaryMessage}
          performanceSummary={performanceSummary}
          returnBasis={returnBasis}
          returnBasisCopy={copy.charts.benchmark.returnBasis[returnBasis]}
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

          <BenchmarkChartPlot
            benchmarkSymbol={benchmarkSymbol}
            chartData={chartData}
            comparisonItems={comparisonItems}
            copy={copy.charts}
            hasActiveSelection={hasActiveSelection}
            language={language}
            locale={locale}
            mode={mode}
            modeCopy={modeCopy}
            onChartMouseDown={handleChartMouseDown}
            onChartMouseLeave={handleChartMouseLeave}
            onChartMouseMove={handleChartMouseMove}
            onChartMouseUp={handleChartMouseUp}
            onComparisonAdd={handleComparisonAdd}
            onComparisonClear={handleComparisonClear}
            onComparisonToggle={handleComparisonToggle}
            readoutPoint={readoutPoint}
            returnBasis={returnBasis}
            selectedBenchmarkChange={selectedBenchmarkChange}
            selectedGap={selectedGap}
            selectedOverlays={selectedOverlays}
            selectedPortfolioChange={selectedPortfolioChange}
            selectedSymbols={selectedComparisonSymbols}
            selection={selection}
            selectionPoints={selectionPoints}
            shouldShowOverlayComparisons={shouldShowOverlayComparisons}
            shouldShowPrimaryBenchmarkLine={shouldShowPrimaryBenchmarkLine}
            xAxisSpan={xAxisSpan}
            xAxisTicks={xAxisTicks}
            xDomain={xDomain}
            yAxis={yAxis}
          />
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
