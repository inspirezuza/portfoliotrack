import { normalizeMoney } from "@/lib/db/precision";
import {
  calculateAnnualizedReturnPercent,
  calculateXirr,
  daysBetween,
} from "@/lib/portfolio/money-weighted";
import {
  toPercentReturn,
  toReturnPerformancePoint,
  type ReturnPerformancePoint,
} from "@/lib/portfolio/performance-series";
import { sortTransactionsChronologically } from "@/lib/portfolio/positions";
import {
  toDailyPricePoints,
  toDayStartTimestamp,
  toIntradayPricePoints,
} from "@/lib/portfolio/timeline-price-points";
import type {
  BenchmarkTimelinePoint,
  PortfolioTimelinePoint,
  TimelineHistoricalPrice,
  TimelineIntradayPrice,
  TimelineTransaction,
} from "@/lib/portfolio/timeline";

export type PortfolioValuationPoint = PortfolioTimelinePoint & {
  netCashFlow: number;
};

const MIN_MONEY_WEIGHTED_ANNUALIZATION_DAYS = 30;

function getExternalCashFlow(transaction: TimelineTransaction) {
  const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

  return transaction.side === "BUY"
    ? normalizeMoney(grossAmount + transaction.fee)
    : normalizeMoney(-(grossAmount - transaction.fee));
}

function getOrderedBenchmarkPricePoints({
  benchmarkIntradayRows = [],
  benchmarkRows,
}: {
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  return [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows),
  ].sort((left, right) => left.priceAt.localeCompare(right.priceAt));
}

export function buildCashFlowAdjustedComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = [],
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  const orderedBenchmarkRows = getOrderedBenchmarkPricePoints({
    benchmarkIntradayRows,
    benchmarkRows,
  });

  if (portfolioSeries.length === 0 || orderedBenchmarkRows.length === 0) {
    return [];
  }
  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let previousComparablePoint: PortfolioValuationPoint | null = null;
  let previousBenchmarkClose: number | null = null;
  let portfolioIndexValue = 100;
  let benchmarkIndexValue = 100;
  const comparison: BenchmarkTimelinePoint[] = [];

  for (const point of portfolioSeries) {
    while (
      benchmarkRowIndex < orderedBenchmarkRows.length &&
      orderedBenchmarkRows[benchmarkRowIndex].priceAt <= point.date
    ) {
      lastBenchmarkClose = orderedBenchmarkRows[benchmarkRowIndex].close;
      benchmarkRowIndex += 1;
    }

    if (lastBenchmarkClose == null || lastBenchmarkClose <= 0) {
      continue;
    }

    if (previousComparablePoint == null) {
      if (point.value <= 0) {
        continue;
      }

      previousComparablePoint = point;
      previousBenchmarkClose = lastBenchmarkClose;
      comparison.push({
        date: point.date,
        interval: point.interval,
        portfolio: 100,
        benchmark: 100,
      });
      continue;
    }

    if (
      previousComparablePoint.value <= 0 ||
      previousBenchmarkClose == null ||
      previousBenchmarkClose <= 0
    ) {
      previousComparablePoint = point;
      previousBenchmarkClose = lastBenchmarkClose;
      portfolioIndexValue = 100;
      benchmarkIndexValue = 100;
      comparison.push({
        date: point.date,
        interval: point.interval,
        portfolio: 100,
        benchmark: 100,
      });
      continue;
    }

    const adjustedPortfolioEndingValue = normalizeMoney(point.value - point.netCashFlow);
    const portfolioReturn = adjustedPortfolioEndingValue / previousComparablePoint.value - 1;
    const benchmarkReturn = lastBenchmarkClose / previousBenchmarkClose - 1;

    portfolioIndexValue = normalizeMoney(portfolioIndexValue * (1 + portfolioReturn));
    benchmarkIndexValue = normalizeMoney(benchmarkIndexValue * (1 + benchmarkReturn));
    comparison.push({
      date: point.date,
      interval: point.interval,
      portfolio: portfolioIndexValue,
      benchmark: benchmarkIndexValue,
    });
    previousComparablePoint = point;
    previousBenchmarkClose = lastBenchmarkClose;
  }

  return comparison;
}

