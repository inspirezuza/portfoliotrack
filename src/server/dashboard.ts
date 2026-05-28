import "server-only";

import { and, gte, inArray } from "drizzle-orm";
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
import {
  buildPerformanceSummary,
  type DashboardPerformanceSummary,
} from "@/server/dashboard/performance-summary";
import {
  buildDashboardFxConvertedRows,
  getFxProviderSymbol,
} from "@/server/dashboard/fx-conversion";
import {
  buildLocalDemoMonthlyReturns,
  buildLocalDemoOverlayPoints,
  getLocalDemoQuote,
  shouldUseLocalDemoMarketData,
} from "@/server/dashboard/local-demo-market";
export type {
  DashboardPerformanceSummary,
  DashboardPerformanceSummaryStatus,
} from "@/server/dashboard/performance-summary";

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
      ? getLocalDemoQuote(benchmark.symbol)
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
  const {
    convertedInstrumentRows,
    convertedTransactionRows,
    timelineHistoricalPriceRows,
    timelineIntradayPriceRows,
  } = buildDashboardFxConvertedRows({
    benchmarkInstrumentId: benchmarkInstrument?.id ?? null,
    fxInstrumentIds,
    historicalPriceRows,
    instrumentRows,
    intradayPriceRows,
    priceSnapshotRows,
    transactionRows,
    valuationCurrency,
  });
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
