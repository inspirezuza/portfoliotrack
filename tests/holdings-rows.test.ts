import assert from "node:assert/strict";
import test from "node:test";
import { compareHoldingRows } from "@/server/holdings/rows";
import type { HoldingRow } from "@/server/holdings";

function createHolding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    averageCost: 10,
    currency: "USD",
    displayName: "Apple Inc.",
    drRatio: null,
    fxRateToValuationCurrency: 1,
    instrumentId: 1,
    instrumentType: "COMMON_STOCK",
    lastPrice: 12,
    lastPriceAsOf: "2026-05-28T10:00:00.000Z",
    lastPriceCurrency: "USD",
    lastPriceSource: "manual",
    lots: [],
    market: "NASDAQ",
    marketValue: 120,
    marketValueInValuationCurrency: 120,
    oneDayGain: null,
    oneDayGainInValuationCurrency: null,
    oneDayGainPercent: null,
    parentAverageCost: null,
    parentLastPrice: null,
    parentLastPriceAsOf: null,
    performance: {} as HoldingRow["performance"],
    portfolioWeight: null,
    providerSymbol: "AAPL",
    quantity: 10,
    realizedPnl: 0,
    symbol: "AAPL",
    totalCost: 100,
    totalCostInValuationCurrency: 100,
    totalFees: 0,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    underlyingSymbol: null,
    unrealizedPnl: 20,
    unrealizedPnlInValuationCurrency: 20,
    unrealizedPnlPercent: 0.2,
    valuationCurrency: "USD",
    ...overrides,
  };
}

test("holding row comparator preserves currency, symbol, priced, and display ordering", () => {
  const rows = [
    createHolding({ currency: "USD", displayName: "Beta", marketValue: null, symbol: "MSFT" }),
    createHolding({ currency: "THB", displayName: "Thai Fund", symbol: "TDEX" }),
    createHolding({ currency: "USD", displayName: "Alpha", marketValue: 10, symbol: "MSFT" }),
    createHolding({ currency: "USD", displayName: "Apple", marketValue: 20, symbol: "AAPL" }),
  ];

  assert.deepEqual(
    rows.sort(compareHoldingRows).map((row) => row.displayName),
    ["Thai Fund", "Apple", "Alpha", "Beta"],
  );
});