export function buildAbsoluteComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = [],
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}): ReturnPerformancePoint[] {
  const orderedBenchmarkRows = getOrderedBenchmarkPricePoints({
    benchmarkIntradayRows,
    benchmarkRows,
  });

  if (portfolioSeries.length === 0 || orderedBenchmarkRows.length === 0) {
    return [];
  }

  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let baselineBenchmarkClose: number | null = null;
  let netInvested = 0;
  const comparison: ReturnPerformancePoint[] = [];

  for (const point of portfolioSeries) {
    netInvested = normalizeMoney(netInvested + point.netCashFlow);

    while (
      benchmarkRowIndex < orderedBenchmarkRows.length &&
      orderedBenchmarkRows[benchmarkRowIndex].priceAt <= point.date
    ) {
      lastBenchmarkClose = orderedBenchmarkRows[benchmarkRowIndex].close;
      benchmarkRowIndex += 1;
    }

    if (netInvested <= 0 || lastBenchmarkClose == null || lastBenchmarkClose <= 0) {
      continue;
    }

    if (baselineBenchmarkClose == null) {
      baselineBenchmarkClose = lastBenchmarkClose;
    }

    if (baselineBenchmarkClose <= 0) {
      continue;
    }

    const portfolioReturnPercent = toPercentReturn(netInvested, point.value);
    const benchmarkReturnPercent = toPercentReturn(baselineBenchmarkClose, lastBenchmarkClose);

    if (portfolioReturnPercent == null || benchmarkReturnPercent == null) {
      continue;
    }

    comparison.push(
      toReturnPerformancePoint({
        date: point.date,
        interval: point.interval,
        annualized: false,
        portfolioReturnPercent,
        benchmarkReturnPercent,
      }),
    );
  }

  return comparison;
}

export function buildMoneyWeightedComparisonSeries({
  transactions,
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = [],
}: {
  transactions: TimelineTransaction[];
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}): ReturnPerformancePoint[] {
  const orderedBenchmarkRows = getOrderedBenchmarkPricePoints({
    benchmarkIntradayRows,
    benchmarkRows,
  });

  if (portfolioSeries.length === 0 || orderedBenchmarkRows.length === 0) {
    return [];
  }

  const firstPoint = portfolioSeries[0];
  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let baselineBenchmarkClose: number | null = null;
  let baselineBenchmarkDate: string | null = null;
  let cashFlowIndex = 0;
  const orderedCashFlows = sortTransactionsChronologically(transactions).map((transaction) => ({
    date: toDayStartTimestamp(transaction.tradeDate),
    amount: -getExternalCashFlow(transaction),
  }));
  const realizedCashFlows: Array<{ date: string; amount: number }> = [];
  const comparison: ReturnPerformancePoint[] = [];

  for (const point of portfolioSeries) {
    while (
      cashFlowIndex < orderedCashFlows.length &&
      orderedCashFlows[cashFlowIndex].date <= point.date
    ) {
      realizedCashFlows.push(orderedCashFlows[cashFlowIndex]);
      cashFlowIndex += 1;
    }

    while (
      benchmarkRowIndex < orderedBenchmarkRows.length &&
      orderedBenchmarkRows[benchmarkRowIndex].priceAt <= point.date
    ) {
      lastBenchmarkClose = orderedBenchmarkRows[benchmarkRowIndex].close;
      benchmarkRowIndex += 1;
    }

    if (point.value <= 0 || lastBenchmarkClose == null || lastBenchmarkClose <= 0) {
      continue;
    }

    if (baselineBenchmarkClose == null) {
      baselineBenchmarkClose = lastBenchmarkClose;
      baselineBenchmarkDate = point.date;
    }

    const mwr = calculateXirr([
      ...realizedCashFlows,
      {
        date: point.date,
        amount: point.value,
      },
    ]);

    if (mwr == null || baselineBenchmarkClose <= 0 || baselineBenchmarkDate == null) {
      continue;
    }

    if (daysBetween(baselineBenchmarkDate, point.date) < MIN_MONEY_WEIGHTED_ANNUALIZATION_DAYS) {
      continue;
    }

    const benchmarkReturnPercent = calculateAnnualizedReturnPercent({
      startDate: baselineBenchmarkDate,
      endDate: point.date,
      startValue: baselineBenchmarkClose,
      endValue: lastBenchmarkClose,
    });

    if (benchmarkReturnPercent == null) {
      continue;
    }

    comparison.push(
      toReturnPerformancePoint({
        date: point.date,
        interval: point.interval,
        annualized: true,
        portfolioReturnPercent: mwr * 100,
        benchmarkReturnPercent,
      }),
    );
  }

  if (comparison.length === 0 && firstPoint.value > 0) {
    return [];
  }

  return comparison;
}
