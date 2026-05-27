import { attachTimeAxis } from "@/lib/charts/time-axis";
import type { IndexedPerformancePoint } from "@/lib/portfolio/performance-series";
import type {
  ActivePerformancePoint,
  ChartPoint,
  PerformanceMode,
  ReturnBasis
} from "@/components/benchmark-chart/types";

function isIndexedPerformancePoint(point: ActivePerformancePoint): point is IndexedPerformancePoint {
  return "portfolioIndex" in point;
}

export function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

export function buildBenchmarkChartData({
  mode,
  points,
  returnBasis
}: {
  mode: PerformanceMode;
  points: ActivePerformancePoint[];
  returnBasis: ReturnBasis;
}): ChartPoint[] {
  const firstPoint = points[0] ?? null;
  const firstPortfolioRaw = firstPoint == null
    ? 100
    : isIndexedPerformancePoint(firstPoint)
      ? firstPoint.portfolioIndex
      : firstPoint.portfolioReturnPercent;
  const firstBenchmarkRaw = firstPoint == null
    ? 100
    : isIndexedPerformancePoint(firstPoint)
      ? firstPoint.benchmarkIndex
      : firstPoint.benchmarkReturnPercent;
  let portfolioHighWatermark = firstPortfolioRaw;
  let benchmarkHighWatermark = firstBenchmarkRaw;

  return attachTimeAxis(points).map((point) => {
    const isIndexed = isIndexedPerformancePoint(point);
    const portfolioRaw = isIndexed ? point.portfolioIndex : point.portfolioReturnPercent;
    const benchmarkRaw = isIndexed ? point.benchmarkIndex : point.benchmarkReturnPercent;
    const portfolioReturn = isIndexed
      ? (calculatePercentChange(firstPortfolioRaw, portfolioRaw) ?? 0)
      : point.portfolioReturnPercent;
    const benchmarkReturn = isIndexed
      ? (calculatePercentChange(firstBenchmarkRaw, benchmarkRaw) ?? 0)
      : point.benchmarkReturnPercent;

    portfolioHighWatermark = Math.max(portfolioHighWatermark, portfolioRaw);
    benchmarkHighWatermark = Math.max(benchmarkHighWatermark, benchmarkRaw);

    const portfolioDrawdown =
      returnBasis !== "TWR" || portfolioHighWatermark === 0
        ? 0
        : ((portfolioRaw - portfolioHighWatermark) / portfolioHighWatermark) * 100;
    const benchmarkDrawdown =
      returnBasis !== "TWR" || benchmarkHighWatermark === 0
        ? 0
        : ((benchmarkRaw - benchmarkHighWatermark) / benchmarkHighWatermark) * 100;
    const gap = portfolioReturn - benchmarkReturn;

    return {
      ...point,
      benchmarkChangeFromRangeStart: firstPoint == null ? null : benchmarkReturn,
      benchmarkDisplay:
        mode === "DRAWDOWN" ? benchmarkDrawdown : mode === "GAP" ? 0 : benchmarkReturn,
      benchmarkDrawdown,
      benchmarkRaw,
      benchmarkReturn,
      gap,
      portfolioChangeFromRangeStart: firstPoint == null ? null : portfolioReturn,
      portfolioDisplay:
        mode === "DRAWDOWN"
          ? portfolioDrawdown
          : mode === "GAP"
            ? gap
            : portfolioReturn,
      portfolioDrawdown,
      portfolioRaw,
      portfolioReturn
    };
  });
}

export function calculateSelectionChange({
  endPoint,
  key,
  returnBasis,
  startPoint
}: {
  endPoint: ChartPoint;
  key: "portfolio" | "benchmark";
  returnBasis: ReturnBasis;
  startPoint: ChartPoint;
}) {
  if (returnBasis === "TWR") {
    return calculatePercentChange(
      key === "portfolio" ? startPoint.portfolioRaw : startPoint.benchmarkRaw,
      key === "portfolio" ? endPoint.portfolioRaw : endPoint.benchmarkRaw
    );
  }

  return key === "portfolio"
    ? endPoint.portfolioReturn - startPoint.portfolioReturn
    : endPoint.benchmarkReturn - startPoint.benchmarkReturn;
}
