import {
  formatChartDate,
  formatPercentagePoint,
  formatSignedPercent,
} from "@/components/benchmark-chart/formatting";
import type { ReturnBasis } from "@/components/benchmark-chart/types";
import type { UiCopy } from "@/lib/ui/copy";
import type { getSelectionPoints } from "@/components/benchmark-chart/chart-selection";

type BenchmarkSelectionReadoutProps = {
  benchmarkSymbol: string | null;
  copy: UiCopy["charts"];
  hasActiveSelection: boolean;
  locale: string;
  returnBasis: ReturnBasis;
  selectedBenchmarkChange: number | null;
  selectedGap: number | null;
  selectedPortfolioChange: number | null;
  selectionPoints: ReturnType<typeof getSelectionPoints>;
};

export function BenchmarkSelectionReadout({
  benchmarkSymbol,
  copy,
  hasActiveSelection,
  locale,
  returnBasis,
  selectedBenchmarkChange,
  selectedGap,
  selectedPortfolioChange,
  selectionPoints,
}: BenchmarkSelectionReadoutProps) {
  const isIdle =
    !hasActiveSelection ||
    selectionPoints == null ||
    selectedPortfolioChange == null ||
    selectedBenchmarkChange == null;

  return (
    <div
      className={
        isIdle ? "chart-selection-readout chart-selection-readout-idle" : "chart-selection-readout"
      }
    >
      {isIdle ? (
        <span>{copy.common.dragToCompare}</span>
      ) : (
        <>
          <span>
            {formatChartDate(selectionPoints.startPoint.date, locale)} {copy.common.to}{" "}
            {formatChartDate(selectionPoints.endPoint.date, locale)}
          </span>
          <strong className={selectedPortfolioChange >= 0 ? "value-positive" : "value-negative"}>
            {copy.benchmark.portfolio}{" "}
            {returnBasis === "TWR"
              ? formatSignedPercent(selectedPortfolioChange)
              : formatPercentagePoint(selectedPortfolioChange)}
          </strong>
          <span className={selectedBenchmarkChange >= 0 ? "value-positive" : "value-negative"}>
            {benchmarkSymbol ?? copy.benchmark.benchmark}{" "}
            {returnBasis === "TWR"
              ? formatSignedPercent(selectedBenchmarkChange)
              : formatPercentagePoint(selectedBenchmarkChange)}
          </span>
          {selectedGap == null ? null : (
            <span className={selectedGap >= 0 ? "value-positive" : "value-negative"}>
              {copy.benchmark.gap} {formatPercentagePoint(selectedGap)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
