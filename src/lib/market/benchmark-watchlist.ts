import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/runtime-core";
import { instruments } from "@/lib/db/schema";

export const DEFAULT_BENCHMARK_SYMBOL = "SPYM";
export const DEFAULT_BASE_CURRENCY = "THB";
export const DEFAULT_MARKET_REFRESH_MINUTES = 30;
export const DEFAULT_AUTO_REFRESH_TIMEOUT_MS = 3500;
export const BENCHMARK_HISTORY_START_DATE = "2020-01-01";

export const BENCHMARK_WATCHLIST = [
  {
    symbol: "SPYM",
    displayName: "State Street SPDR Portfolio S&P 500 ETF",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "SPYM",
  },
  {
    symbol: "QQQ",
    displayName: "Invesco QQQ Trust",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "QQQ",
  },
  {
    symbol: "TDEX",
    displayName: "ThaiDEX SET50 ETF",
    market: "TH",
    instrumentType: "ETF",
    currency: "THB",
    providerSymbol: "TDEX.BK",
  },
  {
    symbol: "NVDA",
    displayName: "NVIDIA Corporation",
    market: "US",
    instrumentType: "STOCK",
    currency: "USD",
    providerSymbol: "NVDA",
  },
  {
    symbol: "GOOGL",
    displayName: "Alphabet Inc.",
    market: "US",
    instrumentType: "STOCK",
    currency: "USD",
    providerSymbol: "GOOGL",
  },
] as const;

type BenchmarkWatchlistEntry = (typeof BENCHMARK_WATCHLIST)[number];

/**
 * Returns the watchlist benchmarks whose symbols are not already present in the
 * supplied instrument symbols. Lets callers that have already loaded the
 * instrument list decide whether a seed INSERT is needed without issuing an
 * extra SELECT.
 */
export function getMissingBenchmarkWatchlistInstruments(
  existingSymbols: Iterable<string>,
): BenchmarkWatchlistEntry[] {
  const present = existingSymbols instanceof Set ? existingSymbols : new Set(existingSymbols);

  return BENCHMARK_WATCHLIST.filter((benchmark) => !present.has(benchmark.symbol));
}

export async function insertBenchmarkWatchlistInstruments(
  missingBenchmarks: readonly BenchmarkWatchlistEntry[],
) {
  if (missingBenchmarks.length === 0) {
    return;
  }

  await db
    .insert(instruments)
    .values(
      missingBenchmarks.map((benchmark) => ({
        ...benchmark,
        isActive: true,
      })),
    )
    .onConflictDoNothing();
}

export async function ensureBenchmarkWatchlistInstruments() {
  const benchmarkSymbols = BENCHMARK_WATCHLIST.map((benchmark) => benchmark.symbol);
  const existingRows = await db
    .select({ symbol: instruments.symbol })
    .from(instruments)
    .where(inArray(instruments.symbol, benchmarkSymbols));

  await insertBenchmarkWatchlistInstruments(
    getMissingBenchmarkWatchlistInstruments(existingRows.map((instrument) => instrument.symbol)),
  );
}
