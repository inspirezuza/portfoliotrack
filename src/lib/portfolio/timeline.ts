import { normalizeMoney } from "@/lib/db/precision";
import {
  createEmptyPerformanceSeries,
  toIndexedPerformancePoint,
  toPercentReturn,
  toReturnPerformancePoint,
  type PerformancePointInterval,
  type PortfolioPerformanceSeries,
  type ReturnPerformancePoint,
} from "@/lib/portfolio/performance-series";
import {
  calculateAnnualizedReturnPercent,
  calculateXirr,
  daysBetween,
} from "@/lib/portfolio/money-weighted";
import {
  applyTransaction,
  sortTransactionsChronologically,
  type InstrumentPosition,
} from "@/lib/portfolio/positions";
import type { TransactionSide } from "@/lib/validation/transaction";

export type TimelineInstrument = {
  instrumentId: number;
  symbol: string;
  currency: string;
};

export type TimelineTransaction = {
  instrumentId: number;
  tradeDate: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  createdAt?: string | null;
  id?: number;
};

export type TimelineHistoricalPrice = {
  instrumentId: number;
  priceDate: string;
  close: number;
  currency: string;
};

export type TimelineIntradayPrice = {
  instrumentId: number;
  observedAt: string;
  close: number;
  currency: string;
  interval: "5m" | "15m" | "1h";
};

export type TimelinePointInterval = PerformancePointInterval;

export type PortfolioTimelinePoint = {
  date: string;
  value: number;
  interval?: TimelinePointInterval;
};

type PortfolioValuationPoint = PortfolioTimelinePoint & {
  netCashFlow: number;
};

const MIN_MONEY_WEIGHTED_ANNUALIZATION_DAYS = 30;

export type BenchmarkTimelinePoint = {
  date: string;
  portfolio: number;
  benchmark: number;
  interval?: TimelinePointInterval;
};

export type PortfolioBenchmarkTimelineStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "benchmark-currency-mismatch"
  | "missing-portfolio-history"
  | "missing-benchmark-history";

export type BenchmarkComparisonBasis = "same-currency" | "native-currency-return";

export type PortfolioBenchmarkTimeline = {
  status: PortfolioBenchmarkTimelineStatus;
  baselineDate: string | null;
  portfolioCurrency: string | null;
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolio: PortfolioTimelinePoint[];
  comparison: BenchmarkTimelinePoint[];
  moneyWeightedComparison: ReturnPerformancePoint[];
  absoluteComparison: ReturnPerformancePoint[];
  performanceSeries: PortfolioPerformanceSeries;
};

type PriceState = {
  rows: Array<{
    priceAt: string;
    close: number;
  }>;
  index: number;
  lastClose: number | null;
  latestPriceAt: string | null;
};

type TimelinePricePoint = {
  instrumentId: number;
  priceAt: string;
  close: number;
  currency: string;
  interval: TimelinePointInterval;
};

