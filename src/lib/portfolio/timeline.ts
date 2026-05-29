import {
  createEmptyPerformanceSeries,
  toIndexedPerformancePoint,
  type PortfolioPerformanceSeries,
} from "@/lib/portfolio/performance-series";
import {
  buildAbsoluteComparisonSeries,
  buildCashFlowAdjustedComparisonSeries,
  buildMoneyWeightedComparisonSeries,
} from "@/lib/portfolio/timeline-comparison";
import { buildPortfolioValueSeries } from "@/lib/portfolio/timeline-value-series";
import type {
  PortfolioBenchmarkTimeline,
  TimelineHistoricalPrice,
  TimelineInstrument,
  TimelineIntradayPrice,
  TimelineTransaction,
} from "@/lib/portfolio/timeline-types";

export type {
  BenchmarkComparisonBasis,
  BenchmarkTimelinePoint,
  PortfolioBenchmarkTimeline,
  PortfolioBenchmarkTimelineStatus,
  PortfolioTimelinePoint,
  TimelineHistoricalPrice,
  TimelineInstrument,
  TimelineIntradayPrice,
  TimelinePointInterval,
  TimelineTransaction,
} from "@/lib/portfolio/timeline-types";

function getCurrentUtcIsoDate(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
  const today = getCurrentUtcIsoDate();
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
