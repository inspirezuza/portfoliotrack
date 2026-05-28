import assert from "node:assert/strict";
import test from "node:test";
import { classifyRefreshPayloads } from "@/lib/market/refresh-classification";
import type { RefreshTarget } from "@/lib/market/refresh-context";
import type {
  MarketHistoricalSeries,
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";

function target({
  currency = "USD",
  historyStartDate = "2026-01-01",
  id,
  providerSymbol,
  symbol,
}: {
  currency?: string;
  historyStartDate?: string | null;
  id: number;
  providerSymbol: string;
  symbol: string;
}): RefreshTarget {
  return {
    instrument: {
      id,
      currency,
      providerSymbol,
      symbol,
    } as RefreshTarget["instrument"],
    historyStartDate,
  };
}

function quote({
  currency = "USD",
  providerSymbol,
}: {
  currency?: string;
  providerSymbol: string;
}): MarketQuoteSnapshot {
  return {
    asOf: "2026-01-02T10:00:00.000Z",
    currency,
    price: 100,
    providerSymbol,
    source: "test",
  };
}

function history({
  currency = "USD",
  providerSymbol,
}: {
  currency?: string;
  providerSymbol: string;
}): MarketHistoricalSeries {
  return {
    bars: [{ close: 100, date: "2026-01-02" }],
    currency,
    providerSymbol,
    source: "test",
  };
}

function intraday({
  currency = "USD",
  interval,
  providerSymbol,
}: {
  currency?: string;
  interval: MarketIntradayInterval;
  providerSymbol: string;
}): MarketIntradaySeries {
  return {
    bars: [{ close: 101, observedAt: "2026-01-02T10:00:00.000Z" }],
    currency,
    interval,
    providerSymbol,
    source: "test",
  };
}

test("refresh classification preserves valid payloads and issue reasons", () => {
  const validTarget = target({ id: 1, providerSymbol: "AAPL", symbol: "AAPL" });
  const quoteMismatchTarget = target({ id: 2, providerSymbol: "MSFT", symbol: "MSFT" });
  const missingTarget = target({ id: 3, providerSymbol: "GOOG", symbol: "GOOG" });
  const historyMismatchTarget = target({ id: 4, providerSymbol: "NVDA", symbol: "NVDA" });
  const intradayMismatchTarget = target({ id: 5, providerSymbol: "TSLA", symbol: "TSLA" });
  const quoteByProviderSymbol = new Map([
    ["AAPL", quote({ providerSymbol: "AAPL" })],
    ["MSFT", quote({ currency: "THB", providerSymbol: "MSFT" })],
    ["NVDA", quote({ providerSymbol: "NVDA" })],
    ["TSLA", quote({ providerSymbol: "TSLA" })],
  ]);
  const historyByInstrumentId = new Map([
    [1, history({ providerSymbol: "AAPL" })],
    [4, history({ currency: "THB", providerSymbol: "NVDA" })],
    [5, history({ providerSymbol: "TSLA" })],
  ]);
  const intradayByInstrumentIdAndInterval = new Map([
    ["1:5m", intraday({ interval: "5m", providerSymbol: "AAPL" })],
    ["1:1h", intraday({ interval: "1h", providerSymbol: "AAPL" })],
    ["4:5m", intraday({ interval: "5m", providerSymbol: "NVDA" })],
    ["4:1h", intraday({ interval: "1h", providerSymbol: "NVDA" })],
    ["5:5m", intraday({ interval: "5m", providerSymbol: "TSLA" })],
    ["5:1h", intraday({ currency: "THB", interval: "1h", providerSymbol: "TSLA" })],
  ]);

  const result = classifyRefreshPayloads({
    historyByInstrumentId,
    intradayByInstrumentIdAndInterval,
    intradayWindows: [{ interval: "5m" }, { interval: "1h" }],
    quoteByProviderSymbol,
    targets: [
      validTarget,
      quoteMismatchTarget,
      missingTarget,
      historyMismatchTarget,
      intradayMismatchTarget,
    ],
  });

  assert.equal(result.validQuotes.get(1)?.providerSymbol, "AAPL");
  assert.equal(result.validQuotes.has(2), false);
  assert.equal(result.validHistories.get(1)?.providerSymbol, "AAPL");
  assert.equal(result.validHistories.has(4), false);
  assert.equal(result.validIntradaySeries.get("1:5m")?.series.providerSymbol, "AAPL");
  assert.equal(result.validIntradaySeries.has("5:1h"), false);
  assert.deepEqual(result.issues, [
    { symbol: "MSFT", providerSymbol: "MSFT", reason: "quote_currency_mismatch" },
    { symbol: "MSFT", providerSymbol: "MSFT", reason: "missing_intraday" },
    { symbol: "MSFT", providerSymbol: "MSFT", reason: "missing_intraday" },
    { symbol: "MSFT", providerSymbol: "MSFT", reason: "missing_history" },
    { symbol: "GOOG", providerSymbol: "GOOG", reason: "missing_quote" },
    { symbol: "GOOG", providerSymbol: "GOOG", reason: "missing_intraday" },
    { symbol: "GOOG", providerSymbol: "GOOG", reason: "missing_intraday" },
    { symbol: "GOOG", providerSymbol: "GOOG", reason: "missing_history" },
    { symbol: "NVDA", providerSymbol: "NVDA", reason: "history_currency_mismatch" },
    { symbol: "TSLA", providerSymbol: "TSLA", reason: "intraday_currency_mismatch" },
  ]);
});
