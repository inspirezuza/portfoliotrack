import { asc, eq, inArray } from "drizzle-orm";
import { OperationTimeoutError, withOperationTimeout } from "@/lib/async/timeout";
import { db } from "@/lib/db/runtime-core";
import { instruments, priceSnapshots, transactions } from "@/lib/db/schema";
import {
  DEFAULT_AUTO_REFRESH_TIMEOUT_MS,
  ensureBenchmarkWatchlistInstruments,
} from "@/lib/market/benchmark-watchlist";
import { getCurrentLocalIsoDate, isMarketDataStale } from "@/lib/market/freshness";
import {
  contextCoversRequest,
  type RefreshContext,
  type RefreshTarget,
} from "@/lib/market/refresh-context";
import { fetchMarketDataProviderPayloads } from "@/lib/market/provider-fetch";
import { persistRefreshPayloads } from "@/lib/market/refresh-persist";
import { classifyRefreshPayloads } from "@/lib/market/refresh-classification";
import {
  buildEmptyMarketDataRefreshBatchResult,
  getMarketDataRefreshBatchTargets,
} from "@/lib/market/refresh-batch";
import { getMarketSettings } from "@/lib/market/settings";
import { buildMarketRefreshTargets } from "@/lib/market/refresh-targets";
import {
  hasIncompleteHistoricalData,
  hasMissingIntradayData,
  INTRADAY_REFRESH_WINDOWS,
  withIncrementalHistoryStartDates,
} from "@/lib/market/refresh-coverage";
import type { MarketDataProvider } from "@/lib/market/types";
import { yahooProvider } from "@/lib/market/yahoo-provider-core";
import { parsePortfolioId } from "@/lib/portfolio/portfolio-id";

export {
  BENCHMARK_WATCHLIST,
  ensureBenchmarkWatchlistInstruments,
  getMissingBenchmarkWatchlistInstruments,
  insertBenchmarkWatchlistInstruments,
} from "@/lib/market/benchmark-watchlist";
export { getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/freshness";
export type { RefreshContext, RefreshTarget } from "@/lib/market/refresh-context";
export { getMarketSettings, type MarketSettings } from "@/lib/market/settings";

export type MarketRefreshIssue = {
  symbol: string;
  providerSymbol: string;
  reason:
    | "missing_quote"
    | "quote_currency_mismatch"
    | "missing_history"
    | "history_currency_mismatch"
    | "missing_intraday"
    | "intraday_currency_mismatch";
};

export type MarketDataRefreshResult = {
  refreshedAt: string;
  benchmarkSymbol: string | null;
  marketRefreshMinutes: number;
  requestedSymbols: string[];
  quoteRefreshCount: number;
  historicalBarCount: number;
  intradayBarCount: number;
  latestSuccessfulAsOf: string | null;
  issues: MarketRefreshIssue[];
};

export type MarketDataRefreshBatchResult = MarketDataRefreshResult & {
  currentSymbol: string | null;
  hasMore: boolean;
  lastProcessedInstrumentId: number | null;
  processedTargetCount: number;
  targetCount: number;
};

type InflightRefresh = {
  context: RefreshContext;
  promise: Promise<MarketDataRefreshResult>;
};

let inflightRefresh: InflightRefresh | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  return yahooProvider;
}

function compareIsoTimestampsDescending(left: string, right: string) {
  return right.localeCompare(left);
}

async function runRefreshWithDedup(context: RefreshContext) {
  while (true) {
    const currentInflightRefresh = inflightRefresh;

    if (currentInflightRefresh == null) {
      const refreshPromise = performRefreshMarketDataCache(context).finally(() => {
        if (inflightRefresh?.promise === refreshPromise) {
          inflightRefresh = null;
        }
      });

      inflightRefresh = {
        context,
        promise: refreshPromise,
      };

      return refreshPromise;
    }

    if (contextCoversRequest(currentInflightRefresh.context, context)) {
      return currentInflightRefresh.promise;
    }

    try {
      await currentInflightRefresh.promise;
    } catch {
      // A failed narrower refresh should not block the broader retry.
    }
  }
}

async function runAutoRefreshBestEffort(context: RefreshContext, timeoutMs: number | null) {
  const refreshPromise = runRefreshWithDedup(context);

  if (timeoutMs == null) {
    return refreshPromise.catch((error) => {
      console.error("Market data auto-refresh failed", error);
      return null;
    });
  }

  try {
    return await withOperationTimeout(refreshPromise, {
      label: "Market data auto-refresh",
      timeoutMs,
    });
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.warn(error.message, "Using cached market data while refresh continues.");
      return null;
    }

    console.error("Market data auto-refresh failed", error);
    return null;
  }
}

async function buildRefreshContext({
  portfolioId: portfolioIdInput,
  includeBenchmark = true,
}: {
  portfolioId: number;
  includeBenchmark?: boolean;
}): Promise<RefreshContext> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  await ensureBenchmarkWatchlistInstruments();
  const [{ baseCurrency, benchmarkSymbol, marketRefreshMinutes }, instrumentRows, transactionRows] =
    await Promise.all([
      getMarketSettings(),
      db.select().from(instruments),
      db
        .select({
          instrumentId: transactions.instrumentId,
          tradeDate: transactions.tradeDate,
        })
        .from(transactions)
        .where(eq(transactions.portfolioId, portfolioId))
        .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)),
    ]);
  const today = getCurrentLocalIsoDate();
  const refreshTargets = buildMarketRefreshTargets({
    baseCurrency,
    benchmarkSymbol,
    includeBenchmark,
    instrumentRows,
    today,
    transactionRows,
  });

  return {
    benchmarkSymbol,
    marketRefreshMinutes,
    targets: refreshTargets,
  };
}

