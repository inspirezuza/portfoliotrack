import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_HISTORY_START_DATE,
  BENCHMARK_WATCHLIST,
  DEFAULT_BENCHMARK_SYMBOL,
} from "@/lib/market/benchmark-watchlist";

test("benchmark watchlist preserves default symbol ordering and provider symbols", () => {
  assert.equal(DEFAULT_BENCHMARK_SYMBOL, "SPYM");
  assert.equal(BENCHMARK_HISTORY_START_DATE, "2020-01-01");
  assert.deepEqual(
    BENCHMARK_WATCHLIST.map((benchmark) => [
      benchmark.symbol,
      benchmark.providerSymbol,
      benchmark.currency,
      benchmark.instrumentType,
    ]),
    [
      ["SPYM", "SPYM", "USD", "ETF"],
      ["QQQ", "QQQ", "USD", "ETF"],
      ["TDEX", "TDEX.BK", "THB", "ETF"],
      ["NVDA", "NVDA", "USD", "STOCK"],
      ["GOOGL", "GOOGL", "USD", "STOCK"],
    ],
  );
});
