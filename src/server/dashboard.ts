import "server-only";

import { and, gte, inArray } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
import { historicalPrices, instruments, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import {
  ensureBenchmarkWatchlistInstruments,
  ensureFreshMarketDataCache,
  BENCHMARK_WATCHLIST,
  getPriceAgeMinutes,
  isMarketDataStale,
} from "@/lib/market/provider";
import {
  buildPortfolioBenchmarkTimeline,
  type TimelineIntradayPrice,
  type TimelinePointInterval,
  type PortfolioBenchmarkTimeline,
} from "@/lib/portfolio/timeline";
import {
  buildHoldingsSnapshotFromSource,
  loadHoldingsSnapshotSource,
  type CurrencyBreakdown,
  type HoldingsSnapshot,
  type RealizedBreakdown,
} from "@/server/holdings";
import { buildBenchmarkComparisonPayload } from "@/server/benchmark-comparisons";
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

export type DashboardBenchmarkOverlayPoint = {
  date: string;
  value: number;
  interval: TimelinePointInterval | null;
};

export type DashboardBenchmarkOverlay = {
  symbol: string;
  displayName: string;
  providerSymbol: string;
  market: string;
  currency: string;
  points: DashboardBenchmarkOverlayPoint[];
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
    overlays: DashboardBenchmarkOverlay[];
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

function findLatestDailyFxRate(rows: Array<{ priceDate: string; close: number }>, date: string) {
  let lowerIndex = 0;
  let upperIndex = rows.length - 1;
  let close: number | null = null;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const row = rows[middleIndex];

    if (row.priceDate <= date) {
      close = row.close;
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex - 1;
    }
  }

  return close;
}

function findLatestIntradayFxRate(
  rows: Array<{ observedAt: string; close: number }>,
  observedAt: string,
) {
  let lowerIndex = 0;
  let upperIndex = rows.length - 1;
  let close: number | null = null;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const row = rows[middleIndex];

    if (row.observedAt <= observedAt) {
      close = row.close;
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex - 1;
    }
  }

  return close;
}

