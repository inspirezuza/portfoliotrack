import "server-only";

import { asc } from "drizzle-orm";
import { OperationTimeoutError, withOperationTimeout } from "@/lib/async/timeout";
import { db } from "@/lib/db/runtime";
import { appSettings, historicalPrices, instruments, intradayPrices, priceSnapshots, transactions } from "@/lib/db/schema";
import type {
  MarketDataProvider,
  MarketHistoricalSeries,
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot
} from "@/lib/market/types";
import { yahooProvider } from "@/lib/market/yahoo-provider";

const DEFAULT_BENCHMARK_SYMBOL = "SPY";
const DEFAULT_MARKET_REFRESH_MINUTES = 30;
const DEFAULT_AUTO_REFRESH_TIMEOUT_MS = 3500;

export type MarketSettings = {
  benchmarkSymbol: string | null;
  marketRefreshMinutes: number;
};

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

type RefreshTarget = {
  instrument: typeof instruments.$inferSelect;
  historyStartDate: string | null;
};

type RefreshContext = {
  benchmarkSymbol: string | null;
  marketRefreshMinutes: number;
  targets: RefreshTarget[];
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
  { interval: "1h", lookbackDays: 35 }
];

export function getMarketDataProvider(): MarketDataProvider {
  return yahooProvider;
}

function parseRefreshMinutes(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MARKET_REFRESH_MINUTES;
  }

  return parsed;
}

export async function getMarketSettings(): Promise<MarketSettings> {
  const settings = await db.select().from(appSettings).all();
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]));
  const benchmarkSymbol = settingsMap.get("benchmarkSymbol")?.trim() || DEFAULT_BENCHMARK_SYMBOL;

  return {
    benchmarkSymbol,
    marketRefreshMinutes: parseRefreshMinutes(settingsMap.get("marketRefreshMinutes"))
  };
}

export function getPriceAgeMinutes(asOf: string | null, now = new Date()) {
  if (asOf == null) {
    return null;
  }

  const timestamp = Date.parse(asOf);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
}

export function isMarketDataStale(asOf: string | null, refreshMinutes: number, now = new Date()) {
  const ageMinutes = getPriceAgeMinutes(asOf, now);

  return ageMinutes != null && ageMinutes > refreshMinutes;
}

