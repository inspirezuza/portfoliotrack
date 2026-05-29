import {
  attachTimeAxis,
  getUtcDateTime,
  isDailyPoint,
  isIntradayPoint,
  parseChartDate,
  type TimeAxisPoint,
} from "@/lib/charts/time-axis";
import type { AssetDetail } from "@/server/assets";

export type TimeframeKey =
  | "1D"
  | "5D"
  | "1W"
  | "1M"
  | "3M"
  | "YTD"
  | "1Y"
  | "3Y"
  | "5Y"
  | "START"
  | "ALL";

export type ChartPoint = AssetDetail["marketData"]["priceHistory"][number] &
  TimeAxisPoint & {
    changeFromRangeStart: number | null;
  };

export type SelectionRange = {
  startDate: string;
  endDate: string;
};

export const TIMEFRAME_OPTIONS: Array<{
  key: TimeframeKey;
  label: string;
}> = [
  { key: "1D", label: "1D" },
  { key: "5D", label: "5D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "3Y", label: "3Y" },
  { key: "5Y", label: "5Y" },
  { key: "START", label: "Start" },
  { key: "ALL", label: "All" },
];

export function getUnavailableMessage(asset: {
  marketData: Pick<AssetDetail["marketData"], "historyUnavailableReason">;
}) {
  return (
    asset.marketData.historyUnavailableReason ?? "No price history is available for this chart yet."
  );
}

export function getTimeframeStartDate(
  key: TimeframeKey,
  latestDate: string,
  sinceStartDate: string | null,
) {
  const latest = parseChartDate(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "START") {
    return sinceStartDate == null || sinceStartDate.includes("T")
      ? sinceStartDate
      : `${sinceStartDate}T00:00:00.000Z`;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD" | "START">, number> = {
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

export function getVisibleHistory(
  history: AssetDetail["marketData"]["priceHistory"],
  timeframe: TimeframeKey,
  sinceStartDate: string | null,
) {
  const latestPoint = history[history.length - 1];

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date, sinceStartDate);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredHistory =
    startTime == null
      ? history
      : history.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradayHistory = filteredHistory.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradayHistory.length >= 2) {
      return preferredIntradayHistory;
    }

    const intradayHistory = filteredHistory.filter(isIntradayPoint);

    if (intradayHistory.length >= 2) {
      return intradayHistory;
    }
  } else {
    const dailyHistory = filteredHistory.filter(isDailyPoint);

    if (dailyHistory.length >= 2) {
      return dailyHistory;
    }
  }

  return filteredHistory.length > 0 ? filteredHistory : [latestPoint];
}

export function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

export function buildAssetChartData(
  visibleHistory: AssetDetail["marketData"]["priceHistory"],
): ChartPoint[] {
  const firstClose = visibleHistory[0]?.close ?? null;

  return attachTimeAxis(visibleHistory).map((point) => ({
    ...point,
    changeFromRangeStart:
      firstClose == null ? null : calculatePercentChange(firstClose, point.close),
  }));
}

export function getRangeStats(chartData: ChartPoint[]) {
  if (chartData.length === 0) {
    return null;
  }

  const firstPoint = chartData[0];
  const latestPoint = chartData[chartData.length - 1];
  const highPoint = chartData.reduce((highest, point) =>
    point.close > highest.close ? point : highest,
  );
  const lowPoint = chartData.reduce((lowest, point) =>
    point.close < lowest.close ? point : lowest,
  );
  const percentChange = calculatePercentChange(firstPoint.close, latestPoint.close);

  return {
    firstPoint,
    latestPoint,
    highPoint,
    lowPoint,
    percentChange,
  };
}

export function getSelectionPoints(data: ChartPoint[], selection: SelectionRange | null) {
  if (selection == null) {
    return null;
  }

  const startTime = getUtcDateTime(selection.startDate);
  const endTime = getUtcDateTime(selection.endDate);
  const minTime = Math.min(startTime, endTime);
  const maxTime = Math.max(startTime, endTime);
  const startPoint = data.find((point) => getUtcDateTime(point.date) === minTime) ?? null;
  const endPoint = data.find((point) => getUtcDateTime(point.date) === maxTime) ?? null;

  if (startPoint == null || endPoint == null) {
    return null;
  }

  return {
    startPoint,
    endPoint,
  };
}

export function hasSelectionSpan(points: ReturnType<typeof getSelectionPoints>) {
  return points != null && points.startPoint.date !== points.endPoint.date;
}

export function getPaddedDomain(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return undefined;
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const spread = max - min;
  const padding = spread === 0 ? Math.max(Math.abs(max) * 0.05, 1) : spread * 0.12;

  return [Math.max(0, min - padding), max + padding] satisfies [number, number];
}
