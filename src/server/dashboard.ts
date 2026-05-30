import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, gte, inArray, sql } from "drizzle-orm";
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
import { reduceTimelineResolution, type ResolutionReduceOptions } from "@/lib/charts/downsample";
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

/**
 * The timeline as it is cached and streamed to the client. The raw
 * `comparison` / `moneyWeightedComparison` / `absoluteComparison` series are
 * intentionally omitted: nothing downstream reads them (the chart consumes the
 * equivalent `performanceSeries` instead), and they are the largest redundant
 * contributor to the payload. Dropping them, alongside `reduceChartsPayload`'s
 * resolution reduction, is what keeps the entry under the 2MB Data Cache limit.
 */
export type DashboardChartsTimeline = Omit<
  PortfolioBenchmarkTimeline,
  "comparison" | "moneyWeightedComparison" | "absoluteComparison"
>;

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
  timeline: DashboardChartsTimeline;
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
  timeline: DashboardChartsTimeline;
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

// Cross-request cache backstop. The version key (below) already busts the cache
// the moment any underlying row changes, so this is only a ceiling that lets
// abandoned entries (e.g. a portfolio nobody visits anymore) expire.
const DASHBOARD_CACHE_REVALIDATE_SECONDS = 120;

// The longest intraday window the refresh maintains is 1h @ 35 days, so intraday
// bars older than this are never plotted. Bounding the load avoids pulling years
// of 5m/1h bars for portfolios whose earliest trade is far in the past.
const INTRADAY_LOOKBACK_DAYS = 40;

// Display-resolution budget for the cached/streamed chart payload. The full
// timeline (all daily + intraday bars across every series and benchmark
// overlay) routinely exceeds Vercel's 2MB Data Cache limit, which silently
// disables `unstable_cache` for the charts and forces a full rebuild on every
// request. Reducing each series to what a chart can actually render keeps the
// payload O(budget) — bounded regardless of portfolio age — so the cache works
// and the client hydrates less. Short timeframes keep intraday bars at full
// resolution (only the recent window each one reads); long timeframes get the
// daily band LTTB-reduced. See `reduceTimelineResolution`.
const CHART_RESOLUTION_OPTIONS: ResolutionReduceOptions = {
  dailyBudget: 1000,
  intradayMaxAgeDays: {
    // 1D reads 5m bars (≈1 trading day); a few days covers weekends/holidays.
    "5m": 3,
    // 5D/1W/1M read 1h bars; 35 days covers the 1M window with headroom.
    "15m": 35,
    "1h": 35,
    default: 35,
  },
};

/**
 * Reduces the chart payload to display resolution and strips the redundant raw
 * comparison series before it is cached and streamed to the client. The
 * remaining series keep their shapes/types — only the number of interior points
 * drops — so the chart components are unaffected. Together with the
 * `DashboardChartsTimeline` omission, this is what keeps the cached entry under
 * the 2MB Data Cache limit; without it the charts are never cached and rebuild
 * on every request.
 */
function reduceChartsPayload(charts: {
  benchmarkWatchlist: DashboardCharts["benchmarkWatchlist"];
  timeline: PortfolioBenchmarkTimeline;
}): DashboardCharts {
  const { timeline } = charts;

  return {
    benchmarkWatchlist: {
      ...charts.benchmarkWatchlist,
      overlays: charts.benchmarkWatchlist.overlays.map((overlay) => ({
        ...overlay,
        points: reduceTimelineResolution(
          overlay.points,
          (point) => point.value,
          CHART_RESOLUTION_OPTIONS,
        ),
      })),
    },
    // Explicitly listing the kept fields (rather than spreading) means a new
    // timeline field added upstream surfaces here as a type error, forcing a
    // conscious decision about whether the client/cache needs it.
    timeline: {
      status: timeline.status,
      baselineDate: timeline.baselineDate,
      portfolioCurrency: timeline.portfolioCurrency,
      benchmarkSymbol: timeline.benchmarkSymbol,
      benchmarkCurrency: timeline.benchmarkCurrency,
      comparisonBasis: timeline.comparisonBasis,
      portfolio: reduceTimelineResolution(
        timeline.portfolio,
        (point) => point.value,
        CHART_RESOLUTION_OPTIONS,
      ),
      performanceSeries: {
        twr: reduceTimelineResolution(
          timeline.performanceSeries.twr,
          (point) => point.portfolioIndex,
          CHART_RESOLUTION_OPTIONS,
        ),
        mwr: reduceTimelineResolution(
          timeline.performanceSeries.mwr,
          (point) => point.portfolioReturnPercent,
          CHART_RESOLUTION_OPTIONS,
        ),
        absolute: reduceTimelineResolution(
          timeline.performanceSeries.absolute,
          (point) => point.portfolioReturnPercent,
          CHART_RESOLUTION_OPTIONS,
        ),
      },
    },
  };
}

