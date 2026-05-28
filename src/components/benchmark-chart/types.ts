import type { TimeAxisPoint } from "@/lib/charts/time-axis";
import type {
  IndexedPerformancePoint,
  ReturnPerformancePoint,
} from "@/lib/portfolio/performance-series";

export type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
export type PerformanceMode = "INDEXED" | "GAP" | "DRAWDOWN";
export type ReturnBasis = "TWR" | "MWR" | "ABSOLUTE";

export type ActivePerformancePoint = IndexedPerformancePoint | ReturnPerformancePoint;

export type ChartPoint = ActivePerformancePoint &
  TimeAxisPoint & {
    benchmarkChangeFromRangeStart: number | null;
    benchmarkDisplay: number;
    benchmarkDrawdown: number;
    benchmarkRaw: number;
    benchmarkReturn: number;
    gap: number;
    portfolioDisplay: number;
    portfolioChangeFromRangeStart: number | null;
    portfolioDrawdown: number;
    portfolioRaw: number;
    portfolioReturn: number;
  } & Record<string, boolean | number | null | string | undefined>;
