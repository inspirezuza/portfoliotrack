import "server-only";

import { OperationTimeoutError, withOperationTimeout } from "@/lib/async/timeout";
import { db } from "@/lib/db/runtime";
import { historicalPrices, intradayPrices, priceSnapshots, type Instrument } from "@/lib/db/schema";
import { getMarketDataProvider } from "@/lib/market/provider";
import type { MarketIntradayInterval, MarketIntradaySeries } from "@/lib/market/types";
import { getAssetIntradayStartAt } from "@/server/assets/history";

export type AssetHistoryRefreshResult = {
  attempted: boolean;
  historyIssue: string | null;
};

export type AssetIntradayRefreshResult = {
  attempted: boolean;
  intradayIssue: string | null;
};

export type AssetQuoteRefreshResult = {
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

export async function runAssetMarketRefreshBestEffort<T>({
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

export async function refreshAssetQuote({
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

export function getHistoryCooldownState(instrumentId: number, now = Date.now()) {
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

export async function refreshAssetHistory({
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

export async function refreshAssetIntraday({
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
