import {
  formatModeValue,
  formatPercentagePoint,
  formatSignedPercent,
} from "@/components/benchmark-chart/formatting";
import type { ChartPoint, PerformanceMode } from "@/components/benchmark-chart/types";
import type { getUiCopy } from "@/lib/ui/copy";

type BenchmarkModeCopy = {
  benchmarkName: string;
  portfolioName: string;
  yAxisLabel: string;
};

type BenchmarkRangeStats = {
  latestPoint: ChartPoint;
  portfolioChange: number | null;
  benchmarkChange: number | null;
  gap: number | null;
};

type BenchmarkRangeSummaryStripProps = {
  benchmarkSymbol: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  locale: string;
  mode: PerformanceMode;
  modeCopy: BenchmarkModeCopy;
  rangeStats: BenchmarkRangeStats;
};

function getValueToneClass(value: number | null) {
  if (value == null) {
    return "";
  }

  return value >= 0 ? "value-positive" : "value-negative";
}

export function BenchmarkRangeSummaryStrip({
  benchmarkSymbol,
  copy,
  locale,
  mode,
  modeCopy,
  rangeStats,
}: BenchmarkRangeSummaryStripProps) {
  return (
    <div className="chart-stat-strip" aria-label={copy.rangeSummary}>
      <div>
        <span>{copy.portfolio}</span>
        <strong className={getValueToneClass(rangeStats.portfolioChange)}>
          {rangeStats.portfolioChange == null
            ? "-"
            : formatSignedPercent(rangeStats.portfolioChange)}
        </strong>
      </div>
      <div>
        <span>{benchmarkSymbol ?? copy.benchmark}</span>
        <strong className={getValueToneClass(rangeStats.benchmarkChange)}>
          {rangeStats.benchmarkChange == null
            ? "-"
            : formatSignedPercent(rangeStats.benchmarkChange)}
        </strong>
      </div>
      <div>
        <span>{mode === "GAP" ? copy.latestGap : copy.gap}</span>
        <strong className={getValueToneClass(rangeStats.gap)}>
          {rangeStats.gap == null ? "-" : formatPercentagePoint(rangeStats.gap)}
        </strong>
      </div>
      <div>
        <span>{modeCopy.yAxisLabel}</span>
        <strong>{formatModeValue(rangeStats.latestPoint.portfolioDisplay, mode, locale)}</strong>
      </div>
    </div>
  );
}
