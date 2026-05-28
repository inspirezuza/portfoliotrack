import { getUtcDateTime } from "@/lib/charts/time-axis";
import { selectVisibleTimeframePoints } from "@/components/benchmark-chart/chart-data";
import type {
  ActivePerformancePoint,
  ChartPoint,
  PerformanceMode,
  ReturnBasis,
  TimeframeKey,
} from "@/components/benchmark-chart/types";

export type SelectionRange = {
  startDate: string;
  endDate: string;
};

export const TIMEFRAME_OPTIONS: TimeframeKey[] = ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

export const PERFORMANCE_MODE_OPTIONS: PerformanceMode[] = ["INDEXED", "GAP", "DRAWDOWN"];
export const RETURN_BASIS_OPTIONS: ReturnBasis[] = ["TWR", "MWR", "ABSOLUTE"];

export function getVisibleSeries(series: ActivePerformancePoint[], timeframe: TimeframeKey) {
  return selectVisibleTimeframePoints({ points: series, timeframe });
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
