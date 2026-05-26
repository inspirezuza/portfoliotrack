import { normalizeMoney } from "@/lib/db/precision";
import {
  applyTransaction,
  sortTransactionsChronologically,
  type InstrumentPosition
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

export type TimelinePointInterval = "1d" | TimelineIntradayPrice["interval"];

export type PortfolioTimelinePoint = {
  date: string;
  value: number;
  interval?: TimelinePointInterval;
};

type PortfolioValuationPoint = PortfolioTimelinePoint & {
  netCashFlow: number;
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
  moneyWeightedComparison: BenchmarkTimelinePoint[];
  absoluteComparison: BenchmarkTimelinePoint[];
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
    totalFees: 0
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
  }>
) {
  const rowsByInstrument = new Map<number, Array<{ priceAt: string; close: number }>>();

  for (const row of rows) {
    const instrumentRows = rowsByInstrument.get(row.instrumentId) ?? [];
    instrumentRows.push({
      priceAt: row.priceAt,
      close: row.close
    });
    rowsByInstrument.set(row.instrumentId, instrumentRows);
  }

  return new Map(
    Array.from(rowsByInstrument.entries()).map(([instrumentId, instrumentRows]) => {
      const sortedRows = [...instrumentRows].sort((left, right) =>
        left.priceAt.localeCompare(right.priceAt)
      );

      return [
        instrumentId,
        {
          rows: sortedRows,
          index: 0,
          lastClose: null,
          latestPriceAt: sortedRows[sortedRows.length - 1]?.priceAt ?? null
        } satisfies PriceState
      ];
    })
  );
}

function advancePriceState(priceState: PriceState | undefined, priceAt: string) {
  if (priceState == null) {
    return null;
  }

  while (priceState.index < priceState.rows.length && priceState.rows[priceState.index].priceAt <= priceAt) {
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
    interval: "1d"
  }));
}

function toIntradayPricePoints(rows: TimelineIntradayPrice[]): TimelinePricePoint[] {
  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    priceAt: row.observedAt,
    close: row.close,
    currency: row.currency,
    interval: row.interval
  }));
}

function getTimelineAnchors(
  pricePoints: Array<{
    priceAt: string;
    interval: TimelinePointInterval;
  }>
) {
  const anchorsByPriceAt = new Map<string, TimelinePointInterval>();

  for (const point of pricePoints) {
    anchorsByPriceAt.set(point.priceAt, point.interval);
  }

  return Array.from(anchorsByPriceAt, ([priceAt, interval]) => ({
    priceAt,
    interval
  })).sort((left, right) => left.priceAt.localeCompare(right.priceAt));
}

function buildPortfolioValueSeries({
  baselineDate,
  transactions,
  historicalPrices,
  intradayPrices = []
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
    ...toIntradayPricePoints(intradayPrices)
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
      const position = positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

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
        netCashFlow: pendingCashFlow
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
  benchmarkIntradayRows = []
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows)
  ].sort((left, right) =>
    left.priceAt.localeCompare(right.priceAt)
  );

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
        benchmark: 100
      });
      continue;
    }

    if (previousComparablePoint.value <= 0 || previousBenchmarkClose == null || previousBenchmarkClose <= 0) {
      previousComparablePoint = point;
      previousBenchmarkClose = lastBenchmarkClose;
      portfolioIndexValue = 100;
      benchmarkIndexValue = 100;
      comparison.push({
        date: point.date,
        interval: point.interval,
        portfolio: 100,
        benchmark: 100
      });
      continue;
    }

    const adjustedPortfolioEndingValue = normalizeMoney(point.value - point.netCashFlow);
    const portfolioReturn =
      adjustedPortfolioEndingValue / previousComparablePoint.value - 1;
    const benchmarkReturn = lastBenchmarkClose / previousBenchmarkClose - 1;

    portfolioIndexValue = normalizeMoney(portfolioIndexValue * (1 + portfolioReturn));
    benchmarkIndexValue = normalizeMoney(benchmarkIndexValue * (1 + benchmarkReturn));
    comparison.push({
      date: point.date,
      interval: point.interval,
      portfolio: portfolioIndexValue,
      benchmark: benchmarkIndexValue
    });
    previousComparablePoint = point;
    previousBenchmarkClose = lastBenchmarkClose;
  }

  return comparison;
}

function buildAbsoluteComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = []
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows)
  ].sort((left, right) =>
    left.priceAt.localeCompare(right.priceAt)
  );

  if (portfolioSeries.length === 0 || orderedBenchmarkRows.length === 0) {
    return [];
  }

  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let baselineBenchmarkClose: number | null = null;
  let netInvested = 0;
  const comparison: BenchmarkTimelinePoint[] = [];

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

    comparison.push({
      date: point.date,
      interval: point.interval,
      portfolio: normalizeMoney((point.value / netInvested) * 100),
      benchmark: normalizeMoney((lastBenchmarkClose / baselineBenchmarkClose) * 100)
    });
  }

  return comparison;
}

function daysBetween(startDate: string, endDate: string) {
  const startTime = Date.parse(toDayStartTimestamp(toTradeDay(startDate)));
  const endTime = Date.parse(toDayStartTimestamp(toTradeDay(endDate)));

  return (endTime - startTime) / 86_400_000;
}

function calculateNetPresentValue(
  cashFlows: Array<{ date: string; amount: number }>,
  annualRate: number
) {
  const firstDate = cashFlows[0]?.date;

  if (firstDate == null || annualRate <= -1) {
    return null;
  }

  return cashFlows.reduce((total, cashFlow) => {
    const years = daysBetween(firstDate, cashFlow.date) / 365;

    return total + cashFlow.amount / Math.pow(1 + annualRate, years);
  }, 0);
}