function buildPerformanceSummary({
  holdingsSnapshot,
  instrumentRows,
  transactionRows,
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
  const nonFutureTransactions = transactionRows.filter(
    (transaction) => transaction.tradeDate <= today,
  );

  if (nonFutureTransactions.length === 0) {
    return {
      status: "no-transactions",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null,
    };
  }

  const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const currencies = Array.from(
    new Set(
      nonFutureTransactions
        .map((transaction) => instrumentsById.get(transaction.instrumentId)?.currency ?? null)
        .filter((currency): currency is string => currency != null),
    ),
  );
  const currency = currencies.length === 1 ? currencies[0] : null;

  if (currency == null) {
    return {
      status: "mixed-currency",
      currency: null,
      totalPnl: null,
      netInvested: null,
      absoluteReturn: null,
    };
  }

  let netInvested = 0;

  for (const transaction of nonFutureTransactions) {
    const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

    netInvested = normalizeMoney(
      transaction.side === "BUY"
        ? netInvested + grossAmount + transaction.fee
        : netInvested - (grossAmount - transaction.fee),
    );
  }

  if (holdingsSnapshot.totalRealizedPnl == null || holdingsSnapshot.totalUnrealizedPnl == null) {
    return {
      status: "missing-market-value",
      currency,
      totalPnl: null,
      netInvested,
      absoluteReturn: null,
    };
  }

  const totalPnl = normalizeMoney(
    holdingsSnapshot.totalRealizedPnl + holdingsSnapshot.totalUnrealizedPnl,
  );
  const absoluteReturn = netInvested > 0 ? totalPnl / netInvested : null;

  return {
    status: absoluteReturn == null ? "no-positive-net-invested" : "ready",
    currency,
    totalPnl,
    netInvested,
    absoluteReturn,
  };
}

function parsePortfolioScope({
  portfolioId,
  portfolioIds,
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

const LOCAL_DEMO_MONTHS = [
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
] as const;

const LOCAL_DEMO_PORTFOLIO_RETURNS = [
  3.4, -2.1, 4.8, 1.6, -5.7, 2.2, -1.8, 7.9, -3.8, 6.1, 2.4, 3.7,
];

const LOCAL_DEMO_BENCHMARK_RETURNS: Record<string, number[]> = {
  SPYM: [2.6, 1.4, 3.2, -0.8, -2.0, 2.8, 1.1, 4.3, -1.2, 3.5, 1.8, 2.9],
  QQQ: [4.1, 2.8, 5.4, -1.5, -3.6, 3.9, 1.7, 6.2, -2.8, 5.9, 2.1, 4.6],
  TDEX: [1.2, -0.7, 0.9, 1.6, -1.4, 0.8, 1.9, 2.1, -0.4, 1.2, 0.7, 1.5],
  NVDA: [8.5, -4.4, 9.8, 6.0, -8.1, 7.2, 3.3, 13.8, -6.5, 11.4, 4.7, 9.1],
  GOOGL: [3.0, 1.6, 4.2, -1.1, -2.9, 3.4, 2.5, 5.6, -2.2, 4.8, 1.9, 3.5],
};

const LOCAL_DEMO_QUOTES: Record<string, { price: number; dailyChange: number; asOf: string }> = {
  SPYM: { price: 86.96, dailyChange: 0.34, asOf: "2026-05-26T20:00:00.000Z" },
  QQQ: { price: 609.11, dailyChange: 8.7, asOf: "2026-05-26T20:00:00.000Z" },
  TDEX: { price: 12.4, dailyChange: 0.08, asOf: "2026-05-26T10:00:00.000Z" },
  NVDA: { price: 214.77, dailyChange: 3.64, asOf: "2026-05-26T20:00:00.000Z" },
  GOOGL: { price: 189.43, dailyChange: 1.16, asOf: "2026-05-26T20:00:00.000Z" },
};

function shouldUseLocalDemoMarketData(monthCount: number) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK !== "false" &&
    monthCount < 3
  );
}

function buildLocalDemoOverlayPoints(symbol: string): DashboardBenchmarkOverlayPoint[] {
  const benchmarkReturns =
    LOCAL_DEMO_BENCHMARK_RETURNS[symbol] ?? LOCAL_DEMO_BENCHMARK_RETURNS.SPYM;
  let value = 100;

  return LOCAL_DEMO_MONTHS.map((month, index) => {
    value = normalizeMoney(value * (1 + (benchmarkReturns[index] ?? 0) / 100));

    return {
      date: `${month}-01`,
      interval: "1d" as const,
      value,
    };
  });
}

function buildPortfolioMonthlyReturns(timeline: PortfolioBenchmarkTimeline) {
  const series = timeline.performanceSeries.twr;
  const pointsByMonth = new Map<string, Array<{ portfolio: number }>>();

  for (const point of series) {
    const month = getMonthKey(point.date);
    const monthPoints = pointsByMonth.get(month) ?? [];
    monthPoints.push({ portfolio: point.portfolioIndex });
    pointsByMonth.set(month, monthPoints);
  }

  return new Map(
    Array.from(pointsByMonth, ([month, monthPoints]) => {
      const firstPoint = monthPoints[0] ?? null;
      const lastPoint = monthPoints[monthPoints.length - 1] ?? null;

      return [
        month,
        calculateReturnPercent(firstPoint?.portfolio ?? null, lastPoint?.portfolio ?? null),
      ] as const;
    }),
  );
}

function buildLocalDemoMonthlyReturns({
  portfolioMonthlyReturns,
  symbol,
}: {
  portfolioMonthlyReturns: Map<string, number | null>;
  symbol: string;
}): DashboardBenchmarkMonthlyReturn[] {
  const benchmarkReturns =
    LOCAL_DEMO_BENCHMARK_RETURNS[symbol] ?? LOCAL_DEMO_BENCHMARK_RETURNS.SPYM;

  return LOCAL_DEMO_MONTHS.map((month, index) => {
    const benchmarkReturn = benchmarkReturns[index] ?? null;
    const portfolioReturn =
      LOCAL_DEMO_PORTFOLIO_RETURNS[index] ?? portfolioMonthlyReturns.get(month) ?? null;

    return {
      symbol,
      month: String(month),
      returnPercent: benchmarkReturn,
      portfolioReturnPercent: portfolioReturn,
      excessReturnPercent:
        benchmarkReturn == null || portfolioReturn == null
          ? null
          : portfolioReturn - benchmarkReturn,
    };
  });
}

function buildBenchmarkWatchlist({
  historicalPriceRows,
  instrumentRows,
  intradayPriceRows,
  priceSnapshotRows,
  timeline,
}: {
  historicalPriceRows: Array<typeof historicalPrices.$inferSelect>;
  instrumentRows: Array<typeof instruments.$inferSelect>;
  intradayPriceRows: Array<typeof intradayPrices.$inferSelect>;
  priceSnapshotRows: Array<typeof priceSnapshots.$inferSelect>;
  timeline: PortfolioBenchmarkTimeline;
}) {
  const instrumentsBySymbol = new Map(
    instrumentRows.map((instrument) => [instrument.symbol, instrument]),
  );
  const comparisonPayloadByInstrumentId = new Map<
    number,
    ReturnType<typeof buildBenchmarkComparisonPayload>
  >();
  const getComparisonPayload = (instrument: typeof instruments.$inferSelect) => {
    const cachedPayload = comparisonPayloadByInstrumentId.get(instrument.id);

    if (cachedPayload != null) {
      return cachedPayload;
    }

    const payload = buildBenchmarkComparisonPayload({
      historicalPriceRows,
      instrument,
      intradayPriceRows,
      priceSnapshotRows,
    });

    comparisonPayloadByInstrumentId.set(instrument.id, payload);
    return payload;
  };
  const quotes = BENCHMARK_WATCHLIST.map((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;
    const historyRows =
      instrument == null
        ? []
        : historicalPriceRows
            .filter(
              (row) => row.instrumentId === instrument.id && row.currency === benchmark.currency,
            )
            .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
    const localDemoQuote = shouldUseLocalDemoMarketData(historyRows.length)
      ? (LOCAL_DEMO_QUOTES[benchmark.symbol] ?? null)
      : null;
    const comparisonQuote = instrument == null ? null : getComparisonPayload(instrument).quote;
    const price = comparisonQuote?.price ?? localDemoQuote?.price ?? null;
    const dailyChange =
      comparisonQuote?.dailyChange ??
      (price == null || localDemoQuote == null ? null : localDemoQuote.dailyChange);
    const previousClose = price == null || dailyChange == null ? null : price - dailyChange;

    return {
      symbol: benchmark.symbol,
      displayName: benchmark.displayName,
      providerSymbol: benchmark.providerSymbol,
      market: benchmark.market,
      currency: benchmark.currency,
      price,
      asOf: comparisonQuote?.asOf ?? localDemoQuote?.asOf ?? null,
      dailyChange: price == null || previousClose == null ? null : price - previousClose,
      dailyChangePercent: calculateReturnPercent(previousClose, price),
    };
  });
  const portfolioMonthlyReturns = buildPortfolioMonthlyReturns(timeline);
  const monthlyReturns = BENCHMARK_WATCHLIST.flatMap((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;

    if (instrument == null) {
      return shouldUseLocalDemoMarketData(0)
        ? buildLocalDemoMonthlyReturns({
            portfolioMonthlyReturns,
            symbol: benchmark.symbol,
          })
        : [];
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

    if (shouldUseLocalDemoMarketData(rowsByMonth.size)) {
      return buildLocalDemoMonthlyReturns({
        portfolioMonthlyReturns,
        symbol: benchmark.symbol,
      });
    }

    return Array.from(rowsByMonth, ([month, monthRows]) => {
      const orderedRows = monthRows.sort((left, right) =>
        left.priceDate.localeCompare(right.priceDate),
      );
      const benchmarkReturn = calculateReturnPercent(
        orderedRows[0]?.close ?? null,
        orderedRows[orderedRows.length - 1]?.close ?? null,
      );
      const portfolioReturn = portfolioMonthlyReturns.get(month) ?? null;

      return {
        symbol: benchmark.symbol,
        month,
        returnPercent: benchmarkReturn,
        portfolioReturnPercent: portfolioReturn,
        excessReturnPercent:
          benchmarkReturn == null || portfolioReturn == null
            ? null
            : portfolioReturn - benchmarkReturn,
      };
    });
  }).sort((left, right) =>
    left.month === right.month
      ? left.symbol.localeCompare(right.symbol)
      : left.month.localeCompare(right.month),
  );
  const overlays = BENCHMARK_WATCHLIST.map((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;
    const comparisonOverlay = instrument == null ? null : getComparisonPayload(instrument).overlay;
    const dailyPointCount =
      instrument == null
        ? 0
        : historicalPriceRows.filter(
            (row) => row.instrumentId === instrument.id && row.currency === benchmark.currency,
          ).length;

    return {
      symbol: benchmark.symbol,
      displayName: benchmark.displayName,
      providerSymbol: benchmark.providerSymbol,
      market: benchmark.market,
      currency: benchmark.currency,
      points: shouldUseLocalDemoMarketData(dailyPointCount)
        ? buildLocalDemoOverlayPoints(benchmark.symbol)
        : (comparisonOverlay?.points ?? []),
    };
  });

  return {
    monthlyReturns,
    overlays,
    quotes,
  };
}

export async function getDashboardSnapshot({
  portfolioId: portfolioIdInput,
  portfolioIds: portfolioIdsInput,
  ensureFresh = false,
}: {
  portfolioId?: number;
  portfolioIds?: number[];
  ensureFresh?: boolean;
}): Promise<DashboardSnapshot> {
  const portfolioIds = parsePortfolioScope({
    portfolioId: portfolioIdInput,
    portfolioIds: portfolioIdsInput,
  });

  await ensureBenchmarkWatchlistInstruments();

  if (ensureFresh) {
    await Promise.all(
      portfolioIds.map((portfolioId) =>
        ensureFreshMarketDataCache({ portfolioId, includeBenchmark: true }),
      ),
    );
  }

  const holdingsSource = await loadHoldingsSnapshotSource({ portfolioIds });
  const holdingsSnapshot = buildHoldingsSnapshotFromSource(holdingsSource);
  const marketSettings = holdingsSource.marketSettings;
  const instrumentRows = holdingsSource.instrumentRows;
  const transactionRows = holdingsSource.rows.map(({ transaction }) => ({
    instrumentId: transaction.instrumentId,
    tradeDate: transaction.tradeDate,
    side: transaction.side,
    quantity: transaction.quantity,
    price: transaction.price,
    fee: transaction.fee,
    createdAt: transaction.createdAt,
    id: transaction.id,
  }));
  const instrumentBySymbol = new Map(
    instrumentRows.map((instrument) => [instrument.symbol, instrument]),
  );
  const instrumentByProviderSymbol = new Map(
    instrumentRows.map((instrument) => [instrument.providerSymbol, instrument]),
  );
  const benchmarkInstrument =
    marketSettings.benchmarkSymbol == null
      ? null
      : (instrumentBySymbol.get(marketSettings.benchmarkSymbol) ?? null);
  const benchmarkWatchlistInstrumentIds = BENCHMARK_WATCHLIST.map(
    (benchmark) => instrumentBySymbol.get(benchmark.symbol)?.id ?? null,
  ).filter((id): id is number => id != null);
  const instrumentById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const valuationCurrency = holdingsSnapshot.valuationCurrency;
  const fxInstrumentIds = Array.from(
    new Set(
      transactionRows
        .map((transaction) => instrumentById.get(transaction.instrumentId)?.currency ?? null)
        .filter(
          (currency): currency is string => currency != null && currency !== valuationCurrency,
        )
        .map((currency) => getFxProviderSymbol(currency, valuationCurrency))
        .map((providerSymbol) => instrumentByProviderSymbol.get(providerSymbol)?.id ?? null)
        .filter((id): id is number => id != null),
    ),
  );
  const fxInstrumentIdSet = new Set(fxInstrumentIds);
  const relevantInstrumentIds = Array.from(
    new Set([
      ...transactionRows.map((transaction) => transaction.instrumentId),
      ...(benchmarkInstrument == null ? [] : [benchmarkInstrument.id]),
      ...benchmarkWatchlistInstrumentIds,
      ...fxInstrumentIds,
    ]),
  );
  const preloadedHistoricalInstrumentIds = new Set(
    holdingsSource.rows.map((row) => row.instrument.id),
  );
  const missingHistoricalInstrumentIds = relevantInstrumentIds.filter(
    (instrumentId) => !preloadedHistoricalInstrumentIds.has(instrumentId),
  );
  let earliestTradeDate: string | null = null;

  for (const transaction of transactionRows) {
    if (earliestTradeDate == null || transaction.tradeDate < earliestTradeDate) {
      earliestTradeDate = transaction.tradeDate;
    }
  }

  const [additionalHistoricalPriceRows, intradayPriceRows] = await Promise.all([
    missingHistoricalInstrumentIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(historicalPrices)
          .where(inArray(historicalPrices.instrumentId, missingHistoricalInstrumentIds)),
    relevantInstrumentIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(intradayPrices)
          .where(
            earliestTradeDate == null
              ? inArray(intradayPrices.instrumentId, relevantInstrumentIds)
              : and(
                  inArray(intradayPrices.instrumentId, relevantInstrumentIds),
                  gte(intradayPrices.observedAt, `${earliestTradeDate}T00:00:00.000Z`),
                ),
          ),
  ]);
  const historicalPriceRows = [
    ...holdingsSource.historicalPriceRows,
    ...additionalHistoricalPriceRows,
  ];
  const priceSnapshotRows = holdingsSource.snapshotRows;
  const benchmarkSnapshot =
    benchmarkInstrument == null
      ? null
      : (priceSnapshotRows.find((snapshot) => snapshot.instrumentId === benchmarkInstrument.id) ??
        null);
  const latestMarketDataAsOf =
    [holdingsSnapshot.latestPriceAsOf, benchmarkSnapshot?.asOf ?? null]
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const transactionInstrumentIds = new Set(
    transactionRows.map((transaction) => transaction.instrumentId),
  );
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
        .sort((left, right) => left.priceDate.localeCompare(right.priceDate)),
    );
    fxIntradayRowsByCurrency.set(
      sourceCurrency,
      intradayPriceRows
        .filter((row) => row.instrumentId === fxInstrumentId && row.currency === valuationCurrency)
        .map((row) => ({ observedAt: row.observedAt, close: row.close }))
        .sort((left, right) => left.observedAt.localeCompare(right.observedAt)),
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
        price: convertedPrice,
      };
    })
    .filter((row): row is (typeof transactionRows)[number] => row != null);
  const convertedHistoricalPriceRows = historicalPriceRows
    .filter(
      (row) =>
        !fxInstrumentIdSet.has(row.instrumentId) &&
        (row.instrumentId !== benchmarkInstrument?.id ||
          transactionInstrumentIds.has(row.instrumentId)),
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
            currency: valuationCurrency,
          };
    })
    .filter((row): row is (typeof historicalPriceRows)[number] => row != null);
  const convertedIntradayPriceRows = intradayPriceRows
    .filter(
      (row) =>
        !fxInstrumentIdSet.has(row.instrumentId) &&
        (row.instrumentId !== benchmarkInstrument?.id ||
          transactionInstrumentIds.has(row.instrumentId)),
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
            currency: valuationCurrency,
          };
    })
    .filter((row): row is (typeof intradayPriceRows)[number] => row != null);
  const convertedSnapshotPriceRows: TimelineIntradayPrice[] = priceSnapshotRows
    .filter(
      (row) =>
        !fxInstrumentIdSet.has(row.instrumentId) &&
        (row.instrumentId !== benchmarkInstrument?.id ||
          transactionInstrumentIds.has(row.instrumentId)),
    )
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertIntradayValue(instrument.currency, row.asOf, row.price);

      return convertedClose == null
        ? null
        : {
            instrumentId: row.instrumentId,
            observedAt: row.asOf,
            close: convertedClose,
            currency: valuationCurrency,
            interval: "1h" as const,
          };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const convertedInstrumentRows = instrumentRows.map((instrument) => ({
    ...instrument,
    currency: fxInstrumentIdSet.has(instrument.id) ? instrument.currency : valuationCurrency,
  }));
  const benchmarkHistoricalPriceRows =
    benchmarkInstrument == null
      ? []
      : historicalPriceRows.filter(
          (row) =>
            row.instrumentId === benchmarkInstrument.id &&
            row.currency === benchmarkInstrument.currency,
        );
  const convertedHistoricalPriceKeys = new Set(
    convertedHistoricalPriceRows.map(
      (row) => `${row.instrumentId}:${row.priceDate}:${row.currency}`,
    ),
  );
  const timelineHistoricalPriceRows = [
    ...convertedHistoricalPriceRows,
    ...benchmarkHistoricalPriceRows.filter(
      (row) =>
        !convertedHistoricalPriceKeys.has(`${row.instrumentId}:${row.priceDate}:${row.currency}`),
    ),
  ];
  const benchmarkIntradayPriceRows =
    benchmarkInstrument == null
      ? []
      : intradayPriceRows.filter(
          (row) =>
            row.instrumentId === benchmarkInstrument.id &&
            row.currency === benchmarkInstrument.currency,
        );
  const convertedIntradayPriceKeys = new Set(
    convertedIntradayPriceRows.map(
      (row) => `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
    ),
  );
  const convertedSnapshotPriceKeys = new Set(
    convertedSnapshotPriceRows.map(
      (row) => `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
    ),
  );
  const benchmarkSnapshotPriceRows: TimelineIntradayPrice[] =
    benchmarkInstrument == null
      ? []
      : priceSnapshotRows
          .filter(
            (row) =>
              row.instrumentId === benchmarkInstrument.id &&
              row.currency === benchmarkInstrument.currency,
          )
          .map((row) => ({
            instrumentId: row.instrumentId,
            observedAt: row.asOf,
            close: row.price,
            currency: row.currency,
            interval: "1h" as const,
          }));
  const timelineIntradayPriceRows = [
    ...convertedIntradayPriceRows,
    ...convertedSnapshotPriceRows,
    ...benchmarkIntradayPriceRows.filter(
      (row) =>
        !convertedIntradayPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ) &&
        !convertedSnapshotPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ),
    ),
    ...benchmarkSnapshotPriceRows.filter(
      (row) =>
        !convertedIntradayPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ) &&
        !convertedSnapshotPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ),
    ),
  ];
  const performanceSummary = buildPerformanceSummary({
    holdingsSnapshot,
    instrumentRows: convertedInstrumentRows,
    transactionRows: convertedTransactionRows,
  });
  const timeline = buildPortfolioBenchmarkTimeline({
    instruments: convertedInstrumentRows.map((instrument) => ({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      currency: instrument.currency,
    })),
    transactions: convertedTransactionRows.map((row) => ({
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      side: row.side as "BUY" | "SELL",
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      createdAt: row.createdAt,
      id: row.id,
    })),
    historicalPrices: timelineHistoricalPriceRows.map((row) => ({
      instrumentId: row.instrumentId,
      priceDate: row.priceDate,
      close: row.close,
      currency: row.currency,
    })),
    intradayPrices: timelineIntradayPriceRows
      .filter((row): row is typeof row & { interval: TimelineIntradayPrice["interval"] } =>
        isTimelineIntradayInterval(row.interval),
      )
      .map((row) => ({
        instrumentId: row.instrumentId,
        observedAt: row.observedAt,
        close: row.close,
        currency: row.currency,
        interval: row.interval,
      })),
    benchmarkInstrumentId: benchmarkInstrument?.id ?? null,
    benchmarkCurrency: benchmarkInstrument?.currency ?? null,
    benchmarkSymbol: marketSettings.benchmarkSymbol,
  });
  const benchmarkWatchlist = buildBenchmarkWatchlist({
    historicalPriceRows,
    instrumentRows,
    intradayPriceRows,
    priceSnapshotRows,
    timeline,
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
      realizedBreakdown: holdingsSnapshot.realizedBreakdown,
    },
    holdingsSnapshot,
    marketData: {
      benchmarkSymbol: marketSettings.benchmarkSymbol,
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      latestMarketDataAsOf,
      priceAgeMinutes: getPriceAgeMinutes(latestMarketDataAsOf),
      isPriceDataStale: isMarketDataStale(
        latestMarketDataAsOf,
        marketSettings.marketRefreshMinutes,
      ),
    },
    benchmarkWatchlist,
    performanceSummary,
    timeline,
  };
}

export async function getDashboardSummary({ portfolioId }: { portfolioId: number }) {
  const snapshot = await getDashboardSnapshot({ portfolioId });
  return snapshot.summary;
}