function createEmptyPosition(instrumentId: number): InstrumentPosition {
  return {
    instrumentId,
    quantity: 0,
    averageCost: 0,
    totalCost: 0,
    realizedPnl: 0,
    totalFees: 0,
  };
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getExternalCashFlow(transaction: TimelineTransaction) {
  const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

  return transaction.side === "BUY"
    ? normalizeMoney(grossAmount + transaction.fee)
    : normalizeMoney(-(grossAmount - transaction.fee));
}

function toDayStartTimestamp(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toTradeDay(value: string) {
  return value.slice(0, 10);
}

function buildPriceStates(
  rows: Array<{
    instrumentId: number;
    priceAt: string;
    close: number;
  }>,
) {
  const rowsByInstrument = new Map<number, Array<{ priceAt: string; close: number }>>();

  for (const row of rows) {
    const instrumentRows = rowsByInstrument.get(row.instrumentId) ?? [];
    instrumentRows.push({
      priceAt: row.priceAt,
      close: row.close,
    });
    rowsByInstrument.set(row.instrumentId, instrumentRows);
  }

  return new Map(
    Array.from(rowsByInstrument.entries()).map(([instrumentId, instrumentRows]) => {
      const sortedRows = [...instrumentRows].sort((left, right) =>
        left.priceAt.localeCompare(right.priceAt),
      );

      return [
        instrumentId,
        {
          rows: sortedRows,
          index: 0,
          lastClose: null,
          latestPriceAt: sortedRows[sortedRows.length - 1]?.priceAt ?? null,
        } satisfies PriceState,
      ];
    }),
  );
}

function advancePriceState(priceState: PriceState | undefined, priceAt: string) {
  if (priceState == null) {
    return null;
  }

  while (
    priceState.index < priceState.rows.length &&
    priceState.rows[priceState.index].priceAt <= priceAt
  ) {
    priceState.lastClose = priceState.rows[priceState.index].close;
    priceState.index += 1;
  }

  return priceState.lastClose;
}

function toDailyPricePoints(rows: TimelineHistoricalPrice[]): TimelinePricePoint[] {
  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    priceAt: toDayStartTimestamp(row.priceDate),
    close: row.close,
    currency: row.currency,
    interval: "1d",
  }));
}

function toIntradayPricePoints(rows: TimelineIntradayPrice[]): TimelinePricePoint[] {
  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    priceAt: row.observedAt,
    close: row.close,
    currency: row.currency,
    interval: row.interval,
  }));
}

function getTimelineAnchors(
  pricePoints: Array<{
    priceAt: string;
    interval: TimelinePointInterval;
  }>,
) {
  const anchorsByPriceAt = new Map<string, TimelinePointInterval>();

  for (const point of pricePoints) {
    anchorsByPriceAt.set(point.priceAt, point.interval);
  }

  return Array.from(anchorsByPriceAt, ([priceAt, interval]) => ({
    priceAt,
    interval,
  })).sort((left, right) => left.priceAt.localeCompare(right.priceAt));
}

function buildPortfolioValueSeries({
  baselineDate,
  transactions,
  historicalPrices,
  intradayPrices = [],
}: {
  baselineDate: string;
  transactions: TimelineTransaction[];
  historicalPrices: TimelineHistoricalPrice[];
  intradayPrices?: TimelineIntradayPrice[];
}) {
  const orderedTransactions = sortTransactionsChronologically(transactions);
  const baselineAt = toDayStartTimestamp(baselineDate);
  const pricePoints = [
    ...toDailyPricePoints(historicalPrices),
    ...toIntradayPricePoints(intradayPrices),
  ];
  const priceAnchors = getTimelineAnchors(pricePoints.filter((row) => row.priceAt >= baselineAt));
  const priceStates = buildPriceStates(pricePoints);
  const positions = new Map<number, InstrumentPosition>();
  const series: PortfolioValuationPoint[] = [];
  let transactionIndex = 0;
  let pendingCashFlow = 0;

  for (const anchor of priceAnchors) {
    const date = anchor.priceAt;

    while (
      transactionIndex < orderedTransactions.length &&
      orderedTransactions[transactionIndex].tradeDate <= toTradeDay(date)
    ) {
      const transaction = orderedTransactions[transactionIndex];
      const position =
        positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

      applyTransaction(position, transaction);
      positions.set(transaction.instrumentId, position);
      pendingCashFlow = normalizeMoney(pendingCashFlow + getExternalCashFlow(transaction));
      transactionIndex += 1;
    }

    let totalValue = 0;
    let canValuePortfolio = true;
    let hasOpenPosition = false;

    for (const position of positions.values()) {
      if (position.quantity <= 0) {
        continue;
      }

      hasOpenPosition = true;
      const close = advancePriceState(priceStates.get(position.instrumentId), date);

      if (close == null) {
        canValuePortfolio = false;
        break;
      }

      totalValue = normalizeMoney(totalValue + position.quantity * close);
    }

    if (canValuePortfolio && (hasOpenPosition || pendingCashFlow !== 0)) {
      series.push({
        date,
        interval: anchor.interval,
        value: totalValue,
        netCashFlow: pendingCashFlow,
      });
      pendingCashFlow = 0;
    }
  }

  if (series.length === 0) {
    return [];
  }

  return series;
}

function buildCashFlowAdjustedComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = [],
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows),
  ].sort((left, right) => left.priceAt.localeCompare(right.priceAt));

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

function buildAbsoluteComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = [],
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}): ReturnPerformancePoint[] {
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows),
  ].sort((left, right) => left.priceAt.localeCompare(right.priceAt));

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

function buildMoneyWeightedComparisonSeries({
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
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows),
  ].sort((left, right) => left.priceAt.localeCompare(right.priceAt));

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

export function buildPortfolioBenchmarkTimeline({
  instruments,
  transactions,
  historicalPrices,
  intradayPrices = [],
  benchmarkInstrumentId,
  benchmarkCurrency: benchmarkCurrencyOverride = null,
  benchmarkSymbol,
}: {
  instruments: TimelineInstrument[];
  transactions: TimelineTransaction[];
  historicalPrices: TimelineHistoricalPrice[];
  intradayPrices?: TimelineIntradayPrice[];
  benchmarkInstrumentId: number | null;
  benchmarkCurrency?: string | null;
  benchmarkSymbol: string | null;
}): PortfolioBenchmarkTimeline {
  const today = getCurrentLocalIsoDate();
  const nonFutureTransactions = transactions.filter(
    (transaction) => transaction.tradeDate <= today,
  );

  if (nonFutureTransactions.length === 0) {
    return {
      status: "no-transactions",
      baselineDate: null,
      portfolioCurrency: null,
      benchmarkSymbol,
      benchmarkCurrency: null,
      comparisonBasis: null,
      portfolio: [],
      comparison: [],
      moneyWeightedComparison: [],
      absoluteComparison: [],
      performanceSeries: createEmptyPerformanceSeries(),
    };
  }

  const instrumentsById = new Map(
    instruments.map((instrument) => [instrument.instrumentId, instrument]),
  );
  const validHistoricalPrices = historicalPrices.filter((row) => {
    const instrument = instrumentsById.get(row.instrumentId);

    return instrument != null && row.currency === instrument.currency && row.priceDate <= today;
  });
  const validIntradayPrices = intradayPrices.filter((row) => {
    const instrument = instrumentsById.get(row.instrumentId);

    return (
      instrument != null &&
      row.currency === instrument.currency &&
      row.observedAt.slice(0, 10) <= today
    );
  });
  const baselineDate = nonFutureTransactions
    .map((transaction) => transaction.tradeDate)
    .sort((left, right) => left.localeCompare(right))[0];
  const portfolioCurrencies = Array.from(
    new Set(
      nonFutureTransactions
        .map((transaction) => instrumentsById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null),
    ),
  );

  if (baselineDate == null) {
    return {
      status: "missing-portfolio-history",
      baselineDate,
      portfolioCurrency: portfolioCurrencies.length === 1 ? portfolioCurrencies[0] : null,
      benchmarkSymbol,
      benchmarkCurrency: null,
      comparisonBasis: null,
      portfolio: [],
      comparison: [],
      moneyWeightedComparison: [],
      absoluteComparison: [],
      performanceSeries: createEmptyPerformanceSeries(),
    };
  }

  const portfolioCurrency = portfolioCurrencies.length === 1 ? portfolioCurrencies[0] : null;

  if (portfolioCurrency == null) {
    return {
      status: "mixed-currency",
      baselineDate,
      portfolioCurrency: null,
      benchmarkSymbol,
      benchmarkCurrency: null,
      comparisonBasis: null,
      portfolio: [],
      comparison: [],
      moneyWeightedComparison: [],
      absoluteComparison: [],
      performanceSeries: createEmptyPerformanceSeries(),
    };
  }

  const relevantInstrumentIds = new Set(
    nonFutureTransactions.map((transaction) => transaction.instrumentId),
  );
  const portfolioHistoricalPrices = validHistoricalPrices.filter(
    (row) => relevantInstrumentIds.has(row.instrumentId) && row.priceDate >= baselineDate,
  );
  const portfolioIntradayPrices = validIntradayPrices.filter(
    (row) =>
      relevantInstrumentIds.has(row.instrumentId) && row.observedAt.slice(0, 10) >= baselineDate,
  );
  const portfolioValuationSeries = buildPortfolioValueSeries({
    baselineDate,
    transactions: nonFutureTransactions,
    historicalPrices: portfolioHistoricalPrices,
    intradayPrices: portfolioIntradayPrices,
  });
  const portfolioSeries = portfolioValuationSeries.map(({ date, interval, value }) => ({
    date,
    interval,
    value,
  }));

  if (portfolioSeries.length === 0) {
    return {
      status: "missing-portfolio-history",
      baselineDate,
      portfolioCurrency,
      benchmarkSymbol,
      benchmarkCurrency: null,
      comparisonBasis: null,
      portfolio: [],
      comparison: [],
      moneyWeightedComparison: [],
      absoluteComparison: [],
      performanceSeries: createEmptyPerformanceSeries(),
    };
  }

  if (benchmarkInstrumentId == null) {
    return {
      status: "missing-benchmark-history",
      baselineDate,
      portfolioCurrency,
      benchmarkSymbol,
      benchmarkCurrency: null,
      comparisonBasis: null,
      portfolio: portfolioSeries,
      comparison: [],
      moneyWeightedComparison: [],
      absoluteComparison: [],
      performanceSeries: createEmptyPerformanceSeries(),
    };
  }

  const benchmarkInstrument = instrumentsById.get(benchmarkInstrumentId);

  const benchmarkCurrency = benchmarkCurrencyOverride ?? benchmarkInstrument?.currency ?? null;
  const comparisonBasis =
    benchmarkCurrency == null
      ? null
      : benchmarkCurrency === portfolioCurrency
        ? "same-currency"
        : "native-currency-return";

  const benchmarkHistoricalPrices = historicalPrices
    .filter(
      (row) =>
        benchmarkCurrency != null && row.currency === benchmarkCurrency && row.priceDate <= today,
    )
    .filter((row) => row.instrumentId === benchmarkInstrumentId && row.priceDate >= baselineDate)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  const benchmarkIntradayPrices = intradayPrices
    .filter(
      (row) =>
        benchmarkCurrency != null &&
        row.currency === benchmarkCurrency &&
        row.observedAt.slice(0, 10) <= today,
    )
    .filter(
      (row) =>
        row.instrumentId === benchmarkInstrumentId && row.observedAt.slice(0, 10) >= baselineDate,
    )
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const comparisonSeries = buildCashFlowAdjustedComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices,
  });
  const moneyWeightedComparisonSeries = buildMoneyWeightedComparisonSeries({
    transactions: nonFutureTransactions,
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices,
  });
  const absoluteComparisonSeries = buildAbsoluteComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices,
  });
  const performanceSeries: PortfolioPerformanceSeries = {
    twr: comparisonSeries.map(toIndexedPerformancePoint),
    mwr: moneyWeightedComparisonSeries,
    absolute: absoluteComparisonSeries,
  };

  return {
    status:
      comparisonSeries.length > 0 ||
      absoluteComparisonSeries.length > 0 ||
      moneyWeightedComparisonSeries.length > 0
        ? "ready"
        : "missing-benchmark-history",
    baselineDate,
    portfolioCurrency,
    benchmarkSymbol,
    benchmarkCurrency,
    comparisonBasis,
    portfolio: portfolioSeries,
    comparison: comparisonSeries,
    moneyWeightedComparison: moneyWeightedComparisonSeries,
    absoluteComparison: absoluteComparisonSeries,
    performanceSeries,
  };
}