function getIntradayLowerBound(earliestTradeDate: string | null): string {
  const floor = new Date();
  floor.setUTCDate(floor.getUTCDate() - INTRADAY_LOOKBACK_DAYS);
  const floorIso = floor.toISOString();

  if (earliestTradeDate == null) {
    return floorIso;
  }

  // Load from whichever is more recent: the position's first trade or the
  // retention floor — both bound the data, the later one bounds it more.
  const tradeStartIso = `${earliestTradeDate}T00:00:00.000Z`;

  return tradeStartIso > floorIso ? tradeStartIso : floorIso;
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * A cheap fingerprint of every input the dashboard build depends on. Counts
 * catch inserts/deletes, max(updatedAt)/max(asOf) catch in-place updates and
 * fresh price writes, and the local date catches the day rollover (which shifts
 * the holdings as-of cutoff). Any mutation — from any write path, with no
 * revalidate plumbing required — changes this string, which changes the cache
 * key, which forces a rebuild. Wrapped in React cache() so the overview and the
 * streamed charts share a single probe per request.
 */
const getDashboardDataVersion = cache(async (): Promise<string> => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM transactions) AS tx_count,
      (SELECT max(updated_at) FROM transactions) AS tx_updated,
      (SELECT count(*) FROM price_snapshots) AS px_count,
      (SELECT max(as_of) FROM price_snapshots) AS px_as_of,
      (SELECT max(price_date) FROM historical_prices) AS hist_date,
      (SELECT max(observed_at) FROM intraday_prices) AS intra_at,
      (SELECT max(updated_at) FROM app_settings) AS settings_updated
  `);
  // drizzle's neon-serverless driver resolves to a rows array, node-postgres to
  // a QueryResult with a `rows` field. Normalise both.
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  const row = (rows[0] ?? {}) as Record<string, unknown>;

  return [
    getCurrentLocalIsoDate(),
    row.tx_count,
    row.tx_updated,
    row.px_count,
    row.px_as_of,
    row.hist_date,
    row.intra_at,
    row.settings_updated,
  ]
    .map((value) => String(value ?? ""))
    .join("|");
});

function buildDashboardCacheTags(portfolioScopeKey: string): string[] {
  const portfolioTags = portfolioScopeKey
    .split(",")
    .filter((value) => value.length > 0)
    .map((id) => `dashboard:portfolio:${id}`);

  return ["dashboard", ...portfolioTags];
}

/**
 * The freshness fields are relative to "now" (minutes since the last price),
 * so they must never be served from cache — recompute them from the cached
 * (absolute) as-of timestamps on every read.
 */
function withFreshMarketFreshness(overview: DashboardOverview): DashboardOverview {
  return {
    ...overview,
    marketData: {
      ...overview.marketData,
      priceAgeMinutes: getPriceAgeMinutes(overview.marketData.latestMarketDataAsOf),
      isPriceDataStale: isMarketDataStale(
        overview.marketData.latestMarketDataAsOf,
        overview.marketData.marketRefreshMinutes,
      ),
    },
    holdingsSnapshot: {
      ...overview.holdingsSnapshot,
      priceAgeMinutes: getPriceAgeMinutes(overview.holdingsSnapshot.latestPriceAsOf),
      isPriceDataStale: isMarketDataStale(
        overview.holdingsSnapshot.latestPriceAsOf,
        overview.holdingsSnapshot.marketRefreshMinutes,
      ),
    },
  };
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
            and(
              inArray(intradayPrices.instrumentId, relevantInstrumentIds),
              gte(intradayPrices.observedAt, getIntradayLowerBound(earliestTradeDate)),
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

async function buildDashboardOverview(portfolioScopeKey: string): Promise<DashboardOverview> {
  const base = await loadDashboardBase(portfolioScopeKey);

  return {
    summary: buildDashboardSummary(base.holdingsSnapshot),
    holdingsSnapshot: base.holdingsSnapshot,
    marketData: base.marketData,
    performanceSummary: base.performanceSummary,
  };
}

// Cross-request cache of the above-the-fold payload, keyed by scope + data
// version. React cache() dedupes the (scopeKey, version) pair within a request
// so the unstable_cache wrapper is created and awaited once per render.
const loadCachedOverview = cache(
  (portfolioScopeKey: string, version: string): Promise<DashboardOverview> =>
    unstable_cache(
      () => buildDashboardOverview(portfolioScopeKey),
      ["dashboard-overview", portfolioScopeKey, version],
      {
        tags: buildDashboardCacheTags(portfolioScopeKey),
        revalidate: DASHBOARD_CACHE_REVALIDATE_SECONDS,
      },
    )(),
);

export async function getDashboardOverview(scope: DashboardScope): Promise<DashboardOverview> {
  const portfolioIds = parsePortfolioScope(scope);
  const version = await getDashboardDataVersion();
  const overview = await loadCachedOverview(getPortfolioScopeKey(portfolioIds), version);

  return withFreshMarketFreshness(overview);
}

async function buildDashboardCharts(portfolioScopeKey: string): Promise<DashboardCharts> {
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

  // Reduce to display resolution before caching/streaming. The watchlist build
  // above still consumes the full-resolution timeline; only the returned (and
  // cached) payload is downsampled.
  return reduceChartsPayload({ benchmarkWatchlist, timeline });
}

// Cross-request cache of the CPU-heavy timeline + watchlist build, keyed by
// scope + data version. React cache() keeps the two streamed chart slots (main
// charts + market benchmarks) sharing a single build per request.
const loadCachedCharts = cache(
  (portfolioScopeKey: string, version: string): Promise<DashboardCharts> =>
    unstable_cache(
      () => buildDashboardCharts(portfolioScopeKey),
      ["dashboard-charts", portfolioScopeKey, version],
      {
        tags: buildDashboardCacheTags(portfolioScopeKey),
        revalidate: DASHBOARD_CACHE_REVALIDATE_SECONDS,
      },
    )(),
);

export async function getDashboardCharts(scope: DashboardScope): Promise<DashboardCharts> {
  const portfolioIds = parsePortfolioScope(scope);
  const version = await getDashboardDataVersion();

  return loadCachedCharts(getPortfolioScopeKey(portfolioIds), version);
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
