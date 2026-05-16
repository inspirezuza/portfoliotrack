import { normalizeMoney } from "@/lib/db/precision";
import {
  applyTransaction,
  calculatePositions,
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

export type PortfolioTimelinePoint = {
  date: string;
  value: number;
};

type PortfolioValuationPoint = PortfolioTimelinePoint & {
  netCashFlow: number;
};

export type BenchmarkTimelinePoint = {
  date: string;
  portfolio: number;
  benchmark: number;
};

export type PortfolioBenchmarkTimelineStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "benchmark-currency-mismatch"
  | "missing-portfolio-history"
  | "missing-benchmark-history";

export type PortfolioBenchmarkTimeline = {
  status: PortfolioBenchmarkTimelineStatus;
  baselineDate: string | null;
  portfolioCurrency: string | null;
  benchmarkSymbol: string | null;
  portfolio: PortfolioTimelinePoint[];
  comparison: BenchmarkTimelinePoint[];
};

type PriceState = {
  rows: TimelineHistoricalPrice[];
  index: number;
  lastClose: number | null;
  latestPriceDate: string | null;
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

function sortTimelineDates(dates: Iterable<string>) {
  return Array.from(new Set(dates)).sort((left, right) => left.localeCompare(right));
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

function buildPriceStates(rows: TimelineHistoricalPrice[]) {
  const rowsByInstrument = new Map<number, TimelineHistoricalPrice[]>();

  for (const row of rows) {
    const instrumentRows = rowsByInstrument.get(row.instrumentId) ?? [];
    instrumentRows.push(row);
    rowsByInstrument.set(row.instrumentId, instrumentRows);
  }

  return new Map(
    Array.from(rowsByInstrument.entries()).map(([instrumentId, instrumentRows]) => {
      const sortedRows = [...instrumentRows].sort((left, right) =>
        left.priceDate.localeCompare(right.priceDate)
      );

      return [
        instrumentId,
        {
          rows: sortedRows,
          index: 0,
          lastClose: null,
          latestPriceDate: sortedRows[sortedRows.length - 1]?.priceDate ?? null
        } satisfies PriceState
      ];
    })
  );
}

function advancePriceState(priceState: PriceState | undefined, date: string) {
  if (priceState == null) {
    return null;
  }

  if (priceState.latestPriceDate != null && date > priceState.latestPriceDate) {
    return null;
  }

  while (priceState.index < priceState.rows.length && priceState.rows[priceState.index].priceDate <= date) {
    priceState.lastClose = priceState.rows[priceState.index].close;
    priceState.index += 1;
  }

  return priceState.lastClose;
}

function buildPortfolioValueSeries({
  baselineDate,
  transactions,
  historicalPrices
}: {
  baselineDate: string;
  transactions: TimelineTransaction[];
  historicalPrices: TimelineHistoricalPrice[];
}) {
  const orderedTransactions = sortTransactionsChronologically(transactions);
  const priceDates = sortTimelineDates(
    historicalPrices.filter((row) => row.priceDate >= baselineDate).map((row) => row.priceDate)
  );
  const priceStates = buildPriceStates(historicalPrices);
  const positions = new Map<number, InstrumentPosition>();
  const series: PortfolioValuationPoint[] = [];
  let transactionIndex = 0;
  let pendingCashFlow = 0;

  for (const date of priceDates) {
    while (
      transactionIndex < orderedTransactions.length &&
      orderedTransactions[transactionIndex].tradeDate <= date
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

    for (const position of positions.values()) {
      if (position.quantity <= 0) {
        continue;
      }

      const close = advancePriceState(priceStates.get(position.instrumentId), date);

      if (close == null) {
        canValuePortfolio = false;
        break;
      }

      totalValue = normalizeMoney(totalValue + position.quantity * close);
    }

    if (canValuePortfolio) {
      series.push({
        date,
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
  benchmarkRows
}: {
  portfolioSeries: PortfolioValuationPoint[];
  benchmarkRows: TimelineHistoricalPrice[];
}) {
  if (portfolioSeries.length === 0 || benchmarkRows.length === 0) {
    return [];
  }

  const orderedBenchmarkRows = [...benchmarkRows].sort((left, right) =>
    left.priceDate.localeCompare(right.priceDate)
  );
  const latestBenchmarkPriceDate = orderedBenchmarkRows[orderedBenchmarkRows.length - 1]?.priceDate ?? null;
  let benchmarkRowIndex = 0;
  let lastBenchmarkClose: number | null = null;
  let previousComparablePoint: PortfolioValuationPoint | null = null;
  let previousBenchmarkClose: number | null = null;
  let portfolioIndexValue = 100;
  let benchmarkIndexValue = 100;
  const comparison: BenchmarkTimelinePoint[] = [];

  for (const point of portfolioSeries) {
    if (latestBenchmarkPriceDate != null && point.date > latestBenchmarkPriceDate) {
      break;
    }

    while (
      benchmarkRowIndex < orderedBenchmarkRows.length &&
      orderedBenchmarkRows[benchmarkRowIndex].priceDate <= point.date
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
      portfolio: portfolioIndexValue,
      benchmark: benchmarkIndexValue
    });
    previousComparablePoint = point;
    previousBenchmarkClose = lastBenchmarkClose;
  }

  return comparison;
}

export function buildPortfolioBenchmarkTimeline({
  instruments,
  transactions,
  historicalPrices,
  benchmarkInstrumentId,
  benchmarkSymbol
}: {
  instruments: TimelineInstrument[];
  transactions: TimelineTransaction[];
  historicalPrices: TimelineHistoricalPrice[];
  benchmarkInstrumentId: number | null;
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
      portfolio: [],
      comparison: []
    };
  }

  const instrumentsById = new Map(instruments.map((instrument) => [instrument.instrumentId, instrument]));
  const validHistoricalPrices = historicalPrices.filter((row) => {
    const instrument = instrumentsById.get(row.instrumentId);

    return instrument != null && row.currency === instrument.currency && row.priceDate <= today;
  });
  const currentPositions = calculatePositions(nonFutureTransactions);
  const openPositions = Array.from(currentPositions.values()).filter((position) => position.quantity > 0);
  const openInstrumentIds = new Set(openPositions.map((position) => position.instrumentId));
  const relevantTransactions = nonFutureTransactions.filter((transaction) =>
    openInstrumentIds.has(transaction.instrumentId)
  );
  const baselineDate =
    relevantTransactions
      .map((transaction) => transaction.tradeDate)
      .sort((left, right) => left.localeCompare(right))[0] ??
    nonFutureTransactions
      .map((transaction) => transaction.tradeDate)
      .sort((left, right) => left.localeCompare(right))[0];
  const openHoldingCurrencies = Array.from(
    new Set(
      openPositions
        .map((position) => instrumentsById.get(position.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null)
    )
  );

  if (baselineDate == null || relevantTransactions.length === 0) {
    return {
      status: "missing-portfolio-history",
      baselineDate,
      portfolioCurrency: openHoldingCurrencies.length === 1 ? openHoldingCurrencies[0] : null,
      benchmarkSymbol,
      portfolio: [],
      comparison: []
    };
  }

  const portfolioCurrency =
    openHoldingCurrencies.length === 1 ? openHoldingCurrencies[0] : null;

  if (portfolioCurrency == null) {
    return {
      status: "mixed-currency",
      baselineDate,
      portfolioCurrency: null,
      benchmarkSymbol,
      portfolio: [],
      comparison: []
    };
  }

  const relevantInstrumentIds = new Set(openInstrumentIds);
  const portfolioHistoricalPrices = validHistoricalPrices.filter((row) =>
    relevantInstrumentIds.has(row.instrumentId) && row.priceDate >= baselineDate
  );
  const portfolioValuationSeries = buildPortfolioValueSeries({
    baselineDate,
    transactions: relevantTransactions,
    historicalPrices: portfolioHistoricalPrices
  });
  const portfolioSeries = portfolioValuationSeries.map(({ date, value }) => ({
    date,
    value
  }));

  if (portfolioSeries.length === 0) {
    return {
      status: "missing-portfolio-history",
      baselineDate,
      portfolioCurrency,
      benchmarkSymbol,
      portfolio: [],
      comparison: []
    };
  }

  if (benchmarkInstrumentId == null) {
    return {
      status: "missing-benchmark-history",
      baselineDate,
      portfolioCurrency,
      benchmarkSymbol,
      portfolio: portfolioSeries,
      comparison: []
    };
  }

  const benchmarkInstrument = instrumentsById.get(benchmarkInstrumentId);

  if (benchmarkInstrument?.currency !== portfolioCurrency) {
    return {
      status: "benchmark-currency-mismatch",
      baselineDate,
      portfolioCurrency,
      benchmarkSymbol,
      portfolio: portfolioSeries,
      comparison: []
    };
  }

  const benchmarkHistoricalPrices = historicalPrices
    .filter((row) => row.currency === benchmarkInstrument.currency && row.priceDate <= today)
    .filter((row) => row.instrumentId === benchmarkInstrumentId && row.priceDate >= baselineDate)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
  const comparisonSeries = buildCashFlowAdjustedComparisonSeries({
    portfolioSeries: portfolioValuationSeries,
    benchmarkRows: benchmarkHistoricalPrices
  });

  return {
    status: comparisonSeries.length > 0 ? "ready" : "missing-benchmark-history",
    baselineDate,
    portfolioCurrency,
    benchmarkSymbol,
    portfolio: portfolioSeries,
    comparison: comparisonSeries
  };
}
