import assert from "node:assert/strict";
import test from "node:test";
import { fetchMarketDataProviderPayloads } from "@/lib/market/provider-fetch";
import type { RefreshTarget } from "@/lib/market/refresh-context";
import type { MarketDataProvider, MarketIntradayInterval } from "@/lib/market/types";

function createTarget({
  historyStartDate,
  id,
  providerSymbol,
}: {
  historyStartDate: string | null;
  id: number;
  providerSymbol: string;
}): RefreshTarget {
  return {
    historyStartDate,
    instrument: {
      currency: "USD",
      createdAt: "2026-05-29 00:00:00",
      displayName: providerSymbol,
      drRatio: null,
      fxProviderSymbol: null,
      id,
      instrumentType: "EQUITY",
      isActive: true,
      market: "NASDAQ",
      providerSymbol,
      symbol: providerSymbol,
      underlyingCurrency: null,
      underlyingDisplayName: null,
      underlyingProviderSymbol: null,
      underlyingSymbol: null,
      updatedAt: "2026-05-29 00:00:00",
    },
  };
}

test("market provider fetch helper preserves quote, history, and intraday payload maps", async () => {
  const calls: string[] = [];
  const provider: MarketDataProvider = {
    source: "test",
    async getLatestQuotes(providerSymbols) {
      calls.push(`quotes:${providerSymbols.join(",")}`);
      return providerSymbols.map((providerSymbol, index) => ({
        asOf: `2026-05-29T0${index}:00:00.000Z`,
        currency: "USD",
        price: 100 + index,
        providerSymbol,
        source: "test",
      }));
    },
    async getHistoricalPrices(providerSymbol, request) {
      calls.push(`history:${providerSymbol}:${request.startDate}`);
      return providerSymbol === "MSFT"
        ? null
        : {
            bars: [{ close: 100, date: request.startDate }],
            currency: "USD",
            providerSymbol,
            source: "test",
          };
    },
    async getIntradayPrices(providerSymbol, request) {
      calls.push(`intraday:${providerSymbol}:${request.interval}`);
      return {
        bars: [{ close: 101, observedAt: request.startAt }],
        currency: "USD",
        interval: request.interval,
        providerSymbol,
        source: "test",
      };
    },
  };

  const result = await fetchMarketDataProviderPayloads({
    intradayWindows: [
      { interval: "5m" as MarketIntradayInterval, lookbackDays: 1 },
      { interval: "1h" as MarketIntradayInterval, lookbackDays: 5 },
    ],
    now: new Date("2026-05-29T12:00:00.000Z"),
    provider,
    targets: [
      createTarget({ historyStartDate: "2026-01-01", id: 1, providerSymbol: "AAPL" }),
      createTarget({ historyStartDate: null, id: 2, providerSymbol: "MSFT" }),
    ],
  });

  assert.deepEqual(calls, [
    "quotes:AAPL,MSFT",
    "history:AAPL:2026-01-01",
    "intraday:AAPL:5m",
    "intraday:AAPL:1h",
    "intraday:MSFT:5m",
    "intraday:MSFT:1h",
  ]);
  assert.equal(result.quoteByProviderSymbol.get("AAPL")?.price, 100);
  assert.equal(result.quoteByProviderSymbol.get("MSFT")?.price, 101);
  assert.equal(result.historyByInstrumentId.get(1)?.providerSymbol, "AAPL");
  assert.equal(result.historyByInstrumentId.has(2), false);
  assert.equal(result.intradayByInstrumentIdAndInterval.get("1:5m")?.providerSymbol, "AAPL");
  assert.equal(result.intradayByInstrumentIdAndInterval.get("2:1h")?.providerSymbol, "MSFT");
});
