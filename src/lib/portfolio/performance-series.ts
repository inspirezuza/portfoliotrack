import { normalizeMoney } from "@/lib/db/precision";

export type PerformancePointInterval = "1d" | "5m" | "15m" | "1h";

export type PerformancePointBase = {
  date: string;
  interval?: PerformancePointInterval;
};

export type IndexedPerformancePoint = PerformancePointBase & {
  benchmarkIndex: number;
  portfolioIndex: number;
};

export type ReturnPerformancePoint = PerformancePointBase & {
  annualized: boolean;
  benchmarkReturnPercent: number;
  portfolioReturnPercent: number;
};

export type PortfolioPerformanceSeries = {
  absolute: ReturnPerformancePoint[];
  mwr: ReturnPerformancePoint[];
  twr: IndexedPerformancePoint[];
};

export function createEmptyPerformanceSeries(): PortfolioPerformanceSeries {
  return {
    absolute: [],
    mwr: [],
    twr: [],
  };
}

export function toPercentReturn(startValue: number, endValue: number) {
  if (startValue <= 0) {
    return null;
  }

  return normalizeMoney((endValue / startValue - 1) * 100);
}

export function toIndexedPerformancePoint({
  benchmark,
  date,
  interval,
  portfolio,
}: PerformancePointBase & {
  benchmark: number;
  portfolio: number;
}): IndexedPerformancePoint {
  return {
    date,
    interval,
    benchmarkIndex: benchmark,
    portfolioIndex: portfolio,
  };
}

export function toReturnPerformancePoint({
  annualized,
  benchmarkReturnPercent,
  date,
  interval,
  portfolioReturnPercent,
}: PerformancePointBase & {
  annualized: boolean;
  benchmarkReturnPercent: number;
  portfolioReturnPercent: number;
}): ReturnPerformancePoint {
  return {
    date,
    interval,
    annualized,
    benchmarkReturnPercent: normalizeMoney(benchmarkReturnPercent),
    portfolioReturnPercent: normalizeMoney(portfolioReturnPercent),
  };
}
