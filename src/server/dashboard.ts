import "server-only";

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
import { historicalPrices, instruments, intradayPrices, priceSnapshots, transactions } from "@/lib/db/schema";
import {
  ensureFreshMarketDataCache,
  BENCHMARK_WATCHLIST,
  getMarketSettings,
  getPriceAgeMinutes,
  isMarketDataStale
} from "@/lib/market/provider";
import {
  buildPortfolioBenchmarkTimeline,
  type TimelineIntradayPrice,
  type PortfolioBenchmarkTimeline
} from "@/lib/portfolio/timeline";
import {
  getHoldingsSnapshot,
  type CurrencyBreakdown,
  type HoldingsSnapshot,
  type RealizedBreakdown
} from "@/server/holdings";
import { parsePortfolioId } from "@/server/portfolios";

export type DashboardSummary = {
  openPositionCount: number;
  openPositionCurrency: string | null;
  totalCostBasis: number | null;
  totalMarketValue: number | null;
  totalUnrealizedPnl: number | null;
  totalRealizedPnl: number | null;
  pricedPositionCount: number;
  missingPricePositionCount: number;
  latestPriceAsOf: string | null;
  awaitingPriceSymbols: string[];
  currencyBreakdown: CurrencyBreakdown[];
  realizedBreakdown: RealizedBreakdown[];
};

export type DashboardPerformanceSummaryStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "missing-market-value"
  | "no-positive-net-invested";

export type DashboardPerformanceSummary = {
  status: DashboardPerformanceSummaryStatus;
  currency: string | null;
  totalPnl: number | null;
  netInvested: number | null;
  absoluteReturn: number | null;
};

export type DashboardBenchmarkQuote = {
  symbol: string;
  displayName: string;
  providerSymbol: string;
  market: string;
  currency: string;
  price: number | null;
  asOf: string | null;
  dailyChange: number | null;
  dailyChangePercent: number | null;
};

export type DashboardBenchmarkMonthlyReturn = {
  symbol: string;
  month: string;
  returnPercent: number | null;
  portfolioReturnPercent: number | null;
  excessReturnPercent: number | null;
};

export type DashboardSnapshot = {
  summary: DashboardSummary;
  holdingsSnapshot: HoldingsSnapshot;
  marketData: {
    benchmarkSymbol: string | null;
    marketRefreshMinutes: number;
    latestMarketDataAsOf: string | null;
    priceAgeMinutes: number | null;
    isPriceDataStale: boolean;
  };
  benchmarkWatchlist: {
    quotes: DashboardBenchmarkQuote[];
    monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  };
  performanceSummary: DashboardPerformanceSummary;
  timeline: PortfolioBenchmarkTimeline;
};

