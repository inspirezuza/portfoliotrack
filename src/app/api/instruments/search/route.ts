import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import YahooFinance from "yahoo-finance2";
import { withOperationTimeout } from "@/lib/async/timeout";
import { getInstrumentTypeFromYahooQuoteType } from "@/lib/instruments/instrument-types";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});
const INSTRUMENT_SEARCH_TIMEOUT_MS = 5000;
const INSTRUMENT_QUOTE_TIMEOUT_MS = 4000;
const INSTRUMENT_SEARCH_CACHE_TTL_MS = 60_000;
const INSTRUMENT_SEARCH_CACHE_MAX_SIZE = 100;
const INSTRUMENT_QUOTE_LIMIT = 6;

type SearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
  score?: number;
};

type InstrumentSearchResult = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
  exchangeName: string | null;
  score: number;
};

const instrumentSearchCache = new Map<string, {
  expiresAt: number;
  results: InstrumentSearchResult[];
}>();

function normalizeSearchQuery(query: string) {
  return query.trim();
}

function getSearchQueries(query: string) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const queries = [normalizedQuery];

  if (/^[a-z0-9]+$/i.test(normalizedQuery) && !normalizedQuery.toUpperCase().endsWith(".BK")) {
    queries.push(`${normalizedQuery}.BK`);
  }

  return queries;
}

function getDisplaySymbol(providerSymbol: string) {
  return providerSymbol.toUpperCase().endsWith(".BK") ? providerSymbol.slice(0, -3) : providerSymbol;
}

function getMarket(providerSymbol: string, exchange?: string, market?: string) {
  if (providerSymbol.toUpperCase().endsWith(".BK") || exchange === "SET" || market === "th_market") {
    return "TH";
  }

  if (market === "us_market" || ["ASE", "NCM", "NGM", "NMS", "NYQ", "PCX"].includes(exchange ?? "")) {
    return "US";
  }

  return exchange ?? "OTHER";
}

function getCachedSearchResults(query: string, now = Date.now()) {
  const cacheKey = query.toLowerCase();
  const cached = instrumentSearchCache.get(cacheKey);

  if (cached == null) {
    return null;
  }

  if (cached.expiresAt <= now) {
    instrumentSearchCache.delete(cacheKey);
    return null;
  }

  return cached.results;
}

function setCachedSearchResults(query: string, results: InstrumentSearchResult[], now = Date.now()) {
  if (instrumentSearchCache.size >= INSTRUMENT_SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = instrumentSearchCache.keys().next().value;

    if (typeof oldestKey === "string") {
      instrumentSearchCache.delete(oldestKey);
    }
  }

  instrumentSearchCache.set(query.toLowerCase(), {
    expiresAt: now + INSTRUMENT_SEARCH_CACHE_TTL_MS,
    results
  });
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      {
        error: {
          code: "ADMIN_REQUIRED",
          message: "Admin login is required to search instruments."
        },
        results: []
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeSearchQuery(searchParams.get("query") ?? "");

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const cachedResults = getCachedSearchResults(query);

  if (cachedResults != null) {
    return NextResponse.json({ results: cachedResults });
  }

  try {
    const quotesBySymbol = new Map<string, SearchQuote>();

    for (const searchQuery of getSearchQueries(query)) {
      const results = await withOperationTimeout(
        yahooFinance.search(searchQuery, {
          enableFuzzyQuery: true,
          enableCb: false,
          enableNavLinks: false,
          newsCount: 0,
          quotesCount: 8
        }),
        {
          label: `Yahoo instrument search ${searchQuery}`,
          timeoutMs: INSTRUMENT_SEARCH_TIMEOUT_MS
        }
      );

      for (const quote of results.quotes) {
        if (!quote.isYahooFinance || typeof quote.symbol !== "string") {
          continue;
        }

        quotesBySymbol.set(quote.symbol, quote);
      }
    }

    const quoteRows = await Promise.all(
      Array.from(quotesBySymbol.values())
        .slice(0, INSTRUMENT_QUOTE_LIMIT)
        .map(async (searchQuote) => {
          try {
            const quote = await withOperationTimeout(
              yahooFinance.quote(searchQuote.symbol ?? "", {
                fields: ["symbol", "currency", "exchange", "market", "quoteType", "shortName", "longName"]
              }),
              {
                label: `Yahoo instrument quote ${searchQuote.symbol ?? ""}`,
                timeoutMs: INSTRUMENT_QUOTE_TIMEOUT_MS
              }
            );

            if (!quote.symbol || !quote.currency) {
              return null;
            }

            const displayName =
              quote.longName ?? quote.shortName ?? searchQuote.longname ?? searchQuote.shortname ?? quote.symbol;

            const symbol = getDisplaySymbol(quote.symbol);
            const knownDrMetadata = getKnownDrMetadata({
              symbol,
              providerSymbol: quote.symbol
            });

            return {
              symbol,
              displayName,
              market: getMarket(quote.symbol, quote.exchange, quote.market),
              instrumentType:
                knownDrMetadata?.instrumentType ??
                getInstrumentTypeFromYahooQuoteType(quote.quoteType ?? searchQuote.quoteType),
              currency: quote.currency,
              providerSymbol: quote.symbol,
              exchangeName: searchQuote.exchDisp ?? quote.exchange ?? null,
              score: searchQuote.score ?? 0
            };
          } catch {
            return null;
          }
        })
    );

    const results = quoteRows
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);

    setCachedSearchResults(query, results);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Instrument search failed", error);

    return NextResponse.json(
      {
        error: {
          code: "INSTRUMENT_SEARCH_FAILED",
          message: "Instrument search is unavailable right now."
        },
        results: []
      },
      { status: 500 }
    );
  }
}
