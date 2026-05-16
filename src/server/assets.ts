import "server-only";

import { asc, eq } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
import {
  historicalPrices,
  instruments,
  priceSnapshots,
  transactions,
  type HistoricalPrice,
  type Instrument,
  type PriceSnapshot,
  type Transaction
} from "@/lib/db/schema";
import { getMarketDataProvider, getMarketSettings, getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider";
import { calculatePositionForInstrument } from "@/lib/portfolio/positions";
import { toChronologicalPositionTransaction } from "@/server/transactions";

type AssetHistoryRefreshResult = {
  attempted: boolean;
  historyIssue: string | null;
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
const historyRefreshCooldownByInstrumentId = new Map<number, AssetHistoryCooldownState>();

export type AssetPricePoint = {
  date: string;
  close: number;
};

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
};

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function subtractUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() - days);
  return nextDate;
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getHistoryStartDate(firstTradeDate: string | null) {
  if (firstTradeDate != null) {
    return firstTradeDate;
  }

  return toIsoDate(subtractUtcDays(new Date(), 365));
}

function getProviderHistoryUrl(providerSymbol: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(providerSymbol)}/history`;
}

function quoteMatchesInstrumentCurrency(
  snapshot: PriceSnapshot | null,
  instrument: Instrument
): snapshot is PriceSnapshot {
  return snapshot != null && snapshot.currency === instrument.currency;
}

function filterMatchingHistoryRows(rows: HistoricalPrice[], instrument: Instrument) {
  return rows
    .filter((row) => row.currency === instrument.currency)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

function getHistoryStatus({
  requestedHistoryStartDate,
  firstHistoryDate,
  historyCount
}: {
  requestedHistoryStartDate: string | null;
  firstHistoryDate: string | null;
  historyCount: number;
}): AssetDetail["marketData"]["historyStatus"] {
  if (historyCount === 0) {
    return "unavailable";
  }

  if (
    requestedHistoryStartDate != null &&
    firstHistoryDate != null &&
    firstHistoryDate > requestedHistoryStartDate
  ) {
    return "partial";
  }

  return "full";
}

async function refreshAssetQuote({
  instrument
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
    db.insert(priceSnapshots)
      .values({
        instrumentId: instrument.id,
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

  return {
    attempted: true,
    quoteIssue
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
    retryAfter: now + HISTORY_REFRESH_FAILURE_COOLDOWN_MS
  });
}

function clearHistoryRefreshCooldown(instrumentId: number) {
  historyRefreshCooldownByInstrumentId.delete(instrumentId);
}

async function refreshAssetHistory({
  instrument,
  historyStartDate
}: {
  instrument: Instrument;
  historyStartDate: string;
}): Promise<AssetHistoryRefreshResult> {
  const provider = getMarketDataProvider();
  const history = await provider.getHistoricalPrices(instrument.providerSymbol, {
    startDate: historyStartDate
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
      historyIssue
    };
  }

  const validHistory = history!;

  db.transaction((tx) => {
    for (const bar of validHistory.bars) {
      tx.insert(historicalPrices)
        .values({
          instrumentId: instrument.id,
          priceDate: bar.date,
          close: bar.close,
          currency: validHistory.currency,
          source: validHistory.source
        })
        .onConflictDoUpdate({
          target: [historicalPrices.instrumentId, historicalPrices.priceDate],
          set: {
            close: bar.close,
            currency: validHistory.currency,
            source: validHistory.source
          }
        })
        .run();
    }
  });

  clearHistoryRefreshCooldown(instrument.id);

  return {
    attempted: true,
    historyIssue: null
  };
}

async function getAssetRows(symbol: string) {
  const instrument = await db.select().from(instruments).where(eq(instruments.symbol, symbol)).get();

  if (instrument == null) {
    return null;
  }

  const [transactionRows, snapshot, historyRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.instrumentId, instrument.id))
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
      .all(),
    db.select().from(priceSnapshots).where(eq(priceSnapshots.instrumentId, instrument.id)).get(),
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrument.id)).all()
  ]);

  return {
    instrument,
    transactionRows,
    snapshot,
    historyRows
  };
}

export async function getAssetDetail(symbol: string): Promise<AssetDetail | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const initialRows = await getAssetRows(normalizedSymbol);

  if (initialRows == null) {
    return null;
  }

  const { instrument, transactionRows } = initialRows;
  const asOfDate = getCurrentLocalIsoDate();
  const currentTransactionRows = transactionRows.filter((row) => row.tradeDate <= asOfDate);
  const marketSettings = await getMarketSettings();
  const firstTradeDate = currentTransactionRows[0]?.tradeDate ?? null;
  const requestedHistoryStartDate = getHistoryStartDate(firstTradeDate);
  const initialSnapshot = initialRows.snapshot ?? null;
  const matchingInitialSnapshot = quoteMatchesInstrumentCurrency(initialSnapshot, instrument)
    ? initialSnapshot
    : null;
  const matchingInitialHistory = filterMatchingHistoryRows(initialRows.historyRows, instrument);
  const shouldRefreshQuote =
    matchingInitialSnapshot == null ||
    isMarketDataStale(matchingInitialSnapshot.asOf, marketSettings.marketRefreshMinutes);
  const historyCooldownState = getHistoryCooldownState(instrument.id);
  const shouldRefreshHistory =
    matchingInitialHistory.length === 0 && historyCooldownState == null;

  const [quoteRefreshResult, historyRefreshResult] = await Promise.all([
    shouldRefreshQuote
      ? refreshAssetQuote({
          instrument
        })
      : Promise.resolve({
          attempted: false,
          quoteIssue: null
        } satisfies AssetQuoteRefreshResult),
    shouldRefreshHistory
      ? refreshAssetHistory({
          instrument,
          historyStartDate: requestedHistoryStartDate
        })
      : Promise.resolve({
          attempted: false,
          historyIssue: historyCooldownState?.issue ?? null
        } satisfies AssetHistoryRefreshResult)
  ]);
  const didRefreshAnyMarketData = quoteRefreshResult.attempted || historyRefreshResult.attempted;
  const latestRows = didRefreshAnyMarketData ? await getAssetRows(normalizedSymbol) : initialRows;

  if (latestRows == null) {
    return null;
  }

  const position = calculatePositionForInstrument(
    currentTransactionRows.map((row) => toChronologicalPositionTransaction(row as Transaction))
  );
  const latestSnapshot = latestRows.snapshot ?? null;
  const matchingSnapshot = quoteMatchesInstrumentCurrency(latestSnapshot, instrument)
    ? latestSnapshot
    : null;
  const matchingHistory = filterMatchingHistoryRows(latestRows.historyRows, instrument);
  const lastPrice = matchingSnapshot?.price ?? null;
  const hasOpenPosition = position.quantity > 0;
  const marketValue =
    hasOpenPosition && lastPrice != null ? normalizeMoney(position.quantity * lastPrice) : null;
  const unrealizedPnl =
    marketValue != null ? normalizeMoney(marketValue - position.totalCost) : null;
  const firstHistoryDate = matchingHistory[0]?.priceDate ?? null;
  const latestHistoryDate = matchingHistory[matchingHistory.length - 1]?.priceDate ?? null;
  const historyStatus = getHistoryStatus({
    requestedHistoryStartDate,
    firstHistoryDate,
    historyCount: matchingHistory.length
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
      isActive: instrument.isActive
    },
    position: {
      quantity: position.quantity,
      averageCost: hasOpenPosition ? position.averageCost : null,
      totalCost: hasOpenPosition ? position.totalCost : null,
      realizedPnl: position.realizedPnl,
      totalFees: position.totalFees,
      marketValue,
      unrealizedPnl,
      hasOpenPosition,
      tradeCount: currentTransactionRows.length,
      firstTradeDate,
      lastTradeDate: currentTransactionRows[currentTransactionRows.length - 1]?.tradeDate ?? null
    },
    marketData: {
      lastPrice,
      lastPriceAsOf: matchingSnapshot?.asOf ?? null,
      lastPriceSource: matchingSnapshot?.source ?? null,
      priceAgeMinutes: getPriceAgeMinutes(matchingSnapshot?.asOf ?? null),
      isPriceDataStale: isMarketDataStale(
        matchingSnapshot?.asOf ?? null,
        marketSettings.marketRefreshMinutes
      ),
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      latestHistoryDate,
      firstHistoryDate,
      historySource: matchingHistory[0]?.source ?? null,
      historyStatus,
      historyUnavailableReason:
        matchingHistory.length > 0
          ? null
          : historyRefreshResult.historyIssue ??
            "No cached daily price history is available for this symbol yet.",
      requestedHistoryStartDate,
      priceHistory: matchingHistory.map((row) => ({
        date: row.priceDate,
        close: row.close
      }))
    }
  };
}
