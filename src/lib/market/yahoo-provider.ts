import "server-only";

import YahooFinance from "yahoo-finance2";
import { withOperationTimeout } from "@/lib/async/timeout";
import type {
  MarketDataProvider,
  MarketHistoricalBar,
  MarketHistoricalSeries,
  MarketHistoryRequest,
  MarketIntradayBar,
  MarketIntradayRequest,
  MarketIntradaySeries,
  MarketQuoteSnapshot
} from "@/lib/market/types";

const SOURCE = "yahoo-finance2";
const YAHOO_QUOTE_TIMEOUT_MS = 5000;
const YAHOO_HISTORY_TIMEOUT_MS = 8000;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function uniqueProviderSymbols(providerSymbols: string[]) {
  return Array.from(
    new Set(providerSymbols.map((providerSymbol) => providerSymbol.trim()).filter(Boolean))
  );
}

async function fetchLatestQuote(providerSymbol: string): Promise<MarketQuoteSnapshot | null> {
  try {
    const quote = await withOperationTimeout(
      yahooFinance.quote(providerSymbol, {
        fields: ["symbol", "currency", "regularMarketPrice", "regularMarketTime"]
      }),
      {
        label: `Yahoo quote ${providerSymbol}`,
        timeoutMs: YAHOO_QUOTE_TIMEOUT_MS
      }
    );
    const price = quote.regularMarketPrice;
    const currency = quote.currency;
    const asOf =
      quote.regularMarketTime instanceof Date ? quote.regularMarketTime.toISOString() : null;

    if (price == null || currency == null || asOf == null) {
      return null;
    }

    return {
      providerSymbol,
      price,
      currency,
      asOf,
      source: SOURCE
    };
  } catch (error) {
    console.error(`Latest quote fetch failed for ${providerSymbol}`, error);
    return null;
  }
}

async function fetchHistoricalPrices(
  providerSymbol: string,
  request: MarketHistoryRequest
): Promise<MarketHistoricalSeries | null> {
  try {
    const endDate = request.endDate ?? new Date().toISOString().slice(0, 10);
    const chart = await withOperationTimeout(
      yahooFinance.chart(providerSymbol, {
        period1: request.startDate,
        period2: endDate,
        interval: "1d",
        return: "array"
      }),
      {
        label: `Yahoo history ${providerSymbol}`,
        timeoutMs: YAHOO_HISTORY_TIMEOUT_MS
      }
    );

    const bars = chart.quotes
      .map<MarketHistoricalBar | null>((row) => {
        if (row.close == null) {
          return null;
        }

        return {
          date: toIsoDate(row.date),
          close: row.close
        };
      })
      .filter((bar): bar is MarketHistoricalBar => bar != null)
      .sort((left, right) => left.date.localeCompare(right.date));

    if (!chart.meta.currency || bars.length === 0) {
      return null;
    }

    return {
      providerSymbol,
      currency: chart.meta.currency,
      source: SOURCE,
      bars
    };
  } catch (error) {
    console.error(`Historical price fetch failed for ${providerSymbol}`, error);
    return null;
  }
}

async function fetchIntradayPrices(
  providerSymbol: string,
  request: MarketIntradayRequest
): Promise<MarketIntradaySeries | null> {
  try {
    const chart = await withOperationTimeout(
      yahooFinance.chart(providerSymbol, {
        period1: request.startAt,
        period2: request.endAt ?? new Date().toISOString(),
        interval: request.interval,
        return: "array"
      }),
      {
        label: `Yahoo intraday ${providerSymbol}`,
        timeoutMs: YAHOO_HISTORY_TIMEOUT_MS
      }
    );

    const bars = chart.quotes
      .map<MarketIntradayBar | null>((row) => {
        if (row.close == null) {
          return null;
        }

        return {
          observedAt: row.date.toISOString(),
          close: row.close
        };
      })
      .filter((bar): bar is MarketIntradayBar => bar != null)
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

    if (!chart.meta.currency || bars.length === 0) {
      return null;
    }

    return {
      providerSymbol,
      currency: chart.meta.currency,
      source: SOURCE,
      interval: request.interval,
      bars
    };
  } catch (error) {
    console.error(`Intraday price fetch failed for ${providerSymbol}`, error);
    return null;
  }
}

export const yahooProvider: MarketDataProvider = {
  source: SOURCE,
  async getLatestQuotes(providerSymbols) {
    const settledQuotes = await Promise.all(
      uniqueProviderSymbols(providerSymbols).map((providerSymbol) => fetchLatestQuote(providerSymbol))
    );

    return settledQuotes.filter((quote): quote is MarketQuoteSnapshot => quote != null);
  },
  async getHistoricalPrices(providerSymbol, request) {
    return fetchHistoricalPrices(providerSymbol, request);
  },
  async getIntradayPrices(providerSymbol, request) {
    return fetchIntradayPrices(providerSymbol, request);
  }
};
