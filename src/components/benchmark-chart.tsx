"use client";

import {
  BenchmarkAbsoluteSummaryStrip,
  type BenchmarkPerformanceSummary,
} from "@/components/benchmark-chart/absolute-summary-strip";
import { BenchmarkChartControls } from "@/components/benchmark-chart/chart-controls";
import { BenchmarkChartHeader } from "@/components/benchmark-chart/chart-header";
import { BenchmarkChartPlot } from "@/components/benchmark-chart/chart-plot";
import { getBasisLabel, getUnavailableMessage } from "@/components/benchmark-chart/formatting";
import { BenchmarkRangeSummaryStrip } from "@/components/benchmark-chart/range-summary-strip";
import { useBenchmarkChart } from "@/components/benchmark-chart/use-benchmark-chart";
import type {
  BenchmarkComparisonBasis,
  PortfolioBenchmarkTimelineStatus,
} from "@/lib/portfolio/timeline";
import type { PortfolioPerformanceSeries } from "@/lib/portfolio/performance-series";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import type { UiLanguage } from "@/lib/ui/translations";

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
  const {
    absoluteSummaryMessage,
    basisReturn,
    chartData,
    comparisonItems,
    copy,
    handleChartMouseDown,
    handleChartMouseLeave,
    handleChartMouseMove,
    handleChartMouseUp,
    handleComparisonAdd,
    handleComparisonClear,
    handleComparisonToggle,
    handleModeChange,
    handleReturnBasisChange,
    handleTimeframeChange,
    hasActiveSelection,
    hasAnySeries,
    hasSeries,
    locale,
    mode,
    modeCopy,
    rangeStats,
    readoutPoint,
    returnBasis,
    selectedBenchmarkChange,
    selectedComparisonSymbols,
    selectedGap,
    selectedOverlays,
    selectedPortfolioChange,
    selection,
    selectionPoints,
    shouldShowOverlayComparisons,
    shouldShowPrimaryBenchmarkLine,
    timeframe,
    xAxisSpan,
    xAxisTicks,
    xDomain,
    yAxis,
  } = useBenchmarkChart({
    benchmarkOverlays,
    benchmarkQuotes,
    benchmarkSymbol,
    language,
    performanceSeries,
    performanceSummary,
  });

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
