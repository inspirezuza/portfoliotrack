import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPerformanceSummary,
  getCurrentLocalIsoDate,
} from "../src/server/dashboard/performance-summary";
import type { HoldingsSnapshot } from "../src/server/holdings";

function createHoldingsSnapshot(overrides: Partial<HoldingsSnapshot> = {}): HoldingsSnapshot {
  return {
    awaitingPriceSymbols: [],
    closedPositionCount: 0,
    currencyBreakdown: [],
    holdings: [],
    isPriceDataStale: false,
    latestPriceAsOf: null,
    marketRefreshMinutes: 15,
    missingPricePositionCount: 0,
    openPositionCount: 1,
    openPositionCurrency: "USD",
    priceAgeMinutes: null,
    pricedPositionCount: 1,
    realizedBreakdown: [],
    totalCostBasis: 100,
    totalFees: 0,
    totalMarketValue: 130,
    totalRealizedPnl: 5,
    totalUnrealizedPnl: 25,
    valuationCurrency: "USD",
    ...overrides,
  };
}

test("dashboard performance summary calculates net invested and absolute return", () => {
  const summary = buildPerformanceSummary({
    holdingsSnapshot: createHoldingsSnapshot(),
    instrumentRows: [
      { id: 1, currency: "USD" },
      { id: 2, currency: "USD" },
    ],
    transactionRows: [
      { instrumentId: 1, tradeDate: "2026-01-01", side: "BUY", quantity: 10, price: 10, fee: 1 },
      { instrumentId: 2, tradeDate: "2026-02-01", side: "SELL", quantity: 2, price: 12, fee: 0.5 },
      { instrumentId: 1, tradeDate: "2999-01-01", side: "BUY", quantity: 99, price: 99, fee: 99 },
    ],
    today: "2026-05-28",
  });

  assert.deepEqual(summary, {
    status: "ready",
    currency: "USD",
    totalPnl: 30,
    netInvested: 77.5,
    absoluteReturn: 30 / 77.5,
  });
});

test("dashboard performance summary preserves unavailable statuses", () => {
  const baseArgs = {
    holdingsSnapshot: createHoldingsSnapshot(),
    instrumentRows: [{ id: 1, currency: "USD" }],
    today: "2026-05-28",
  };

  assert.equal(
    buildPerformanceSummary({
      ...baseArgs,
      transactionRows: [],
    }).status,
    "no-transactions",
  );
  assert.equal(
    buildPerformanceSummary({
      ...baseArgs,
      instrumentRows: [
        { id: 1, currency: "USD" },
        { id: 2, currency: "THB" },
      ],
      transactionRows: [
        { instrumentId: 1, tradeDate: "2026-01-01", side: "BUY", quantity: 1, price: 1, fee: 0 },
        { instrumentId: 2, tradeDate: "2026-01-01", side: "BUY", quantity: 1, price: 1, fee: 0 },
      ],
    }).status,
    "mixed-currency",
  );
  assert.equal(
    buildPerformanceSummary({
      ...baseArgs,
      holdingsSnapshot: createHoldingsSnapshot({ totalUnrealizedPnl: null }),
      transactionRows: [
        { instrumentId: 1, tradeDate: "2026-01-01", side: "BUY", quantity: 1, price: 1, fee: 0 },
      ],
    }).status,
    "missing-market-value",
  );
  assert.equal(
    buildPerformanceSummary({
      ...baseArgs,
      transactionRows: [
        { instrumentId: 1, tradeDate: "2026-01-01", side: "SELL", quantity: 1, price: 1, fee: 0 },
      ],
    }).status,
    "no-positive-net-invested",
  );
});

test("dashboard performance summary local date helper uses local calendar date", () => {
  assert.equal(getCurrentLocalIsoDate(new Date(2026, 4, 28, 23, 59, 59)), "2026-05-28");
});
