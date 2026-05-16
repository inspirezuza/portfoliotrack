import "server-only";

import YahooFinance from "yahoo-finance2";
import type {
  MarketDataProvider,
  MarketHistoricalBar,
  MarketHistoricalSeries,
  MarketHistoryRequest,
  MarketQuoteSnapshot
} from "@/lib/market/types";

const SOURCE = "yahoo-finance2";

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
    const quote = await yahooFinance.quote(providerSymbol, {
      fields: ["symbol", "currency", "regularMarketPrice", "regularMarketTime"]
    });
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
    const chart = await yahooFinance.chart(providerSymbol, {
      period1: request.startDate,
      period2: endDate,
      interval: "1d",
      return: "array"
    });

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
  }
};
