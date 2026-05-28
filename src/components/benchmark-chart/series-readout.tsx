import { getOverlayDataKey } from "@/components/benchmark-chart/chart-helpers";
import { formatChartDate, getSeriesChangeValue } from "@/components/benchmark-chart/formatting";
import { BenchmarkSeriesReadoutRow } from "@/components/benchmark-chart/series-readout-row";
import type { ChartPoint, PerformanceMode } from "@/components/benchmark-chart/types";
import type { BenchmarkComparisonPickerItem } from "@/components/benchmark-comparison-picker";
import type { DashboardBenchmarkOverlay } from "@/server/dashboard";

type BenchmarkSeriesReadoutProps = {
  benchmarkSymbol: string | null;
  comparisonItems: BenchmarkComparisonPickerItem[];
  locale: string;
  mode: PerformanceMode;
  modeCopy: {
    benchmarkName: string;
    portfolioName: string;
  };
  onComparisonToggle: (symbol: string) => void;
  rangeSummaryLabel: string;
  readoutPoint: ChartPoint;
  removeComparisonLabel: (symbol: string) => string;
  selectedOverlays: DashboardBenchmarkOverlay[];
  shouldShowOverlayComparisons: boolean;
};

export function BenchmarkSeriesReadout({
  benchmarkSymbol,
  comparisonItems,
  locale,
  mode,
  modeCopy,
  onComparisonToggle,
  rangeSummaryLabel,
  readoutPoint,
  removeComparisonLabel,
  selectedOverlays,
  shouldShowOverlayComparisons,
}: BenchmarkSeriesReadoutProps) {
  return (
    <div className="chart-series-readout" aria-label={rangeSummaryLabel}>
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
          const comparisonItem = comparisonItems.find((item) => item.symbol === overlay.symbol);

          return typeof value !== "number" ? null : (
            <div key={overlay.symbol}>
              <BenchmarkSeriesReadoutRow
                change={value}
                locale={locale}
                markerColor={comparisonItem?.color ?? "var(--ink)"}
                mode={mode}
                name={overlay.symbol}
                onRemove={() => onComparisonToggle(overlay.symbol)}
                removeLabel={removeComparisonLabel(overlay.symbol)}
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
            mode === "GAP" ? modeCopy.benchmarkName : (benchmarkSymbol ?? modeCopy.benchmarkName)
          }
          value={readoutPoint.benchmarkDisplay}
        />
      )}
    </div>
  );
}