function calculateXirr(cashFlows: Array<{ date: string; amount: number }>) {
  const validCashFlows = cashFlows.filter((cashFlow) => cashFlow.amount !== 0);
  const hasPositive = validCashFlows.some((cashFlow) => cashFlow.amount > 0);
  const hasNegative = validCashFlows.some((cashFlow) => cashFlow.amount < 0);

  if (validCashFlows.length < 2 || !hasPositive || !hasNegative) {
    return null;
  }

  let low = -0.9999;
  let high = 10;
  let lowValue = calculateNetPresentValue(validCashFlows, low);
  let highValue = calculateNetPresentValue(validCashFlows, high);

  for (let expansion = 0; expansion < 8 && lowValue != null && highValue != null && lowValue * highValue > 0; expansion += 1) {
    high *= 2;
    highValue = calculateNetPresentValue(validCashFlows, high);
  }

  if (lowValue == null || highValue == null || lowValue * highValue > 0) {
    return null;
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const midValue = calculateNetPresentValue(validCashFlows, mid);

    if (midValue == null || Math.abs(midValue) < 0.000001) {
      return mid;
    }

    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return (low + high) / 2;
}

function buildMoneyWeightedComparisonSeries({
  portfolioSeries,
  benchmarkRows,
  benchmarkIntradayRows = []
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
  benchmarkIntradayRows?: TimelineIntradayPrice[];
}) {
  const orderedBenchmarkRows = [
    ...toDailyPricePoints(benchmarkRows),
    ...toIntradayPricePoints(benchmarkIntradayRows)
  ].sort((left, right) =>
    left.priceAt.localeCompare(right.priceAt)
  );

  if (portfolioSeries.length === 0 || orderedBenchmarkRows.length === 0) {
    return [];
  }

  const firstPoint = portfolioSeries[0];
  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let baselineBenchmarkClose: number | null = null;
  const realizedCashFlows: Array<{ date: string; amount: number }> = [];
  const comparison: BenchmarkTimelinePoint[] = [];

  for (const point of portfolioSeries) {
    if (point.netCashFlow !== 0) {
      realizedCashFlows.push({
        date: point.date,
        amount: -point.netCashFlow
      });
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
    }

    const mwr = calculateXirr([
      ...realizedCashFlows,
      {
        date: point.date,
        amount: point.value
      }
    ]);

    if (mwr == null || baselineBenchmarkClose <= 0) {
      continue;
    }

    comparison.push({
      date: point.date,
      interval: point.interval,
      portfolio: normalizeMoney(100 * (1 + mwr)),
      benchmark: normalizeMoney((lastBenchmarkClose / baselineBenchmarkClose) * 100)
    });
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
  benchmarkSymbol
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
  const nonFutureTransactions = transactions.filter((transaction) => transaction.tradeDate <= today);

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
      absoluteComparison: []
    };
  }

  const instrumentsById = new Map(instruments.map((instrument) => [instrument.instrumentId, instrument]));
  const validHistoricalPrices = historicalPrices.filter((row) => {
    const instrument = instrumentsById.get(row.instrumentId);

    return instrument != null && row.currency === instrument.currency && row.priceDate <= today;
  });
  const validIntradayPrices = intradayPrices.filter((row) => {
    const instrument = instrumentsById.get(row.instrumentId);

    return instrument != null && row.currency === instrument.currency && row.observedAt.slice(0, 10) <= today;
  });
  const baselineDate =
    nonFutureTransactions
      .map((transaction) => transaction.tradeDate)
      .sort((left, right) => left.localeCompare(right))[0];
  const portfolioCurrencies = Array.from(
    new Set(
      nonFutureTransactions
        .map((transaction) => instrumentsById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null)
    )
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
      absoluteComparison: []
    };
  }

  const portfolioCurrency =
    portfolioCurrencies.length === 1 ? portfolioCurrencies[0] : null;

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
      absoluteComparison: []
    };
  }

  const relevantInstrumentIds = new Set(nonFutureTransactions.map((transaction) => transaction.instrumentId));
  const portfolioHistoricalPrices = validHistoricalPrices.filter((row) =>
    relevantInstrumentIds.has(row.instrumentId) && row.priceDate >= baselineDate
  );
  const portfolioIntradayPrices = validIntradayPrices.filter((row) =>
    relevantInstrumentIds.has(row.instrumentId) && row.observedAt.slice(0, 10) >= baselineDate
  );
  const portfolioValuationSeries = buildPortfolioValueSeries({
    baselineDate,
    transactions: nonFutureTransactions,
    historicalPrices: portfolioHistoricalPrices,
    intradayPrices: portfolioIntradayPrices
  });
  const portfolioSeries = portfolioValuationSeries.map(({ date, interval, value }) => ({
    date,
    interval,
    value
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
      absoluteComparison: []
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
      absoluteComparison: []
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
    .filter((row) => benchmarkCurrency != null && row.currency === benchmarkCurrency && row.priceDate <= today)
    .filter((row) => row.instrumentId === benchmarkInstrumentId && row.priceDate >= baselineDate)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  const benchmarkIntradayPrices = intradayPrices
    .filter((row) => benchmarkCurrency != null && row.currency === benchmarkCurrency && row.observedAt.slice(0, 10) <= today)
    .filter((row) => row.instrumentId === benchmarkInstrumentId && row.observedAt.slice(0, 10) >= baselineDate)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const comparisonSeries = buildCashFlowAdjustedComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices
  });
  const moneyWeightedComparisonSeries = buildMoneyWeightedComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices
  });
  const absoluteComparisonSeries = buildAbsoluteComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices,
    benchmarkIntradayRows: benchmarkIntradayPrices
  });

  return {
    status: comparisonSeries.length > 0 || absoluteComparisonSeries.length > 0 || moneyWeightedComparisonSeries.length > 0 ? "ready" : "missing-benchmark-history",
    baselineDate,
    portfolioCurrency,
    benchmarkSymbol,
    benchmarkCurrency,
    comparisonBasis,
    portfolio: portfolioSeries,
    comparison: comparisonSeries,
    moneyWeightedComparison: moneyWeightedComparisonSeries,
    absoluteComparison: absoluteComparisonSeries
  };
}