function compareIsoTimestampsDescending(left: string, right: string) {
  return right.localeCompare(left);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getExpectedHistoryTailDate(asOf: string) {
  const snapshotDate = new Date(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const utcDay = snapshotDate.getUTCDay();

  if (Number.isNaN(snapshotDate.getTime())) {
    return null;
  }

  if (utcDay === 1) {
    return toIsoDate(addDays(snapshotDate, -3));
  }

  if (utcDay === 0) {
    return toIsoDate(addDays(snapshotDate, -2));
  }

  if (utcDay === 6) {
    return toIsoDate(addDays(snapshotDate, -1));
  }

  return toIsoDate(addDays(snapshotDate, -1));
}

async function getHistoryCoverageByInstrument(targets: RefreshTarget[]) {
  const historyTargets = targets.filter((target) => target.historyStartDate != null);

  if (historyTargets.length === 0) {
    return new Map<number, { earliestPriceDate: string | null; latestPriceDate: string | null }>();
  }

  const historicalRows = await db.select().from(historicalPrices).all();
  const coverageByInstrument = new Map<number, { earliestPriceDate: string | null; latestPriceDate: string | null }>();
  const targetByInstrumentId = new Map(
    historyTargets.map((target) => [target.instrument.id, target] as const)
  );

  for (const row of historicalRows) {
    const target = targetByInstrumentId.get(row.instrumentId);

    if (target == null || row.currency !== target.instrument.currency) {
      continue;
    }

    const existingCoverage = coverageByInstrument.get(row.instrumentId) ?? {
      earliestPriceDate: null,
      latestPriceDate: null
    };

    coverageByInstrument.set(row.instrumentId, {
      earliestPriceDate:
        existingCoverage.earliestPriceDate == null || row.priceDate < existingCoverage.earliestPriceDate
          ? row.priceDate
          : existingCoverage.earliestPriceDate,
      latestPriceDate:
        existingCoverage.latestPriceDate == null || row.priceDate > existingCoverage.latestPriceDate
          ? row.priceDate
          : existingCoverage.latestPriceDate
    });
  }

  return coverageByInstrument;
}

async function hasMissingIntradayData(targets: RefreshTarget[]) {
  if (targets.length === 0) {
    return false;
  }

  const rows = await db.select().from(intradayPrices).all();
  const intervalsByInstrumentId = new Map<number, Set<string>>();

  for (const row of rows) {
    const intervals = intervalsByInstrumentId.get(row.instrumentId) ?? new Set<string>();
    intervals.add(row.interval);
    intervalsByInstrumentId.set(row.instrumentId, intervals);
  }

  return targets.some((target) => {
    const intervals = intervalsByInstrumentId.get(target.instrument.id);

    return intervals == null || INTRADAY_REFRESH_WINDOWS.some((window) => !intervals.has(window.interval));
  });
}

function contextCoversTarget(existingTarget: RefreshTarget, requestedTarget: RefreshTarget) {
  if (
    existingTarget.instrument.id !== requestedTarget.instrument.id ||
    existingTarget.instrument.providerSymbol !== requestedTarget.instrument.providerSymbol
  ) {
    return false;
  }

  if (requestedTarget.historyStartDate == null) {
    return true;
  }

  return (
    existingTarget.historyStartDate != null &&
    existingTarget.historyStartDate <= requestedTarget.historyStartDate
  );
}

function contextCoversRequest(existingContext: RefreshContext, requestedContext: RefreshContext) {
  const existingTargetsByInstrumentId = new Map(
    existingContext.targets.map((target) => [target.instrument.id, target] as const)
  );

  return requestedContext.targets.every((requestedTarget) => {
    const existingTarget = existingTargetsByInstrumentId.get(requestedTarget.instrument.id);

    return existingTarget != null && contextCoversTarget(existingTarget, requestedTarget);
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
        promise: refreshPromise
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
      timeoutMs
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
  includeBenchmark = true
}: {
  includeBenchmark?: boolean;
} = {}): Promise<RefreshContext> {
  const [{ benchmarkSymbol, marketRefreshMinutes }, instrumentRows, transactionRows] = await Promise.all([
    getMarketSettings(),
    db.select().from(instruments).all(),
    db
      .select({
        instrumentId: transactions.instrumentId,
        tradeDate: transactions.tradeDate
      })
      .from(transactions)
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
      .all()
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
      : instrumentRows.find((instrument) => instrument.symbol === benchmarkSymbol) ?? null;
  const refreshTargets = new Map<number, RefreshTarget>();

  for (const instrument of instrumentRows) {
    const historyStartDate = earliestTradeDateByInstrument.get(instrument.id) ?? null;

    if (historyStartDate != null) {
      refreshTargets.set(instrument.id, {
        instrument,
        historyStartDate
      });
    }
  }

  if (includeBenchmark && benchmarkInstrument != null) {
    refreshTargets.set(benchmarkInstrument.id, {
      instrument: benchmarkInstrument,
      historyStartDate: earliestPortfolioTradeDate
    });
  }

  return {
    benchmarkSymbol,
    marketRefreshMinutes,
    targets: Array.from(refreshTargets.values())
  };
}

async function hasIncompleteHistoricalData({
  targets,
  snapshotByInstrumentId
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
      (coverage == null || coverage.latestPriceDate == null || coverage.latestPriceDate < expectedTailDate);

    return isMissingStartCoverage || isMissingTailCoverage;
  });
}

export async function ensureFreshMarketDataCache({
  includeBenchmark = true,
  timeoutMs = DEFAULT_AUTO_REFRESH_TIMEOUT_MS
}: {
  includeBenchmark?: boolean;
  timeoutMs?: number | null;
} = {}) {
  const context = await buildRefreshContext({ includeBenchmark });
  const { marketRefreshMinutes, targets } = context;

  if (targets.length === 0) {
    return null;
  }

  const snapshotRows = await db.select().from(priceSnapshots).all();
  const snapshotByInstrumentId = new Map(
    snapshotRows.map((snapshot) => [snapshot.instrumentId, snapshot] as const)
  );
  const hasMissingSnapshot = targets.some((target) => !snapshotByInstrumentId.has(target.instrument.id));
  const hasStaleSnapshot = targets.some((target) =>
    isMarketDataStale(snapshotByInstrumentId.get(target.instrument.id)?.asOf ?? null, marketRefreshMinutes)
  );
  const missingHistoricalData = await hasIncompleteHistoricalData({
    targets,
    snapshotByInstrumentId
  });
  const missingIntradayData = await hasMissingIntradayData(targets);

  if (!hasMissingSnapshot && !hasStaleSnapshot && !missingHistoricalData && !missingIntradayData) {
    return null;
  }

  return runAutoRefreshBestEffort(context, timeoutMs);
}

export async function refreshMarketDataCache(
  existingContext?: RefreshContext
): Promise<MarketDataRefreshResult> {
  const context = existingContext ?? (await buildRefreshContext());

  return runRefreshWithDedup(context);
}

async function performRefreshMarketDataCache(
  context: RefreshContext
): Promise<MarketDataRefreshResult> {
  const { benchmarkSymbol, marketRefreshMinutes, targets } = context;
  const providerSymbols = targets.map((target) => target.instrument.providerSymbol);

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
      issues: []
    };
  }

  const provider = getMarketDataProvider();
  const quoteRows = await provider.getLatestQuotes(providerSymbols);
  const quoteByProviderSymbol = new Map(
    quoteRows.map((quote) => [quote.providerSymbol, quote] satisfies [string, MarketQuoteSnapshot])
  );
  const historyTargets = targets.filter((target) => target.historyStartDate != null);
  const historicalResults = await Promise.all(
    historyTargets.map(async (target) => [
      target.instrument.id,
      await provider.getHistoricalPrices(target.instrument.providerSymbol, {
        startDate: target.historyStartDate ?? new Date().toISOString().slice(0, 10)
      })
    ] as const)
  );
  const historyByInstrumentId = new Map(
    historicalResults.filter(([, result]) => result != null) as Array<[number, MarketHistoricalSeries]>
  );
  const now = new Date();
  const intradayResults = await Promise.all(
    targets.flatMap((target) =>
      INTRADAY_REFRESH_WINDOWS.map(async (window) => [
        target.instrument.id,
        window.interval,
        await provider.getIntradayPrices(target.instrument.providerSymbol, {
          interval: window.interval,
          startAt: addDays(now, -window.lookbackDays).toISOString()
        })
      ] as const)
    )
  );
  const issues: MarketRefreshIssue[] = [];
  const validQuotes = new Map<number, MarketQuoteSnapshot>();
  const validHistories = new Map<number, MarketHistoricalSeries>();
  const validIntradaySeries = new Map<string, { instrumentId: number; series: MarketIntradaySeries }>();

  for (const target of targets) {
    const quote = quoteByProviderSymbol.get(target.instrument.providerSymbol);

    if (quote == null) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "missing_quote"
      });
    } else if (quote.currency !== target.instrument.currency) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "quote_currency_mismatch"
      });
    } else {
      validQuotes.set(target.instrument.id, quote);
    }

    for (const window of INTRADAY_REFRESH_WINDOWS) {
      const intraday = intradayResults.find(
        ([instrumentId, interval]) => instrumentId === target.instrument.id && interval === window.interval
      )?.[2];

      if (intraday == null) {
        issues.push({
          symbol: target.instrument.symbol,
          providerSymbol: target.instrument.providerSymbol,
          reason: "missing_intraday"
        });
        continue;
      }

      if (intraday.currency !== target.instrument.currency) {
        issues.push({
          symbol: target.instrument.symbol,
          providerSymbol: target.instrument.providerSymbol,
          reason: "intraday_currency_mismatch"
        });
        continue;
      }

      validIntradaySeries.set(`${target.instrument.id}:${window.interval}`, {
        instrumentId: target.instrument.id,
        series: intraday
      });
    }

    if (target.historyStartDate == null) {
      continue;
    }

    const history = historyByInstrumentId.get(target.instrument.id);

    if (history == null) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "missing_history"
      });
      continue;
    }

    if (history.currency !== target.instrument.currency) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "history_currency_mismatch"
      });
      continue;
    }

    validHistories.set(target.instrument.id, history);
  }

  let historicalBarCount = 0;
  let intradayBarCount = 0;

  db.transaction((tx) => {
    for (const [instrumentId, quote] of validQuotes) {
      tx.insert(priceSnapshots)
        .values({
          instrumentId,
          price: quote.price,
          currency: quote.currency,
          asOf: quote.asOf,
          source: quote.source
        })
        .onConflictDoUpdate({
          target: priceSnapshots.instrumentId,
          set: {
            price: quote.price,
            currency: quote.currency,
            asOf: quote.asOf,
            source: quote.source
          }
        })
        .run();
    }

    for (const [instrumentId, series] of validHistories) {
      for (const bar of series.bars) {
        tx.insert(historicalPrices)
          .values({
            instrumentId,
            priceDate: bar.date,
            close: bar.close,
            currency: series.currency,
            source: series.source
          })
          .onConflictDoUpdate({
            target: [historicalPrices.instrumentId, historicalPrices.priceDate],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source
            }
          })
          .run();

        historicalBarCount += 1;
      }
    }

    for (const { instrumentId, series } of validIntradaySeries.values()) {
      for (const bar of series.bars) {
        tx.insert(intradayPrices)
          .values({
            instrumentId,
            interval: series.interval,
            observedAt: bar.observedAt,
            close: bar.close,
            currency: series.currency,
            source: series.source
          })
          .onConflictDoUpdate({
            target: [intradayPrices.instrumentId, intradayPrices.interval, intradayPrices.observedAt],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source
            }
          })
          .run();

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
    requestedSymbols: targets.map((target) => target.instrument.symbol).sort((left, right) =>
      left.localeCompare(right)
    ),
    quoteRefreshCount: validQuotes.size,
    historicalBarCount,
    intradayBarCount,
    latestSuccessfulAsOf,
    issues
  };
}
