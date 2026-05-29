import "server-only";

import { cache } from "react";
import { and, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { historicalPrices, instruments, intradayPrices } from "@/lib/db/schema";
import {
  ensureFreshMarketDataCache,
  BENCHMARK_WATCHLIST,
  getMissingBenchmarkWatchlistInstruments,
  getPriceAgeMinutes,
  insertBenchmarkWatchlistInstruments,
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
import { parsePortfolioId } from "@/server/portfolios";
import {
  buildPerformanceSummary,
  type DashboardPerformanceSummary,
} from "@/server/dashboard/performance-summary";
import {
  buildDashboardFxConvertedRows,
  getFxProviderSymbol,
} from "@/server/dashboard/fx-conversion";
import { buildBenchmarkWatchlist } from "@/server/dashboard/benchmark-watchlist";
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

export type DashboardMarketData = DashboardSnapshot["marketData"];

/**
 * The above-the-fold dashboard data: summary metrics, holdings, market-data
 * freshness, and the performance summary. Cheap relative to the chart payload
 * and rendered synchronously so the page paints without waiting on the timeline.
 */
export type DashboardOverview = {
  summary: DashboardSummary;
  holdingsSnapshot: HoldingsSnapshot;
  marketData: DashboardMarketData;
  performanceSummary: DashboardPerformanceSummary;
};

/**
 * The chart-only payload: the portfolio/benchmark timeline and the benchmark
 * watchlist. These are the CPU-heavy builds, streamed in behind a Suspense
 * boundary after the overview has painted.
 */
export type DashboardCharts = {
  benchmarkWatchlist: DashboardSnapshot["benchmarkWatchlist"];
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

type DashboardScope = {
  portfolioId?: number;
  portfolioIds?: number[];
};

function getPortfolioScopeKey(portfolioIds: number[]) {
  return Array.from(new Set(portfolioIds))
    .sort((left, right) => left - right)
    .join(",");
}

/**
 * Loads and shapes every dashboard input that both the overview and the chart
 * payload depend on (DB reads + FX conversion + holdings + performance
 * summary). Wrapped in React cache() so a single request that renders the
 * overview and then streams the charts pays for the load + conversion once.
 */
const loadDashboardBase = cache(async (portfolioScopeKey: string) => {
  const portfolioIds = portfolioScopeKey
    .split(",")
    .filter((value) => value.length > 0)
    .map(Number);

  const holdingsSource = await loadHoldingsSnapshotSource({ portfolioIds });
  const holdingsSnapshot = buildHoldingsSnapshotFromSource(holdingsSource);
  const marketSettings = holdingsSource.marketSettings;
  // loadHoldingsSnapshotSource already fetched every instrument, so derive the
  // benchmark-watchlist seed need from that list instead of issuing a separate
  // SELECT on every load. The INSERT + reload only runs on the rare first run
  // where the watchlist instruments are not seeded yet.
  let instrumentRows = holdingsSource.instrumentRows;
  const missingBenchmarks = getMissingBenchmarkWatchlistInstruments(
    instrumentRows.map((instrument) => instrument.symbol),
  );

  if (missingBenchmarks.length > 0) {
    await insertBenchmarkWatchlistInstruments(missingBenchmarks);
    instrumentRows = await db.select().from(instruments);
  }
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
  return {
    holdingsSnapshot,
    performanceSummary,
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
    // Chart inputs retained so getDashboardCharts can build the timeline and
    // benchmark watchlist without reloading or re-converting anything.
    benchmarkSymbol: marketSettings.benchmarkSymbol,
    benchmarkInstrument,
    convertedInstrumentRows,
    convertedTransactionRows,
    timelineHistoricalPriceRows,
    timelineIntradayPriceRows,
    historicalPriceRows,
    instrumentRows,
    intradayPriceRows,
    priceSnapshotRows,
  };
});

function buildDashboardSummary(holdingsSnapshot: HoldingsSnapshot): DashboardSummary {
  return {
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
  };
}

export async function getDashboardOverview(scope: DashboardScope): Promise<DashboardOverview> {
  const portfolioIds = parsePortfolioScope(scope);
  const base = await loadDashboardBase(getPortfolioScopeKey(portfolioIds));

  return {
    summary: buildDashboardSummary(base.holdingsSnapshot),
    holdingsSnapshot: base.holdingsSnapshot,
    marketData: base.marketData,
    performanceSummary: base.performanceSummary,
  };
}

// Cached by scope so the two streamed chart slots (main charts + market
// benchmarks) share a single timeline/watchlist build per request.
const loadDashboardCharts = cache(async (portfolioScopeKey: string): Promise<DashboardCharts> => {
  const base = await loadDashboardBase(portfolioScopeKey);
  const timeline = buildPortfolioBenchmarkTimeline({
    instruments: base.convertedInstrumentRows.map((instrument) => ({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      currency: instrument.currency,
    })),
    transactions: base.convertedTransactionRows.map((row) => ({
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      side: row.side as "BUY" | "SELL",
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      createdAt: row.createdAt,
      id: row.id,
    })),
    historicalPrices: base.timelineHistoricalPriceRows.map((row) => ({
      instrumentId: row.instrumentId,
      priceDate: row.priceDate,
      close: row.close,
      currency: row.currency,
    })),
    intradayPrices: base.timelineIntradayPriceRows
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
    benchmarkInstrumentId: base.benchmarkInstrument?.id ?? null,
    benchmarkCurrency: base.benchmarkInstrument?.currency ?? null,
    benchmarkSymbol: base.benchmarkSymbol,
  });
  const benchmarkWatchlist = buildBenchmarkWatchlist({
    historicalPriceRows: base.historicalPriceRows,
    instrumentRows: base.instrumentRows,
    intradayPriceRows: base.intradayPriceRows,
    priceSnapshotRows: base.priceSnapshotRows,
    timeline,
  });

  return { benchmarkWatchlist, timeline };
});

export async function getDashboardCharts(scope: DashboardScope): Promise<DashboardCharts> {
  const portfolioIds = parsePortfolioScope(scope);
  return loadDashboardCharts(getPortfolioScopeKey(portfolioIds));
}

export async function getDashboardSnapshot({
  portfolioId,
  portfolioIds,
  ensureFresh = false,
}: DashboardScope & { ensureFresh?: boolean }): Promise<DashboardSnapshot> {
  const scopeIds = parsePortfolioScope({ portfolioId, portfolioIds });

  if (ensureFresh) {
    await Promise.all(
      scopeIds.map((scopedPortfolioId) =>
        ensureFreshMarketDataCache({ portfolioId: scopedPortfolioId, includeBenchmark: true }),
      ),
    );
  }

  const scope = { portfolioIds: scopeIds };
  const [overview, charts] = await Promise.all([
    getDashboardOverview(scope),
    getDashboardCharts(scope),
  ]);

  return {
    summary: overview.summary,
    holdingsSnapshot: overview.holdingsSnapshot,
    marketData: overview.marketData,
    benchmarkWatchlist: charts.benchmarkWatchlist,
    performanceSummary: overview.performanceSummary,
    timeline: charts.timeline,
  };
}

export async function getDashboardSummary({ portfolioId }: { portfolioId: number }) {
  const snapshot = await getDashboardSnapshot({ portfolioId });
  return snapshot.summary;
}
