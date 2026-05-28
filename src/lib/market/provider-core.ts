import { asc, eq, inArray } from "drizzle-orm";
import { OperationTimeoutError, withOperationTimeout } from "@/lib/async/timeout";
import { db } from "@/lib/db/runtime-core";
import {
  historicalPrices,
  instruments,
  intradayPrices,
  priceSnapshots,
  transactions,
} from "@/lib/db/schema";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  BENCHMARK_HISTORY_START_DATE,
  BENCHMARK_WATCHLIST,
  DEFAULT_AUTO_REFRESH_TIMEOUT_MS,
  ensureBenchmarkWatchlistInstruments,
} from "@/lib/market/benchmark-watchlist";
import {
  getCurrentLocalIsoDate,
  getExpectedHistoryTailDate,
  isMarketDataStale,
} from "@/lib/market/freshness";
import {
  contextCoversRequest,
  type RefreshContext,
  type RefreshTarget,
} from "@/lib/market/refresh-context";
import { classifyRefreshPayloads } from "@/lib/market/refresh-classification";
import {
  buildEmptyMarketDataRefreshBatchResult,
  getMarketDataRefreshBatchTargets,
} from "@/lib/market/refresh-batch";
import { getMarketSettings } from "@/lib/market/settings";
import type {
  MarketDataProvider,
  MarketHistoricalSeries,
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";
import { yahooProvider } from "@/lib/market/yahoo-provider-core";
import { parsePortfolioId } from "@/lib/portfolio/portfolio-id";

export {
  BENCHMARK_WATCHLIST,
  ensureBenchmarkWatchlistInstruments,
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

const INTRADAY_REFRESH_WINDOWS: Array<{
  interval: MarketIntradayInterval;
  lookbackDays: number;
}> = [
  { interval: "5m", lookbackDays: 2 },
  { interval: "1h", lookbackDays: 35 },
];

export function getMarketDataProvider(): MarketDataProvider {
  return yahooProvider;
}

function compareIsoTimestampsDescending(left: string, right: string) {
  return right.localeCompare(left);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

async function getHistoryCoverageByInstrument(targets: RefreshTarget[]) {
  const historyTargets = targets.filter((target) => target.historyStartDate != null);

  if (historyTargets.length === 0) {
    return new Map<number, { earliestPriceDate: string | null; latestPriceDate: string | null }>();
  }

  const historicalRows = await db
    .select()
    .from(historicalPrices)
    .where(
      inArray(
        historicalPrices.instrumentId,
        historyTargets.map((target) => target.instrument.id),
      ),
    );
  const coverageByInstrument = new Map<
    number,
    { earliestPriceDate: string | null; latestPriceDate: string | null }
  >();
  const targetByInstrumentId = new Map(
    historyTargets.map((target) => [target.instrument.id, target] as const),
  );

  for (const row of historicalRows) {
    const target = targetByInstrumentId.get(row.instrumentId);

    if (target == null || row.currency !== target.instrument.currency) {
      continue;
    }

    const existingCoverage = coverageByInstrument.get(row.instrumentId) ?? {
      earliestPriceDate: null,
      latestPriceDate: null,
    };

    coverageByInstrument.set(row.instrumentId, {
      earliestPriceDate:
        existingCoverage.earliestPriceDate == null ||
        row.priceDate < existingCoverage.earliestPriceDate
          ? row.priceDate
          : existingCoverage.earliestPriceDate,
      latestPriceDate:
        existingCoverage.latestPriceDate == null || row.priceDate > existingCoverage.latestPriceDate
          ? row.priceDate
          : existingCoverage.latestPriceDate,
    });
  }

  return coverageByInstrument;
}

async function hasMissingIntradayData(targets: RefreshTarget[]) {
  if (targets.length === 0) {
    return false;
  }

  const rows = await db
    .select()
    .from(intradayPrices)
    .where(
      inArray(
        intradayPrices.instrumentId,
        targets.map((target) => target.instrument.id),
      ),
    );
  const intervalsByInstrumentId = new Map<number, Set<string>>();

  for (const row of rows) {
    const intervals = intervalsByInstrumentId.get(row.instrumentId) ?? new Set<string>();
    intervals.add(row.interval);
    intervalsByInstrumentId.set(row.instrumentId, intervals);
  }

  return targets.some((target) => {
    const intervals = intervalsByInstrumentId.get(target.instrument.id);

    return (
      intervals == null ||
      INTRADAY_REFRESH_WINDOWS.some((window) => !intervals.has(window.interval))
    );
  });
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
  const currentTransactionRows = transactionRows.filter((row) => row.tradeDate <= today);

  const earliestTradeDateByInstrument = new Map<number, string>();
  let earliestPortfolioTradeDate: string | null = null;

  for (const row of currentTransactionRows) {
    if (earliestPortfolioTradeDate == null || row.tradeDate < earliestPortfolioTradeDate) {
      earliestPortfolioTradeDate = row.tradeDate;
    }

    const existingTradeDate = earliestTradeDateByInstrument.get(row.instrumentId);

    if (existingTradeDate == null || row.tradeDate < existingTradeDate) {
      earliestTradeDateByInstrument.set(row.instrumentId, row.tradeDate);
    }
  }

  const benchmarkInstrument =
    benchmarkSymbol == null
      ? null
      : (instrumentRows.find((instrument) => instrument.symbol === benchmarkSymbol) ?? null);
  const refreshTargets = new Map<number, RefreshTarget>();
  const instrumentRowsByProviderSymbol = new Map(
    instrumentRows.map(
      (instrument) => [instrument.providerSymbol, applyKnownDrMetadata(instrument)] as const,
    ),
  );

  function addRefreshTargetByProviderSymbol(
    providerSymbol: string | null,
    historyStartDate: string,
  ) {
    if (providerSymbol == null) {
      return;
    }

    const instrument = instrumentRowsByProviderSymbol.get(providerSymbol);

    if (instrument == null) {
      return;
    }

    refreshTargets.set(instrument.id, {
      instrument,
      historyStartDate,
    });
  }

  for (const instrumentRow of instrumentRows) {
    const instrument = applyKnownDrMetadata(instrumentRow);
    const historyStartDate = earliestTradeDateByInstrument.get(instrument.id) ?? null;

    if (historyStartDate != null) {
      refreshTargets.set(instrument.id, {
        instrument,
        historyStartDate,
      });

      if (instrument.currency !== baseCurrency) {
        addRefreshTargetByProviderSymbol(
          `${instrument.currency}${baseCurrency}=X`,
          historyStartDate,
        );
      }

      addRefreshTargetByProviderSymbol(instrument.underlyingProviderSymbol, historyStartDate);
      addRefreshTargetByProviderSymbol(instrument.fxProviderSymbol, historyStartDate);
    }
  }

  if (includeBenchmark && benchmarkInstrument != null) {
    refreshTargets.set(benchmarkInstrument.id, {
      instrument: benchmarkInstrument,
      historyStartDate: earliestPortfolioTradeDate,
    });
  }

  if (includeBenchmark) {
    for (const benchmark of BENCHMARK_WATCHLIST) {
      const benchmarkInstrumentRow = instrumentRows.find(
        (instrument) => instrument.symbol === benchmark.symbol,
      );

      if (benchmarkInstrumentRow == null) {
        continue;
      }

      refreshTargets.set(benchmarkInstrumentRow.id, {
        instrument: benchmarkInstrumentRow,
        historyStartDate: BENCHMARK_HISTORY_START_DATE,
      });
    }
  }

  return {
    benchmarkSymbol,
    marketRefreshMinutes,
    targets: Array.from(refreshTargets.values()),
  };
}

async function hasIncompleteHistoricalData({
  targets,
  snapshotByInstrumentId,
}: {
  targets: RefreshTarget[];
  snapshotByInstrumentId: Map<number, typeof priceSnapshots.$inferSelect>;
}) {
  const historyTargets = targets.filter((target) => target.historyStartDate != null);
  const coverageByInstrument = await getHistoryCoverageByInstrument(historyTargets);

  return historyTargets.some((target) => {
    const coverage = coverageByInstrument.get(target.instrument.id);
    const snapshot = snapshotByInstrumentId.get(target.instrument.id);
    const expectedTailDate =
      snapshot != null && snapshot.currency === target.instrument.currency
        ? getExpectedHistoryTailDate(snapshot.asOf)
        : null;

    const isMissingStartCoverage =
      coverage == null ||
      coverage.earliestPriceDate == null ||
      coverage.earliestPriceDate > (target.historyStartDate ?? "");
    const isMissingTailCoverage =
      expectedTailDate != null &&
      (coverage == null ||
        coverage.latestPriceDate == null ||
        coverage.latestPriceDate < expectedTailDate);

    return isMissingStartCoverage || isMissingTailCoverage;
  });
}

async function withIncrementalHistoryStartDates(targets: RefreshTarget[]) {
  const coverageByInstrument = await getHistoryCoverageByInstrument(targets);

  return targets.map((target) => {
    if (target.historyStartDate == null) {
      return target;
    }

    const coverage = coverageByInstrument.get(target.instrument.id);

    if (
      coverage == null ||
      coverage.earliestPriceDate == null ||
      coverage.latestPriceDate == null ||
      coverage.earliestPriceDate > target.historyStartDate
    ) {
      return target;
    }

    return {
      ...target,
      historyStartDate: coverage.latestPriceDate,
    };
  });
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
  const quoteRows = await provider.getLatestQuotes(providerSymbols);
  const quoteByProviderSymbol = new Map(
    quoteRows.map((quote) => [quote.providerSymbol, quote] satisfies [string, MarketQuoteSnapshot]),
  );
  const historyTargets = refreshTargets.filter((target) => target.historyStartDate != null);
  const historicalResults = await Promise.all(
    historyTargets.map(
      async (target) =>
        [
          target.instrument.id,
          await provider.getHistoricalPrices(target.instrument.providerSymbol, {
            startDate: target.historyStartDate ?? new Date().toISOString().slice(0, 10),
          }),
        ] as const,
    ),
  );
  const historyByInstrumentId = new Map(
    historicalResults.filter(([, result]) => result != null) as Array<
      [number, MarketHistoricalSeries]
    >,
  );
  const now = new Date();
  const intradayResults = await Promise.all(
    refreshTargets.flatMap((target) =>
      INTRADAY_REFRESH_WINDOWS.map(
        async (window) =>
          [
            target.instrument.id,
            window.interval,
            await provider.getIntradayPrices(target.instrument.providerSymbol, {
              interval: window.interval,
              startAt: addDays(now, -window.lookbackDays).toISOString(),
            }),
          ] as const,
      ),
    ),
  );
  const intradayByInstrumentIdAndInterval = new Map(
    intradayResults
      .filter(
        (row): row is readonly [number, MarketIntradayInterval, MarketIntradaySeries] =>
          row[2] != null,
      )
      .map(
        ([instrumentId, interval, result]) =>
          [`${instrumentId}:${interval}`, result] satisfies [string, MarketIntradaySeries],
      ),
  );
  const { issues, validHistories, validIntradaySeries, validQuotes } = classifyRefreshPayloads({
    historyByInstrumentId,
    intradayByInstrumentIdAndInterval,
    intradayWindows: INTRADAY_REFRESH_WINDOWS,
    quoteByProviderSymbol,
    targets: refreshTargets,
  });

  let historicalBarCount = 0;
  let intradayBarCount = 0;

  await db.transaction(async (tx) => {
    for (const [instrumentId, quote] of validQuotes) {
      await tx
        .insert(priceSnapshots)
        .values({
          instrumentId,
          price: quote.price,
          currency: quote.currency,
          asOf: quote.asOf,
          source: quote.source,
        })
        .onConflictDoUpdate({
          target: priceSnapshots.instrumentId,
          set: {
            price: quote.price,
            currency: quote.currency,
            asOf: quote.asOf,
            source: quote.source,
          },
        });
    }

    for (const [instrumentId, series] of validHistories) {
      for (const bar of series.bars) {
        await tx
          .insert(historicalPrices)
          .values({
            instrumentId,
            priceDate: bar.date,
            close: bar.close,
            currency: series.currency,
            source: series.source,
          })
          .onConflictDoUpdate({
            target: [historicalPrices.instrumentId, historicalPrices.priceDate],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source,
            },
          });

        historicalBarCount += 1;
      }
    }

    for (const { instrumentId, series } of validIntradaySeries.values()) {
      for (const bar of series.bars) {
        await tx
          .insert(intradayPrices)
          .values({
            instrumentId,
            interval: series.interval,
            observedAt: bar.observedAt,
            close: bar.close,
            currency: series.currency,
            source: series.source,
          })
          .onConflictDoUpdate({
            target: [
              intradayPrices.instrumentId,
              intradayPrices.interval,
              intradayPrices.observedAt,
            ],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source,
            },
          });

        intradayBarCount += 1;
      }
    }
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
