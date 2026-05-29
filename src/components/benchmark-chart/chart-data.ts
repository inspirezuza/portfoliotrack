import {
  attachTimeAxis,
  getUtcDateTime,
  isDailyPoint,
  isIntradayPoint,
} from "@/lib/charts/time-axis";
import type { IndexedPerformancePoint } from "@/lib/portfolio/performance-series";
import type {
  ActivePerformancePoint,
  ChartPoint,
  PerformanceMode,
  ReturnBasis,
  TimeframeKey,
} from "@/components/benchmark-chart/types";

type TimeframePoint = {
  date: string;
  interval?: string | null;
};

type OverlayReturnPoint = {
  date: string;
  value: number;
};

const MIN_MONEY_WEIGHTED_ANNUALIZATION_DAYS = 30;

function isIndexedPerformancePoint(
  point: ActivePerformancePoint,
): point is IndexedPerformancePoint {
  return "portfolioIndex" in point;
}

function getTimeframeStartDate(key: TimeframeKey, latestDate: string) {
  const latest = new Date(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD">, number> = {
    "1D": 1,
    "5D": 5,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
    "3Y": 1095,
    "5Y": 1825,
  };
  latest.setUTCDate(latest.getUTCDate() - daysByKey[key]);

  return latest.toISOString();
}

function isShortTimeframe(timeframe: TimeframeKey) {
  return timeframe === "1D" || timeframe === "5D" || timeframe === "1W" || timeframe === "1M";
}

function getPreferredIntradayInterval(timeframe: TimeframeKey) {
  if (timeframe === "1D") {
    return "5m";
  }

  if (timeframe === "5D" || timeframe === "1W" || timeframe === "1M") {
    return "1h";
  }

  return null;
}

function getLastPointBefore<TPoint extends TimeframePoint>(points: TPoint[], timestamp: number) {
  let previousPoint: TPoint | null = null;

  for (const point of points) {
    if (getUtcDateTime(point.date) >= timestamp) {
      break;
    }

    previousPoint = point;
  }

  return previousPoint;
}

export function selectVisibleTimeframePoints<TPoint extends TimeframePoint>({
  anchorDate,
  includeBaselinePoint = false,
  points,
  timeframe,
}: {
  anchorDate?: string | null;
  includeBaselinePoint?: boolean;
  points: TPoint[];
  timeframe: TimeframeKey;
}) {
  const latestDate = anchorDate ?? points[points.length - 1]?.date ?? null;

  if (latestDate == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestDate);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredPoints =
    startTime == null ? points : points.filter((point) => getUtcDateTime(point.date) >= startTime);
  const baselinePoint =
    includeBaselinePoint && startTime != null ? getLastPointBefore(points, startTime) : null;
  const addBaselinePoint = (visiblePoints: TPoint[]) =>
    baselinePoint == null || visiblePoints.includes(baselinePoint)
      ? visiblePoints
      : [baselinePoint, ...visiblePoints];

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradayPoints = filteredPoints.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradayPoints.length >= 2) {
      return addBaselinePoint(preferredIntradayPoints);
    }

    const intradayPoints = filteredPoints.filter(isIntradayPoint);

    if (intradayPoints.length >= 2) {
      return addBaselinePoint(intradayPoints);
    }
  } else {
    const dailyPoints = filteredPoints.filter(isDailyPoint);

    if (dailyPoints.length >= 2) {
      return addBaselinePoint(dailyPoints);
    }
  }

  return addBaselinePoint(filteredPoints);
}

export function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

function getPointValueAtOrBefore(points: OverlayReturnPoint[], targetDate: string) {
  const targetTime = getUtcDateTime(targetDate);
  let value: number | null = null;

  for (const point of points) {
    if (getUtcDateTime(point.date) > targetTime) {
      break;
    }

    value = point.value;
  }

  return value;
}

export function calculateOverlayReturnAtDate({
  points,
  returnBasis,
  startDate,
  targetDate,
}: {
  points: OverlayReturnPoint[];
  returnBasis: ReturnBasis;
  startDate: string;
  targetDate: string;
}) {
  const startValue = getPointValueAtOrBefore(points, startDate);
  const currentValue = getPointValueAtOrBefore(points, targetDate);

  if (startValue == null || currentValue == null) {
    return null;
  }

  if (returnBasis !== "MWR") {
    return calculatePercentChange(startValue, currentValue);
  }

  const elapsedDays = (getUtcDateTime(targetDate) - getUtcDateTime(startDate)) / 86_400_000;

  if (startValue <= 0 || currentValue <= 0 || elapsedDays < MIN_MONEY_WEIGHTED_ANNUALIZATION_DAYS) {
    return null;
  }

  return (Math.pow(currentValue / startValue, 365 / elapsedDays) - 1) * 100;
}

export function buildBenchmarkChartData({
  mode,
  points,
  returnBasis,
}: {
  mode: PerformanceMode;
  points: ActivePerformancePoint[];
  returnBasis: ReturnBasis;
}): ChartPoint[] {
  const firstPoint = points[0] ?? null;
  const firstPortfolioRaw =
    firstPoint == null
      ? 100
      : isIndexedPerformancePoint(firstPoint)
        ? firstPoint.portfolioIndex
        : firstPoint.portfolioReturnPercent;
  const firstBenchmarkRaw =
    firstPoint == null
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
        mode === "DRAWDOWN" ? portfolioDrawdown : mode === "GAP" ? gap : portfolioReturn,
      portfolioDrawdown,
      portfolioRaw,
      portfolioReturn,
    };
  });
}

export function calculateSelectionChange({
  endPoint,
  key,
  returnBasis,
  startPoint,
}: {
  endPoint: ChartPoint;
  key: "portfolio" | "benchmark";
  returnBasis: ReturnBasis;
  startPoint: ChartPoint;
}) {
  if (returnBasis === "TWR") {
    return calculatePercentChange(
      key === "portfolio" ? startPoint.portfolioRaw : startPoint.benchmarkRaw,
      key === "portfolio" ? endPoint.portfolioRaw : endPoint.benchmarkRaw,
    );
  }

  return key === "portfolio"
    ? endPoint.portfolioReturn - startPoint.portfolioReturn
    : endPoint.benchmarkReturn - startPoint.benchmarkReturn;
}