function isTimelineIntradayInterval(value: string): value is TimelineIntradayPrice["interval"] {
  return value === "5m" || value === "15m" || value === "1h";
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getFxProviderSymbol(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}${toCurrency}=X`;
}

function findLatestDailyFxRate(
  rows: Array<{ priceDate: string; close: number }>,
  date: string
) {
  return [...rows]
    .filter((row) => row.priceDate <= date)
    .sort((left, right) => right.priceDate.localeCompare(left.priceDate))[0]?.close ?? null;
}

function findLatestIntradayFxRate(
  rows: Array<{ observedAt: string; close: number }>,
  observedAt: string
) {
  return [...rows]
    .filter((row) => row.observedAt <= observedAt)
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]?.close ?? null;
}

function buildPerformanceSummary({
  holdingsSnapshot,
  instrumentRows,
  transactionRows
}: {
  holdingsSnapshot: HoldingsSnapshot;
  instrumentRows: Array<{ id: number; currency: string }>;
  transactionRows: Array<{
    instrumentId: number;
    tradeDate: string;
    side: string;
    quantity: number;
    price: number;
    fee: number;
  }>;
}): DashboardPerformanceSummary {
  const today = getCurrentLocalIsoDate();
  const nonFutureTransactions = transactionRows.filter((transaction) => transaction.tradeDate <= today);

  if (nonFutureTransactions.length === 0) {
    return {
      status: "no-transactions",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null
    };
  }

  const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const currencies = Array.from(
    new Set(
      nonFutureTransactions
        .map((transaction) => instrumentsById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null)
    )
  );
  const currency = currencies.length === 1 ? currencies[0] : null;

  if (currency == null) {
    return {
      status: "mixed-currency",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null
    };
  }

  let netInvested = 0;

  for (const transaction of nonFutureTransactions) {
    const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

    netInvested = normalizeMoney(
      transaction.side === "BUY"
        ? netInvested + grossAmount + transaction.fee
        : netInvested - (grossAmount - transaction.fee)
    );
  }

  if (holdingsSnapshot.totalRealizedPnl == null || holdingsSnapshot.totalUnrealizedPnl == null) {
    return {
      status: "missing-market-value",
      currency,
      totalPnl: null,
      netInvested,
      absoluteReturn: null
    };
  }

  const totalPnl = normalizeMoney(
    holdingsSnapshot.totalRealizedPnl + holdingsSnapshot.totalUnrealizedPnl
  );
  const absoluteReturn = netInvested > 0 ? totalPnl / netInvested : null;

  return {
    status: absoluteReturn == null ? "no-positive-net-invested" : "ready",
    currency,
    totalPnl,
    netInvested,
    absoluteReturn
  };
}

function parsePortfolioScope({
  portfolioId,
  portfolioIds
}: {
  portfolioId?: number;
  portfolioIds?: number[];
}) {
  if (portfolioIds != null) {
    return portfolioIds.map(parsePortfolioId);
  }

  return [parsePortfolioId(portfolioId)];
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

function calculateReturnPercent(startValue: number | null, endValue: number | null) {
  if (startValue == null || endValue == null || startValue <= 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

function buildPortfolioMonthlyReturns(timeline: PortfolioBenchmarkTimeline) {
  const series = timeline.moneyWeightedComparison.length > 0
    ? timeline.moneyWeightedComparison
    : timeline.comparison;
  const pointsByMonth = new Map<string, Array<{ portfolio: number }>>();

  for (const point of series) {
    const month = getMonthKey(point.date);
    const monthPoints = pointsByMonth.get(month) ?? [];
    monthPoints.push({ portfolio: point.portfolio });
    pointsByMonth.set(month, monthPoints);
  }

  return new Map(
    Array.from(pointsByMonth, ([month, monthPoints]) => {
      const firstPoint = monthPoints[0] ?? null;
      const lastPoint = monthPoints[monthPoints.length - 1] ?? null;

      return [
        month,
        calculateReturnPercent(firstPoint?.portfolio ?? null, lastPoint?.portfolio ?? null)
      ] as const;
    })
  );
}

function buildBenchmarkWatchlist({
  historicalPriceRows,
  instrumentRows,
  priceSnapshotRows,
  timeline
}: {
  historicalPriceRows: Array<typeof historicalPrices.$inferSelect>;
  instrumentRows: Array<typeof instruments.$inferSelect>;
  priceSnapshotRows: Array<typeof priceSnapshots.$inferSelect>;
  timeline: PortfolioBenchmarkTimeline;
}) {
  const instrumentsBySymbol = new Map(instrumentRows.map((instrument) => [instrument.symbol, instrument]));
  const snapshotsByInstrumentId = new Map(
    priceSnapshotRows.map((snapshot) => [snapshot.instrumentId, snapshot] as const)
  );
  const quotes = BENCHMARK_WATCHLIST.map((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;
    const snapshot = instrument == null ? null : snapshotsByInstrumentId.get(instrument.id) ?? null;
    const historyRows = instrument == null
      ? []
      : historicalPriceRows
          .filter((row) => row.instrumentId === instrument.id && row.currency === benchmark.currency)
          .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
    const latestHistory = historyRows[historyRows.length - 1] ?? null;
    const previousHistory = historyRows[historyRows.length - 2] ?? null;
    const price = snapshot?.price ?? latestHistory?.close ?? null;
    const previousClose = previousHistory?.close ?? null;
    const dailyChange = price == null || previousClose == null ? null : price - previousClose;

    return {
      symbol: benchmark.symbol,
      displayName: benchmark.displayName,
      providerSymbol: benchmark.providerSymbol,
      market: benchmark.market,
      currency: benchmark.currency,
      price,
      asOf: snapshot?.asOf ?? latestHistory?.priceDate ?? null,
      dailyChange,
      dailyChangePercent: calculateReturnPercent(previousClose, price)
    };
  });
  const portfolioMonthlyReturns = buildPortfolioMonthlyReturns(timeline);
  const monthlyReturns = BENCHMARK_WATCHLIST.flatMap((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;

    if (instrument == null) {
      return [];
    }

    const rowsByMonth = new Map<string, Array<typeof historicalPrices.$inferSelect>>();

    for (const row of historicalPriceRows) {
      if (row.instrumentId !== instrument.id || row.currency !== benchmark.currency) {
        continue;
      }

      const month = getMonthKey(row.priceDate);
      const monthRows = rowsByMonth.get(month) ?? [];
      monthRows.push(row);
      rowsByMonth.set(month, monthRows);
    }

    return Array.from(rowsByMonth, ([month, monthRows]) => {
      const orderedRows = monthRows.sort((left, right) => left.priceDate.localeCompare(right.priceDate));
      const benchmarkReturn = calculateReturnPercent(
        orderedRows[0]?.close ?? null,
        orderedRows[orderedRows.length - 1]?.close ?? null
      );
      const portfolioReturn = portfolioMonthlyReturns.get(month) ?? null;

      return {
        symbol: benchmark.symbol,
        month,
        returnPercent: benchmarkReturn,
        portfolioReturnPercent: portfolioReturn,
        excessReturnPercent:
          benchmarkReturn == null || portfolioReturn == null ? null : benchmarkReturn - portfolioReturn
      };
    });
  }).sort((left, right) =>
    left.month === right.month ? left.symbol.localeCompare(right.symbol) : left.month.localeCompare(right.month)
  );

  return {
    monthlyReturns,
    quotes
  };
}

export async function getDashboardSnapshot({
  portfolioId: portfolioIdInput,
  portfolioIds: portfolioIdsInput,
  ensureFresh = false
}: {
  portfolioId?: number;
  portfolioIds?: number[];
  ensureFresh?: boolean;
}): Promise<DashboardSnapshot> {
  const portfolioIds = parsePortfolioScope({
    portfolioId: portfolioIdInput,
    portfolioIds: portfolioIdsInput
  });

  if (ensureFresh) {
    await Promise.all(
      portfolioIds.map((portfolioId) => ensureFreshMarketDataCache({ portfolioId, includeBenchmark: true }))
    );
  }

  const portfolioFilter =
    portfolioIds.length === 1
      ? eq(transactions.portfolioId, portfolioIds[0])
      : inArray(transactions.portfolioId, portfolioIds);

  const [holdingsSnapshot, marketSettings, transactionRows, instrumentRows] =
    await Promise.all([
      getHoldingsSnapshot({ portfolioIds, ensureFresh: false }),
      getMarketSettings(),
      db
        .select({
          instrumentId: transactions.instrumentId,
          tradeDate: transactions.tradeDate,
          side: transactions.side,
          quantity: transactions.quantity,
          price: transactions.price,
          fee: transactions.fee,
          createdAt: transactions.createdAt,
          id: transactions.id
        })
        .from(transactions)
        .where(portfolioFilter)
        .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)),
      db.select().from(instruments)
    ]);
  const benchmarkInstrument =
    marketSettings.benchmarkSymbol == null
      ? null
      : instrumentRows.find((instrument) => instrument.symbol === marketSettings.benchmarkSymbol) ?? null;
  const benchmarkWatchlistInstrumentIds = BENCHMARK_WATCHLIST.map((benchmark) =>
    instrumentRows.find((instrument) => instrument.symbol === benchmark.symbol)?.id ?? null
  ).filter((id): id is number => id != null);
  const instrumentById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const valuationCurrency = holdingsSnapshot.valuationCurrency;
  const fxInstrumentIds = Array.from(
    new Set(
      transactionRows
        .map((transaction) => instrumentById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null && currency !== valuationCurrency)
        .map((currency) => getFxProviderSymbol(currency, valuationCurrency))
        .map((providerSymbol) =>
          instrumentRows.find((instrument) => instrument.providerSymbol === providerSymbol)?.id ?? null
        )
        .filter((id): id is number => id != null)
    )
  );
  const relevantInstrumentIds = Array.from(
    new Set([
      ...transactionRows.map((transaction) => transaction.instrumentId),
      ...(benchmarkInstrument == null ? [] : [benchmarkInstrument.id]),
      ...benchmarkWatchlistInstrumentIds,
      ...fxInstrumentIds
    ])
  );
  const earliestTradeDate =
    transactionRows
      .map((transaction) => transaction.tradeDate)
      .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const [historicalPriceRows, intradayPriceRows, priceSnapshotRows] =
    relevantInstrumentIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select()
            .from(historicalPrices)
            .where(inArray(historicalPrices.instrumentId, relevantInstrumentIds)),
          db
            .select()
            .from(intradayPrices)
            .where(
              earliestTradeDate == null
                ? inArray(intradayPrices.instrumentId, relevantInstrumentIds)
                : and(
                    inArray(intradayPrices.instrumentId, relevantInstrumentIds),
                    gte(intradayPrices.observedAt, `${earliestTradeDate}T00:00:00.000Z`)
                  )
            ),
          db
            .select()
            .from(priceSnapshots)
            .where(inArray(priceSnapshots.instrumentId, relevantInstrumentIds))
        ]);
  const benchmarkSnapshot = benchmarkInstrument == null
    ? null
    : priceSnapshotRows.find((snapshot) => snapshot.instrumentId === benchmarkInstrument.id) ?? null;
  const latestMarketDataAsOf =
    [holdingsSnapshot.latestPriceAsOf, benchmarkSnapshot?.asOf ?? null]
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const transactionInstrumentIds = new Set(transactionRows.map((transaction) => transaction.instrumentId));
  const fxHistoricalRowsByCurrency = new Map<string, Array<{ priceDate: string; close: number }>>();
  const fxIntradayRowsByCurrency = new Map<string, Array<{ observedAt: string; close: number }>>();

  for (const fxInstrumentId of fxInstrumentIds) {
    const fxInstrument = instrumentById.get(fxInstrumentId);

    if (fxInstrument == null) {
      continue;
    }

    const sourceCurrency = fxInstrument.providerSymbol.slice(0, 3);

    fxHistoricalRowsByCurrency.set(
      sourceCurrency,
      historicalPriceRows
        .filter((row) => row.instrumentId === fxInstrumentId && row.currency === valuationCurrency)
        .map((row) => ({ priceDate: row.priceDate, close: row.close }))
    );
    fxIntradayRowsByCurrency.set(
      sourceCurrency,
      intradayPriceRows
        .filter((row) => row.instrumentId === fxInstrumentId && row.currency === valuationCurrency)
        .map((row) => ({ observedAt: row.observedAt, close: row.close }))
    );
  }

  const convertDailyValue = (currency: string, date: string, value: number) => {
    if (currency === valuationCurrency) {
      return value;
    }

    const rate = findLatestDailyFxRate(fxHistoricalRowsByCurrency.get(currency) ?? [], date);

    return rate == null ? null : normalizeMoney(value * rate);
  };
  const convertIntradayValue = (currency: string, observedAt: string, value: number) => {
    if (currency === valuationCurrency) {
      return value;
    }

    const rate = findLatestIntradayFxRate(fxIntradayRowsByCurrency.get(currency) ?? [], observedAt);

    return rate == null ? null : normalizeMoney(value * rate);
  };
  const convertedTransactionRows = transactionRows
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedPrice = convertDailyValue(instrument.currency, row.tradeDate, row.price);
      const convertedFee = convertDailyValue(instrument.currency, row.tradeDate, row.fee);

      if (convertedPrice == null || convertedFee == null) {
        return null;
      }

      return {
        ...row,
        fee: convertedFee,
        price: convertedPrice
      };
    })
    .filter((row): row is typeof transactionRows[number] => row != null);
  const convertedHistoricalPriceRows = historicalPriceRows
    .filter((row) =>
      !fxInstrumentIds.includes(row.instrumentId) &&
      (row.instrumentId !== benchmarkInstrument?.id || transactionInstrumentIds.has(row.instrumentId))
    )
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertDailyValue(instrument.currency, row.priceDate, row.close);

      return convertedClose == null
        ? null
        : {
            ...row,
            close: convertedClose,
            currency: valuationCurrency
          };
    })
    .filter((row): row is typeof historicalPriceRows[number] => row != null);
  const convertedIntradayPriceRows = intradayPriceRows
    .filter((row) =>
      !fxInstrumentIds.includes(row.instrumentId) &&
      (row.instrumentId !== benchmarkInstrument?.id || transactionInstrumentIds.has(row.instrumentId))
    )
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertIntradayValue(instrument.currency, row.observedAt, row.close);

      return convertedClose == null
        ? null
        : {
            ...row,
            close: convertedClose,
            currency: valuationCurrency
          };
    })
    .filter((row): row is typeof intradayPriceRows[number] => row != null);
  const convertedInstrumentRows = instrumentRows.map((instrument) => ({
    ...instrument,
    currency: fxInstrumentIds.includes(instrument.id) ? instrument.currency : valuationCurrency
  }));
  const benchmarkHistoricalPriceRows = benchmarkInstrument == null
    ? []
    : historicalPriceRows.filter((row) =>
        row.instrumentId === benchmarkInstrument.id && row.currency === benchmarkInstrument.currency
      );
  const convertedHistoricalPriceKeys = new Set(
    convertedHistoricalPriceRows.map((row) => `${row.instrumentId}:${row.priceDate}:${row.currency}`)
  );
  const timelineHistoricalPriceRows = [
    ...convertedHistoricalPriceRows,
    ...benchmarkHistoricalPriceRows.filter(
      (row) => !convertedHistoricalPriceKeys.has(`${row.instrumentId}:${row.priceDate}:${row.currency}`)
    )
  ];
  const benchmarkIntradayPriceRows = benchmarkInstrument == null
    ? []
    : intradayPriceRows.filter((row) =>
        row.instrumentId === benchmarkInstrument.id && row.currency === benchmarkInstrument.currency
      );
  const convertedIntradayPriceKeys = new Set(
    convertedIntradayPriceRows.map((row) => `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`)
  );
  const timelineIntradayPriceRows = [
    ...convertedIntradayPriceRows,
    ...benchmarkIntradayPriceRows.filter(
      (row) => !convertedIntradayPriceKeys.has(`${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`)
    )
  ];
  const performanceSummary = buildPerformanceSummary({
    holdingsSnapshot,
    instrumentRows: convertedInstrumentRows,
    transactionRows: convertedTransactionRows
  });
  const timeline = buildPortfolioBenchmarkTimeline({
    instruments: convertedInstrumentRows.map((instrument) => ({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      currency: instrument.currency
    })),
    transactions: convertedTransactionRows.map((row) => ({
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      side: row.side as "BUY" | "SELL",
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      createdAt: row.createdAt,
      id: row.id
    })),
    historicalPrices: timelineHistoricalPriceRows.map((row) => ({
      instrumentId: row.instrumentId,
      priceDate: row.priceDate,
      close: row.close,
      currency: row.currency
    })),
    intradayPrices: timelineIntradayPriceRows
      .filter((row): row is typeof row & { interval: TimelineIntradayPrice["interval"] } =>
        isTimelineIntradayInterval(row.interval)
      )
      .map((row) => ({
        instrumentId: row.instrumentId,
        observedAt: row.observedAt,
        close: row.close,
        currency: row.currency,
        interval: row.interval
      })),
    benchmarkInstrumentId: benchmarkInstrument?.id ?? null,
    benchmarkCurrency: benchmarkInstrument?.currency ?? null,
    benchmarkSymbol: marketSettings.benchmarkSymbol
  });
  const benchmarkWatchlist = buildBenchmarkWatchlist({
    historicalPriceRows,
    instrumentRows,
    priceSnapshotRows,
    timeline
  });

  return {
    summary: {
      openPositionCount: holdingsSnapshot.openPositionCount,
      openPositionCurrency: holdingsSnapshot.openPositionCurrency,
      totalCostBasis: holdingsSnapshot.totalCostBasis,
      totalMarketValue: holdingsSnapshot.totalMarketValue,
      totalUnrealizedPnl: holdingsSnapshot.totalUnrealizedPnl,
      totalRealizedPnl: holdingsSnapshot.totalRealizedPnl,
      pricedPositionCount: holdingsSnapshot.pricedPositionCount,
      missingPricePositionCount: holdingsSnapshot.missingPricePositionCount,
      latestPriceAsOf: holdingsSnapshot.latestPriceAsOf,
      awaitingPriceSymbols: holdingsSnapshot.awaitingPriceSymbols,
      currencyBreakdown: holdingsSnapshot.currencyBreakdown,
      realizedBreakdown: holdingsSnapshot.realizedBreakdown
    },
    holdingsSnapshot,
    marketData: {
      benchmarkSymbol: marketSettings.benchmarkSymbol,
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      latestMarketDataAsOf,
      priceAgeMinutes: getPriceAgeMinutes(latestMarketDataAsOf),
      isPriceDataStale: isMarketDataStale(
        latestMarketDataAsOf,
        marketSettings.marketRefreshMinutes
      )
    },
    benchmarkWatchlist,
    performanceSummary,
    timeline
  };
}

export async function getDashboardSummary({ portfolioId }: { portfolioId: number }) {
  const snapshot = await getDashboardSnapshot({ portfolioId });
  return snapshot.summary;
}
