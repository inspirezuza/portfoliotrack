import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
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
import { getMarketSettings, getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider";
import { calculatePositionForInstrument } from "@/lib/portfolio/positions";
import { buildDrAnalytics } from "@/server/assets/dr-analytics";
import {
  combineAssetPriceHistory,
  getAssetHistoryStartDate,
  getAssetHistoryStatus,
  getCurrentLocalIsoDate,
  getProviderHistoryUrl,
  type AssetPricePoint,
} from "@/server/assets/history";
import {
  getHistoryCooldownState,
  refreshAssetHistory,
  refreshAssetIntraday,
  refreshAssetQuote,
  runAssetMarketRefreshBestEffort,
  type AssetHistoryRefreshResult,
  type AssetIntradayRefreshResult,
  type AssetQuoteRefreshResult,
} from "@/server/assets/refresh";
import { toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";

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
