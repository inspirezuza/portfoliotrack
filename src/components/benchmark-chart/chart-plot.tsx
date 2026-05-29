"use client";

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
import { formatTimeAxisTick, getUtcDateTime } from "@/lib/charts/time-axis";
import type { RechartsMouseState } from "@/lib/charts/recharts-state";
import { useChartVisibilityKey } from "@/hooks/use-chart-visibility-key";
import {
  BenchmarkComparisonPicker,
  type BenchmarkComparisonPickerItem,
} from "@/components/benchmark-comparison-picker";
import { BenchmarkChartTooltip } from "@/components/benchmark-chart/chart-tooltip";
import { formatModeValue } from "@/components/benchmark-chart/formatting";
import { BenchmarkSelectionReadout } from "@/components/benchmark-chart/selection-readout";
import { BenchmarkSeriesReadout } from "@/components/benchmark-chart/series-readout";
import { getOverlayDataKey } from "@/components/benchmark-chart/chart-helpers";
import type { SelectionRange } from "@/components/benchmark-chart/chart-selection";
import type { ChartPoint, PerformanceMode, ReturnBasis } from "@/components/benchmark-chart/types";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";

type BenchmarkComparisonPayload = {
  overlay: DashboardBenchmarkOverlay;
  quote: DashboardBenchmarkQuote;
};

type BenchmarkChartAxis =
  | {
      domain: [number, number];
      ticks: number[];
    }
  | undefined;

type SelectionPoints = {
  startPoint: ChartPoint;
  endPoint: ChartPoint;
} | null;

type BenchmarkChartPlotProps = {
  benchmarkSymbol: string | null;
  chartData: ChartPoint[];
  chartRenderKey?: number;
  comparisonItems: BenchmarkComparisonPickerItem[];
  copy: ReturnType<typeof getUiCopy>["charts"];
  hasActiveSelection: boolean;
  language: UiLanguage;
  locale: string;
  mode: PerformanceMode;
  modeCopy: {
    benchmarkName: string;
    portfolioName: string;
  };
  onChartMouseDown: (state: RechartsMouseState | undefined) => void;
  onChartMouseLeave: () => void;
  onChartMouseMove: (state: RechartsMouseState | undefined) => void;
  onChartMouseUp: () => void;
  onComparisonAdd: (comparison: BenchmarkComparisonPayload) => void;
  onComparisonClear: () => void;
  onComparisonToggle: (symbol: string) => void;
  readoutPoint: ChartPoint | null;
  returnBasis: ReturnBasis;
  selectedBenchmarkChange: number | null;
  selectedGap: number | null;
  selectedOverlays: DashboardBenchmarkOverlay[];
  selectedPortfolioChange: number | null;
  selectedSymbols: string[];
  selection: SelectionRange | null;
  selectionPoints: SelectionPoints;
  shouldShowOverlayComparisons: boolean;
  shouldShowPrimaryBenchmarkLine: boolean;
  xAxisSpan: number;
  xAxisTicks: number[] | undefined;
  xDomain: [number, number] | undefined;
  yAxis: BenchmarkChartAxis;
};

export function BenchmarkChartPlot({
  benchmarkSymbol,
  chartData,
  chartRenderKey,
  comparisonItems,
  copy,
  hasActiveSelection,
  language,
  locale,
  mode,
  modeCopy,
  onChartMouseDown,
  onChartMouseLeave,
  onChartMouseMove,
  onChartMouseUp,
  onComparisonAdd,
  onComparisonClear,
  onComparisonToggle,
  readoutPoint,
  returnBasis,
  selectedBenchmarkChange,
  selectedGap,
  selectedOverlays,
  selectedPortfolioChange,
  selectedSymbols,
  selection,
  selectionPoints,
  shouldShowOverlayComparisons,
  shouldShowPrimaryBenchmarkLine,
  xAxisSpan,
  xAxisTicks,
  xDomain,
  yAxis,
}: BenchmarkChartPlotProps) {
  const { chartContainerRef, chartRenderKey: visibilityChartRenderKey } = useChartVisibilityKey();

  return (
    <div className="chart-shell" ref={chartContainerRef}>
      <ResponsiveContainer
        height={380}
        key={chartRenderKey ?? visibilityChartRenderKey}
        width="100%"
      >
        <LineChart
          data={chartData}
          margin={{ top: 16, right: 14, left: 8, bottom: 8 }}
          onMouseDown={onChartMouseDown}
          onMouseLeave={onChartMouseLeave}
          onMouseMove={onChartMouseMove}
          onMouseUp={onChartMouseUp}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={xDomain}
            ticks={xAxisTicks}
            tickFormatter={(value: number | string) => formatTimeAxisTick(value, locale, xAxisSpan)}
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
              <BenchmarkChartTooltip language={language} mode={mode} returnBasis={returnBasis} />
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
        <BenchmarkSeriesReadout
          benchmarkSymbol={benchmarkSymbol}
          comparisonItems={comparisonItems}
          locale={locale}
          mode={mode}
          modeCopy={modeCopy}
          onComparisonToggle={onComparisonToggle}
          rangeSummaryLabel={copy.benchmark.rangeSummary}
          readoutPoint={readoutPoint}
          removeComparisonLabel={copy.benchmark.comparisonPicker.remove}
          selectedOverlays={selectedOverlays}
          shouldShowOverlayComparisons={shouldShowOverlayComparisons}
        />
      )}
      <BenchmarkSelectionReadout
        benchmarkSymbol={benchmarkSymbol}
        copy={copy}
        hasActiveSelection={hasActiveSelection}
        locale={locale}
        returnBasis={returnBasis}
        selectedBenchmarkChange={selectedBenchmarkChange}
        selectedGap={selectedGap}
        selectedPortfolioChange={selectedPortfolioChange}
        selectionPoints={selectionPoints}
      />
      {shouldShowOverlayComparisons ? (
        <BenchmarkComparisonPicker
          items={comparisonItems}
          labels={copy.benchmark.comparisonPicker}
          language={language}
          onAddComparison={onComparisonAdd}
          onClear={onComparisonClear}
          onToggle={onComparisonToggle}
          selectedSymbols={selectedSymbols}
        />
      ) : null}
    </div>
  );
}
