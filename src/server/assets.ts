import "server-only";

import { normalizeMoney } from "@/lib/db/precision";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { type Transaction } from "@/lib/db/schema";
import { getMarketSettings, getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider";
import { calculatePositionForInstrument } from "@/lib/portfolio/positions";
import { buildDrAnalytics } from "@/server/assets/dr-analytics";
import {
  combineAssetPriceHistory,
  getAssetHistoryStartDate,
  getAssetHistoryStatus,
  getCurrentLocalIsoDate,
  getProviderHistoryUrl,
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
import {
  filterMatchingHistoryRows,
  filterMatchingIntradayRows,
  getAssetMarketRows,
  getAssetRows,
  quoteMatchesInstrumentCurrency,
} from "@/server/assets/rows";
import { toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";
import type { AssetDetail } from "@/server/assets/types";

export type { AssetDetail } from "@/server/assets/types";

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