export async function ensureFreshMarketDataCache({
  portfolioId,
  includeBenchmark = true,
  timeoutMs = DEFAULT_AUTO_REFRESH_TIMEOUT_MS,
}: {
  portfolioId: number;
  includeBenchmark?: boolean;
  timeoutMs?: number | null;
}) {
  const context = await buildRefreshContext({ portfolioId, includeBenchmark });
  const { marketRefreshMinutes, targets } = context;

  if (targets.length === 0) {
    return null;
  }

  const targetInstrumentIds = targets.map((target) => target.instrument.id);
  const snapshotRows = await db
    .select()
    .from(priceSnapshots)
    .where(inArray(priceSnapshots.instrumentId, targetInstrumentIds));
  const snapshotByInstrumentId = new Map(
    snapshotRows.map((snapshot) => [snapshot.instrumentId, snapshot] as const),
  );
  const hasMissingSnapshot = targets.some(
    (target) => !snapshotByInstrumentId.has(target.instrument.id),
  );
  const hasStaleSnapshot = targets.some((target) =>
    isMarketDataStale(
      snapshotByInstrumentId.get(target.instrument.id)?.asOf ?? null,
      marketRefreshMinutes,
    ),
  );
  const missingHistoricalData = await hasIncompleteHistoricalData({
    targets,
    snapshotByInstrumentId,
  });
  const missingIntradayData = await hasMissingIntradayData(targets);

  if (!hasMissingSnapshot && !hasStaleSnapshot && !missingHistoricalData && !missingIntradayData) {
    return null;
  }

  return runAutoRefreshBestEffort(context, timeoutMs);
}

export async function refreshMarketDataCache(
  { portfolioId }: { portfolioId: number },
  existingContext?: RefreshContext,
): Promise<MarketDataRefreshResult> {
  const context = existingContext ?? (await buildRefreshContext({ portfolioId }));

  return runRefreshWithDedup(context);
}

export async function refreshMarketDataTargets({
  targets,
}: {
  targets: RefreshTarget[];
}): Promise<MarketDataRefreshResult> {
  const { benchmarkSymbol, marketRefreshMinutes } = await getMarketSettings();

  return runRefreshWithDedup({
    benchmarkSymbol,
    marketRefreshMinutes,
    targets,
  });
}

export async function refreshMarketDataCacheBatch({
  portfolioId,
  afterInstrumentId = null,
  maxTargets,
}: {
  portfolioId: number;
  afterInstrumentId?: number | null;
  maxTargets: number;
}): Promise<MarketDataRefreshBatchResult> {
  const context = await buildRefreshContext({ portfolioId });
  const { batchTargets, hasMore, lastProcessedInstrumentId, sortedTargets } =
    getMarketDataRefreshBatchTargets(context.targets, afterInstrumentId, maxTargets);

  if (batchTargets.length === 0) {
    return buildEmptyMarketDataRefreshBatchResult({
      context,
      hasMore,
      lastProcessedInstrumentId,
      sortedTargetCount: sortedTargets.length,
    });
  }

  const result = await performRefreshMarketDataCache(
    {
      ...context,
      targets: batchTargets,
    },
    { incrementalHistorical: true },
  );

  return {
    ...result,
    currentSymbol: batchTargets[0]?.instrument.symbol ?? null,
    hasMore,
    lastProcessedInstrumentId,
    processedTargetCount: batchTargets.length,
    targetCount: sortedTargets.length,
  };
}

async function performRefreshMarketDataCache(
  context: RefreshContext,
  { incrementalHistorical = false }: { incrementalHistorical?: boolean } = {},
): Promise<MarketDataRefreshResult> {
  const { benchmarkSymbol, marketRefreshMinutes, targets } = context;
  const refreshTargets = incrementalHistorical
    ? await withIncrementalHistoryStartDates(targets)
    : targets;
  const providerSymbols = refreshTargets.map((target) => target.instrument.providerSymbol);

  if (providerSymbols.length === 0) {
    return {
      refreshedAt: new Date().toISOString(),
      benchmarkSymbol,
      marketRefreshMinutes,
      requestedSymbols: [],
      quoteRefreshCount: 0,
      historicalBarCount: 0,
      intradayBarCount: 0,
      latestSuccessfulAsOf: null,
      issues: [],
    };
  }

  const provider = getMarketDataProvider();
  const { historyByInstrumentId, intradayByInstrumentIdAndInterval, quoteByProviderSymbol } =
    await fetchMarketDataProviderPayloads({
      intradayWindows: INTRADAY_REFRESH_WINDOWS,
      provider,
      targets: refreshTargets,
    });
  const { issues, validHistories, validIntradaySeries, validQuotes } = classifyRefreshPayloads({
    historyByInstrumentId,
    intradayByInstrumentIdAndInterval,
    intradayWindows: INTRADAY_REFRESH_WINDOWS,
    quoteByProviderSymbol,
    targets: refreshTargets,
  });

  const { historicalBarCount, intradayBarCount } = await persistRefreshPayloads({
    validHistories,
    validIntradaySeries,
    validQuotes,
  });

  const latestSuccessfulAsOf =
    Array.from(validQuotes.values())
      .map((quote) => quote.asOf)
      .sort(compareIsoTimestampsDescending)[0] ?? null;

  return {
    refreshedAt: new Date().toISOString(),
    benchmarkSymbol,
    marketRefreshMinutes,
    requestedSymbols: refreshTargets
      .map((target) => target.instrument.symbol)
      .sort((left, right) => left.localeCompare(right)),
    quoteRefreshCount: validQuotes.size,
    historicalBarCount,
    intradayBarCount,
    latestSuccessfulAsOf,
    issues,
  };
}
