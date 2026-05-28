import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { OperationTimeoutError, withOperationTimeout } from "@/lib/async/timeout";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  historicalPrices,
  instruments,
  intradayPrices,
  priceSnapshots,
  transactions,
  type HistoricalPrice,
  type Instrument,
  type IntradayPrice,
  type PriceSnapshot,
  type Transaction,
} from "@/lib/db/schema";
import {
  getMarketDataProvider,
  getMarketSettings,
  getPriceAgeMinutes,
  isMarketDataStale,
} from "@/lib/market/provider";
import type {
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";
import { calculatePositionForInstrument } from "@/lib/portfolio/positions";
import {
  combineAssetPriceHistory,
  getAssetHistoryStartDate,
  getAssetHistoryStatus,
  getAssetIntradayStartAt,
  getCurrentLocalIsoDate,
  getProviderHistoryUrl,
  type AssetPricePoint,
} from "@/server/assets/history";
import { toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";

type AssetHistoryRefreshResult = {
  attempted: boolean;
  historyIssue: string | null;
};

type AssetIntradayRefreshResult = {
  attempted: boolean;
  intradayIssue: string | null;
};

type AssetQuoteRefreshResult = {
  attempted: boolean;
  quoteIssue: string | null;
};

type AssetHistoryCooldownState = {
  issue: string;
  retryAfter: number;
};

const HISTORY_REFRESH_FAILURE_COOLDOWN_MS = 30 * 60 * 1000;
const ASSET_MARKET_REFRESH_TIMEOUT_MS = 3500;
const historyRefreshCooldownByInstrumentId = new Map<number, AssetHistoryCooldownState>();
const ASSET_INTRADAY_WINDOWS: Array<{
  interval: MarketIntradayInterval;
  lookbackDays: number;
}> = [
  { interval: "5m", lookbackDays: 2 },
  { interval: "1h", lookbackDays: 35 },
];

export type AssetDetail = {
  instrument: {
    id: number;
    symbol: string;
    displayName: string;
    market: string;
    instrumentType: string;
    currency: string;
    providerSymbol: string;
    providerHistoryUrl: string;
    underlyingSymbol: string | null;
    underlyingDisplayName: string | null;
    underlyingCurrency: string | null;
    underlyingProviderSymbol: string | null;
    drRatio: number | null;
    fxProviderSymbol: string | null;
    isActive: boolean;
  };
  position: {
    quantity: number;
    averageCost: number | null;
    totalCost: number | null;
    realizedPnl: number;
    totalFees: number;
    marketValue: number | null;
    unrealizedPnl: number | null;
    hasOpenPosition: boolean;
    tradeCount: number;
    firstTradeDate: string | null;
    lastTradeDate: string | null;
  };
  transactions: Array<{
    id: number;
    tradeDate: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    fee: number;
    notes: string | null;
  }>;
  marketData: {
    lastPrice: number | null;
    lastPriceAsOf: string | null;
    lastPriceSource: string | null;
    priceAgeMinutes: number | null;
    isPriceDataStale: boolean;
    marketRefreshMinutes: number;
    latestHistoryDate: string | null;
    firstHistoryDate: string | null;
    historySource: string | null;
    historyStatus: "full" | "partial" | "unavailable";
    historyUnavailableReason: string | null;
    requestedHistoryStartDate: string | null;
    priceHistory: AssetPricePoint[];
  };
  dr: {
    underlyingSymbol: string | null;
    underlyingDisplayName: string | null;
    underlyingCurrency: string | null;
    underlyingProviderSymbol: string | null;
    drRatio: number | null;
    fxProviderSymbol: string | null;
    parentMarketPrice: number | null;
    parentMarketPriceAsOf: string | null;
    parentMarketPriceSource: string | null;
    fxRate: number | null;
    fxRateAsOf: string | null;
    fxRateSource: string | null;
    impliedParentPrice: number | null;
    averageImpliedParentCost: number | null;
    premiumDiscount: number | null;
    analyticsIssue: string | null;
  } | null;
};

function hasDrMetadata(instrument: Instrument) {
  return (
    instrument.underlyingSymbol != null ||
    instrument.underlyingDisplayName != null ||
    instrument.underlyingCurrency != null ||
    instrument.underlyingProviderSymbol != null ||
    instrument.drRatio != null ||
    instrument.fxProviderSymbol != null
  );
}

function shouldExposeDrAnalytics(instrument: Instrument) {
  return instrument.instrumentType === "DR" || hasDrMetadata(instrument);
}

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function divideIfAvailable(numerator: number | null, denominator: number | null) {
  if (numerator == null || !isPositiveFiniteNumber(denominator)) {
    return null;
  }

  return numerator / denominator;
}

function getQuoteByProviderSymbol(quotes: MarketQuoteSnapshot[], providerSymbol: string) {
  return quotes.find((quote) => quote.providerSymbol === providerSymbol) ?? null;
}

async function runAssetMarketRefreshBestEffort<T>({
  operation,
  fallback,
  label,
}: {
  operation: Promise<T>;
  fallback: T;
  label: string;
}) {
  try {
    return await withOperationTimeout(operation, {
      label,
      timeoutMs: ASSET_MARKET_REFRESH_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.warn(error.message, "Using cached asset market data while refresh continues.");
      return fallback;
    }

    console.error(`${label} failed`, error);
    return fallback;
  }
}

async function getDrProviderQuotes(instrument: Instrument) {
  if (
    instrument.underlyingProviderSymbol == null ||
    instrument.underlyingCurrency == null ||
    instrument.fxProviderSymbol == null
  ) {
    return {
      parentQuote: null,
      fxQuote: null,
      analyticsIssue: "DR metadata is incomplete, so parent and FX analytics are unavailable.",
    };
  }

  try {
    const provider = getMarketDataProvider();
    const quotes = await provider.getLatestQuotes([
      instrument.underlyingProviderSymbol,
      instrument.fxProviderSymbol,
    ]);
    const parentQuote = getQuoteByProviderSymbol(quotes, instrument.underlyingProviderSymbol);
    const fxQuote = getQuoteByProviderSymbol(quotes, instrument.fxProviderSymbol);

    if (parentQuote == null) {
      return {
        parentQuote: null,
        fxQuote,
        analyticsIssue: `Latest parent quote is unavailable for ${instrument.underlyingProviderSymbol}.`,
      };
    }

    if (parentQuote.currency !== instrument.underlyingCurrency) {
      return {
        parentQuote: null,
        fxQuote,
        analyticsIssue: `Latest parent quote returned ${parentQuote.currency}, but ${instrument.underlyingSymbol ?? instrument.underlyingProviderSymbol} is tracked in ${instrument.underlyingCurrency}.`,
      };
    }

    if (fxQuote == null) {
      return {
        parentQuote,
        fxQuote: null,
        analyticsIssue: `Latest FX quote is unavailable for ${instrument.fxProviderSymbol}.`,
      };
    }

    if (fxQuote.currency !== instrument.currency) {
      return {
        parentQuote,
        fxQuote: null,
        analyticsIssue: `Latest FX quote returned ${fxQuote.currency}, but ${instrument.fxProviderSymbol} is expected in ${instrument.currency}.`,
      };
    }

    return {
      parentQuote,
      fxQuote,
      analyticsIssue: null,
    };
  } catch {
    return {
      parentQuote: null,
      fxQuote: null,
      analyticsIssue: "DR parent and FX quotes are unavailable from the provider right now.",
    };
  }
}

async function buildDrAnalytics({
  instrument,
  drPrice,
  averageDrCost,
  allowProviderQuotes,
}: {
  instrument: Instrument;
  drPrice: number | null;
  averageDrCost: number | null;
  allowProviderQuotes: boolean;
}): Promise<AssetDetail["dr"]> {
  if (!shouldExposeDrAnalytics(instrument)) {
    return null;
  }

  const hasCompleteCalculationMetadata =
    allowProviderQuotes &&
    isPositiveFiniteNumber(instrument.drRatio) &&
    instrument.underlyingProviderSymbol != null &&
    instrument.underlyingCurrency != null &&
    instrument.fxProviderSymbol != null;
  const { parentQuote, fxQuote, analyticsIssue } = hasCompleteCalculationMetadata
    ? await getDrProviderQuotes(instrument)
    : {
        parentQuote: null,
        fxQuote: null,
        analyticsIssue: allowProviderQuotes
          ? "DR metadata is incomplete, so parent and FX analytics are unavailable."
          : "Login and refresh market data to calculate live DR parent and FX analytics.",
      };
  const parentMarketPrice = isPositiveFiniteNumber(parentQuote?.price) ? parentQuote.price : null;
  const fxRate = isPositiveFiniteNumber(fxQuote?.price) ? fxQuote.price : null;
  const impliedParentPrice =
    isPositiveFiniteNumber(drPrice) && isPositiveFiniteNumber(instrument.drRatio) && fxRate != null
      ? normalizeMoney((drPrice * instrument.drRatio) / fxRate)
      : null;
  const averageImpliedParentCost =
    isPositiveFiniteNumber(averageDrCost) &&
    isPositiveFiniteNumber(instrument.drRatio) &&
    fxRate != null
      ? normalizeMoney((averageDrCost * instrument.drRatio) / fxRate)
      : null;
  const premiumDiscount = divideIfAvailable(impliedParentPrice, parentMarketPrice);

  return {
    underlyingSymbol: instrument.underlyingSymbol,
    underlyingDisplayName: instrument.underlyingDisplayName,
    underlyingCurrency: instrument.underlyingCurrency,
    underlyingProviderSymbol: instrument.underlyingProviderSymbol,
    drRatio: instrument.drRatio,
    fxProviderSymbol: instrument.fxProviderSymbol,
    parentMarketPrice,
    parentMarketPriceAsOf: parentQuote?.asOf ?? null,
    parentMarketPriceSource: parentQuote?.source ?? null,
    fxRate,
    fxRateAsOf: fxQuote?.asOf ?? null,
    fxRateSource: fxQuote?.source ?? null,
    impliedParentPrice,
    averageImpliedParentCost,
    premiumDiscount: premiumDiscount == null ? null : premiumDiscount - 1,
    analyticsIssue,
  };
}

function quoteMatchesInstrumentCurrency(
  snapshot: PriceSnapshot | null,
  instrument: Instrument,
): snapshot is PriceSnapshot {
  return snapshot != null && snapshot.currency === instrument.currency;
}

function filterMatchingHistoryRows(rows: HistoricalPrice[], instrument: Instrument) {
  return rows
    .filter((row) => row.currency === instrument.currency)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

function filterMatchingIntradayRows(rows: IntradayPrice[], instrument: Instrument) {
  return rows
    .filter((row) => row.currency === instrument.currency)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

async function refreshAssetQuote({
  instrument,
}: {
  instrument: Instrument;
}): Promise<AssetQuoteRefreshResult> {
  const provider = getMarketDataProvider();
  const quotes = await provider.getLatestQuotes([instrument.providerSymbol]);
  const quote = quotes[0] ?? null;
  const quoteIssue =
    quote == null
      ? `Latest quote is unavailable for ${instrument.providerSymbol} right now.`
      : quote.currency !== instrument.currency
        ? `Latest quote returned ${quote.currency}, but ${instrument.symbol} is tracked in ${instrument.currency}.`
        : null;

  if (quote != null && quote.currency === instrument.currency) {
    await db
      .insert(priceSnapshots)
      .values({
        instrumentId: instrument.id,
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

  return {
    attempted: true,
    quoteIssue,
  };
}

function getHistoryCooldownState(instrumentId: number, now = Date.now()) {
  const state = historyRefreshCooldownByInstrumentId.get(instrumentId);

  if (state == null) {
    return null;
  }

  if (state.retryAfter <= now) {
    historyRefreshCooldownByInstrumentId.delete(instrumentId);
    return null;
  }

  return state;
}

function setHistoryRefreshCooldown(instrumentId: number, issue: string, now = Date.now()) {
  historyRefreshCooldownByInstrumentId.set(instrumentId, {
    issue,
    retryAfter: now + HISTORY_REFRESH_FAILURE_COOLDOWN_MS,
  });
}

function clearHistoryRefreshCooldown(instrumentId: number) {
  historyRefreshCooldownByInstrumentId.delete(instrumentId);
}

async function refreshAssetHistory({
  instrument,
  historyStartDate,
}: {
  instrument: Instrument;
  historyStartDate: string;
}): Promise<AssetHistoryRefreshResult> {
  const provider = getMarketDataProvider();
  const history = await provider.getHistoricalPrices(instrument.providerSymbol, {
    startDate: historyStartDate,
  });
  const returnedEmptyHistory = history != null && history.bars.length === 0;
  const historyIssue =
    history == null
      ? `Historical prices are unavailable from the provider for ${instrument.providerSymbol} right now.`
      : returnedEmptyHistory
        ? `Historical prices returned no bars for ${instrument.providerSymbol} in the requested window.`
        : history.currency !== instrument.currency
          ? `Historical prices returned ${history.currency}, but ${instrument.symbol} is tracked in ${instrument.currency}.`
          : null;

  if (historyIssue != null) {
    setHistoryRefreshCooldown(instrument.id, historyIssue);

    return {
      attempted: true,
      historyIssue,
    };
  }

  const validHistory = history!;

  await db.transaction(async (tx) => {
    for (const bar of validHistory.bars) {
      await tx
        .insert(historicalPrices)
        .values({
          instrumentId: instrument.id,
          priceDate: bar.date,
          close: bar.close,
          currency: validHistory.currency,
          source: validHistory.source,
        })
        .onConflictDoUpdate({
          target: [historicalPrices.instrumentId, historicalPrices.priceDate],
          set: {
            close: bar.close,
            currency: validHistory.currency,
            source: validHistory.source,
          },
        });
    }
  });

  clearHistoryRefreshCooldown(instrument.id);

  return {
    attempted: true,
    historyIssue: null,
  };
}

async function refreshAssetIntraday({
  instrument,
}: {
  instrument: Instrument;
}): Promise<AssetIntradayRefreshResult> {
  const provider = getMarketDataProvider();
  const now = new Date();
  const intradayResults = await Promise.all(
    ASSET_INTRADAY_WINDOWS.map(async (window) => {
      const series = await provider.getIntradayPrices(instrument.providerSymbol, {
        interval: window.interval,
        startAt: getAssetIntradayStartAt(now, window.lookbackDays),
      });

      return {
        interval: window.interval,
        series,
      };
    }),
  );
  const validSeries: MarketIntradaySeries[] = [];
  const issue = intradayResults.every((result) => result.series == null)
    ? `Intraday prices are unavailable from the provider for ${instrument.providerSymbol} right now.`
    : intradayResults.some(
          (result) => result.series != null && result.series.currency !== instrument.currency,
        )
      ? `Intraday prices returned a currency that does not match ${instrument.symbol}.`
      : null;

  for (const result of intradayResults) {
    if (result.series == null || result.series.currency !== instrument.currency) {
      continue;
    }

    validSeries.push(result.series);
  }

  if (validSeries.length > 0) {
    await db.transaction(async (tx) => {
      for (const series of validSeries) {
        for (const bar of series.bars) {
          await tx
            .insert(intradayPrices)
            .values({
              instrumentId: instrument.id,
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
        }
      }
    });
  }

  return {
    attempted: true,
    intradayIssue: issue,
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

async function getAssetRows(symbol: string, portfolioIds: number[]) {
  const [instrument] = await db.select().from(instruments).where(eq(instruments.symbol, symbol));

  if (instrument == null) {
    return null;
  }

  const [transactionRows, snapshot, historyRows, intradayRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(
        and(
          portfolioIds.length === 1
            ? eq(transactions.portfolioId, portfolioIds[0])
            : inArray(transactions.portfolioId, portfolioIds),
          eq(transactions.instrumentId, instrument.id),
        ),
      )
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)),
    db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.instrumentId, instrument.id))
      .then((rows) => rows[0] ?? null),
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrument.id)),
    db.select().from(intradayPrices).where(eq(intradayPrices.instrumentId, instrument.id)),
  ]);

  return {
    instrument,
    transactionRows,
    snapshot,
    historyRows,
    intradayRows,
  };
}

async function getAssetMarketRows(instrumentId: number) {
  const [snapshot, historyRows, intradayRows] = await Promise.all([
    db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.instrumentId, instrumentId))
      .then((rows) => rows[0] ?? null),
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrumentId)),
    db.select().from(intradayPrices).where(eq(intradayPrices.instrumentId, instrumentId)),
  ]);

  return {
    historyRows,
    intradayRows,
    snapshot,
  };
}

export async function getAssetDetail(
  symbol: string,
  {
    portfolioId: portfolioIdInput,
    portfolioIds: portfolioIdsInput,
    allowMarketRefresh = false,
  }: {
    portfolioId?: number;
    portfolioIds?: number[];
    allowMarketRefresh?: boolean;
  },
): Promise<AssetDetail | null> {
  const portfolioIds = parsePortfolioScope({
    portfolioId: portfolioIdInput,
    portfolioIds: portfolioIdsInput,
  });
  const normalizedSymbol = symbol.trim().toUpperCase();
  const initialRows = await getAssetRows(normalizedSymbol, portfolioIds);

  if (initialRows == null) {
    return null;
  }

  const { transactionRows } = initialRows;
  const instrument = applyKnownDrMetadata(initialRows.instrument);
  const asOfDate = getCurrentLocalIsoDate();
  const currentTransactionRows = transactionRows.filter((row) => row.tradeDate <= asOfDate);
  const marketSettings = await getMarketSettings();
  const firstTradeDate = currentTransactionRows[0]?.tradeDate ?? null;
  const requestedHistoryStartDate = getAssetHistoryStartDate(firstTradeDate);
  const initialSnapshot = initialRows.snapshot ?? null;
  const matchingInitialSnapshot = quoteMatchesInstrumentCurrency(initialSnapshot, instrument)
    ? initialSnapshot
    : null;
  const matchingInitialHistory = filterMatchingHistoryRows(initialRows.historyRows, instrument);
  const matchingInitialIntraday = filterMatchingIntradayRows(initialRows.intradayRows, instrument);
  const shouldRefreshQuote =
    allowMarketRefresh &&
    (matchingInitialSnapshot == null ||
      isMarketDataStale(matchingInitialSnapshot.asOf, marketSettings.marketRefreshMinutes));
  const historyCooldownState = getHistoryCooldownState(instrument.id);
  const shouldRefreshHistory =
    allowMarketRefresh && matchingInitialHistory.length === 0 && historyCooldownState == null;
  const shouldRefreshIntraday =
    allowMarketRefresh && (matchingInitialIntraday.length === 0 || shouldRefreshQuote);

  const [quoteRefreshResult, historyRefreshResult, intradayRefreshResult] = await Promise.all([
    shouldRefreshQuote
      ? runAssetMarketRefreshBestEffort({
          operation: refreshAssetQuote({
            instrument,
          }),
          fallback: {
            attempted: true,
            quoteIssue: `Latest quote refresh timed out for ${instrument.providerSymbol}; cached data is shown.`,
          } satisfies AssetQuoteRefreshResult,
          label: `Asset quote refresh for ${instrument.providerSymbol}`,
        })
      : Promise.resolve({
          attempted: false,
          quoteIssue: null,
        } satisfies AssetQuoteRefreshResult),
    shouldRefreshHistory
      ? runAssetMarketRefreshBestEffort({
          operation: refreshAssetHistory({
            instrument,
            historyStartDate: requestedHistoryStartDate,
          }),
          fallback: {
            attempted: true,
            historyIssue: `Historical price refresh timed out for ${instrument.providerSymbol}; cached data is shown.`,
          } satisfies AssetHistoryRefreshResult,
          label: `Asset history refresh for ${instrument.providerSymbol}`,
        })
      : Promise.resolve({
          attempted: false,
          historyIssue: historyCooldownState?.issue ?? null,
        } satisfies AssetHistoryRefreshResult),
    shouldRefreshIntraday
      ? runAssetMarketRefreshBestEffort({
          operation: refreshAssetIntraday({
            instrument,
          }),
          fallback: {
            attempted: true,
            intradayIssue: `Intraday price refresh timed out for ${instrument.providerSymbol}; cached data is shown.`,
          } satisfies AssetIntradayRefreshResult,
          label: `Asset intraday refresh for ${instrument.providerSymbol}`,
        })
      : Promise.resolve({
          attempted: false,
          intradayIssue: null,
        } satisfies AssetIntradayRefreshResult),
  ]);
  const didRefreshAnyMarketData =
    quoteRefreshResult.attempted ||
    historyRefreshResult.attempted ||
    intradayRefreshResult.attempted;
  const latestRows = didRefreshAnyMarketData
    ? {
        ...initialRows,
        ...(await getAssetMarketRows(instrument.id)),
      }
    : initialRows;

  const position = calculatePositionForInstrument(
    currentTransactionRows.map((row) => toChronologicalPositionTransaction(row as Transaction)),
  );
  const latestSnapshot = latestRows.snapshot ?? null;
  const matchingSnapshot = quoteMatchesInstrumentCurrency(latestSnapshot, instrument)
    ? latestSnapshot
    : null;
  const matchingHistory = filterMatchingHistoryRows(latestRows.historyRows, instrument);
  const matchingIntraday = filterMatchingIntradayRows(latestRows.intradayRows, instrument);
  const lastPrice = matchingSnapshot?.price ?? null;
  const hasOpenPosition = position.quantity > 0;
  const marketValue =
    hasOpenPosition && lastPrice != null ? normalizeMoney(position.quantity * lastPrice) : null;
  const unrealizedPnl =
    marketValue != null ? normalizeMoney(marketValue - position.totalCost) : null;
  const firstHistoryDate = matchingHistory[0]?.priceDate ?? null;
  const latestHistoryDate = matchingHistory[matchingHistory.length - 1]?.priceDate ?? null;
  const historyStatus = getAssetHistoryStatus({
    requestedHistoryStartDate,
    firstHistoryDate,
    historyCount: matchingHistory.length,
  });
  const averageCost = hasOpenPosition ? position.averageCost : null;
  const totalCost = hasOpenPosition ? position.totalCost : null;
  const dr = await buildDrAnalytics({
    instrument,
    drPrice: lastPrice,
    averageDrCost: averageCost,
    allowProviderQuotes: allowMarketRefresh,
  });

  return {
    instrument: {
      id: instrument.id,
      symbol: instrument.symbol,
      displayName: instrument.displayName,
      market: instrument.market,
      instrumentType: instrument.instrumentType,
      currency: instrument.currency,
      providerSymbol: instrument.providerSymbol,
      providerHistoryUrl: getProviderHistoryUrl(instrument.providerSymbol),
      underlyingSymbol: instrument.underlyingSymbol,
      underlyingDisplayName: instrument.underlyingDisplayName,
      underlyingCurrency: instrument.underlyingCurrency,
      underlyingProviderSymbol: instrument.underlyingProviderSymbol,
      drRatio: instrument.drRatio,
      fxProviderSymbol: instrument.fxProviderSymbol,
      isActive: instrument.isActive,
    },
    position: {
      quantity: position.quantity,
      averageCost,
      totalCost,
      realizedPnl: position.realizedPnl,
      totalFees: position.totalFees,
      marketValue,
      unrealizedPnl,
      hasOpenPosition,
      tradeCount: currentTransactionRows.length,
      firstTradeDate,
      lastTradeDate: currentTransactionRows[currentTransactionRows.length - 1]?.tradeDate ?? null,
    },
    transactions: currentTransactionRows.map((row) => ({
      id: row.id,
      tradeDate: row.tradeDate,
      side: row.side as "BUY" | "SELL",
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      notes: row.notes,
    })),
    marketData: {
      lastPrice,
      lastPriceAsOf: matchingSnapshot?.asOf ?? null,
      lastPriceSource: matchingSnapshot?.source ?? null,
      priceAgeMinutes: getPriceAgeMinutes(matchingSnapshot?.asOf ?? null),
      isPriceDataStale: isMarketDataStale(
        matchingSnapshot?.asOf ?? null,
        marketSettings.marketRefreshMinutes,
      ),
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      latestHistoryDate,
      firstHistoryDate,
      historySource: matchingHistory[0]?.source ?? null,
      historyStatus,
      historyUnavailableReason:
        matchingHistory.length > 0
          ? null
          : (historyRefreshResult.historyIssue ??
            "No cached daily price history is available for this symbol yet."),
      requestedHistoryStartDate,
      priceHistory: combineAssetPriceHistory({
        historyRows: matchingHistory,
        intradayRows: matchingIntraday,
      }),
    },
    dr,
  };
}
