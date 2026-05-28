import { normalizeMoney } from "@/lib/db/precision";
import {
  createEmptyPerformanceSeries,
  toIndexedPerformancePoint,
  type PerformancePointInterval,
  type PortfolioPerformanceSeries,
  type ReturnPerformancePoint,
} from "@/lib/portfolio/performance-series";
import {
  applyTransaction,
  sortTransactionsChronologically,
  type InstrumentPosition,
} from "@/lib/portfolio/positions";
import {
  buildAbsoluteComparisonSeries,
  buildCashFlowAdjustedComparisonSeries,
  buildMoneyWeightedComparisonSeries,
  type PortfolioValuationPoint,
} from "@/lib/portfolio/timeline-comparison";
import {
  advancePriceState,
  buildPriceStates,
  getTimelineAnchors,
  toDailyPricePoints,
  toDayStartTimestamp,
  toIntradayPricePoints,
  toTradeDay,
} from "@/lib/portfolio/timeline-price-points";
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
