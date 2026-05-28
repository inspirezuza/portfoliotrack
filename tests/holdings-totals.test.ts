import assert from "node:assert/strict";
import test from "node:test";
import { buildHoldingsSnapshotTotals } from "../src/server/holdings/totals";
import type { CurrencyBreakdown, HoldingRow, RealizedBreakdown } from "../src/server/holdings";
import type { PriceSnapshot } from "../src/lib/db/schema";

function createHolding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    averageCost: 10,
    currency: "USD",
    displayName: "Apple Inc.",
    drRatio: null,
    fxRateToValuationCurrency: 35,
    instrumentId: 1,
    instrumentType: "EQUITY",
    lastPrice: 12,
    lastPriceAsOf: "2026-05-29T10:00:00.000Z",
    lastPriceCurrency: "USD",
    lastPriceSource: "manual",
    lots: [],
    market: "NASDAQ",
    marketValue: 120,
    marketValueInValuationCurrency: 4200,
    oneDayGain: 2,
    oneDayGainInValuationCurrency: 70,
    oneDayGainPercent: 0.02,
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
    totalCostInValuationCurrency: 3500,
    totalFees: 0,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    underlyingSymbol: null,
    unrealizedPnl: 20,
    unrealizedPnlInValuationCurrency: 700,
    unrealizedPnlPercent: 0.2,
    valuationCurrency: "THB",
    ...overrides,
  };
}

function createCurrencyBreakdown(overrides: Partial<CurrencyBreakdown> = {}): CurrencyBreakdown {
  return {
    awaitingPriceSymbols: [],
    currency: "USD",
    missingPricePositionCount: 0,
    openPositionCount: 1,
    pricedPositionCount: 1,
    totalCostBasis: 100,
    totalFees: 0,
    totalMarketValue: 120,
    totalRealizedPnl: 0,
    totalUnrealizedPnl: 20,
    ...overrides,
  };
}

function createRealizedBreakdown(overrides: Partial<RealizedBreakdown> = {}): RealizedBreakdown {
  return {
    currency: "USD",
    totalFees: 1,
    totalRealizedPnl: 5,
    ...overrides,
  };
}

function createFxSnapshot(price: number): PriceSnapshot {
  return {
    asOf: "2026-05-29T10:00:00.000Z",
    createdAt: "2026-05-29T10:00:00.000Z",
    currency: "THB",
    id: 1,
    instrumentId: 1,
    price,
    source: "manual",
  };
}

test("holdings totals preserve single-currency totals and market-value weights", () => {
  const holding = createHolding({
    currency: "USD",
    marketValue: 120,
    marketValueInValuationCurrency: null,
    totalCostInValuationCurrency: null,
    unrealizedPnlInValuationCurrency: null,
  });
  const totals = buildHoldingsSnapshotTotals({
    currencyBreakdown: [createCurrencyBreakdown()],
    fxSnapshotsByProviderSymbol: new Map(),
    holdings: [holding],
    positionCount: 1,
    realizedBreakdown: [createRealizedBreakdown()],
    valuationCurrency: "THB",
  });

  assert.equal(totals.openPositionCurrency, "USD");
  assert.equal(totals.totalCostBasis, 100);
  assert.equal(totals.totalMarketValue, 120);
  assert.equal(totals.totalRealizedPnl, 5);
  assert.equal(totals.totalFees, 1);
  assert.equal(totals.totalUnrealizedPnl, 20);
  assert.equal(totals.holdingsWithWeights[0]?.portfolioWeight, 1);
});

test("holdings totals convert mixed realized values and valuation weights", () => {
  const usdHolding = createHolding({
    currency: "USD",
    instrumentId: 1,
    marketValueInValuationCurrency: 4200,
    symbol: "AAPL",
    totalCostInValuationCurrency: 3500,
    unrealizedPnlInValuationCurrency: 700,
  });
  const thbHolding = createHolding({
    currency: "THB",
    fxRateToValuationCurrency: 1,
    instrumentId: 2,
    marketValue: 2800,
    marketValueInValuationCurrency: 2800,
    symbol: "BAY",
    totalCost: 2500,
    totalCostInValuationCurrency: 2500,
    unrealizedPnl: 300,
    unrealizedPnlInValuationCurrency: 300,
  });
  const totals = buildHoldingsSnapshotTotals({
    currencyBreakdown: [
      createCurrencyBreakdown({ currency: "THB", totalCostBasis: 2500, totalMarketValue: 2800 }),
      createCurrencyBreakdown({ currency: "USD", totalCostBasis: 100, totalMarketValue: 120 }),
    ],
    fxSnapshotsByProviderSymbol: new Map([["USDTHB=X", createFxSnapshot(35)]]),
    holdings: [usdHolding, thbHolding],
    positionCount: 2,
    realizedBreakdown: [
      createRealizedBreakdown({ currency: "THB", totalFees: 2, totalRealizedPnl: 10 }),
      createRealizedBreakdown({ currency: "USD", totalFees: 1, totalRealizedPnl: 5 }),
    ],
    valuationCurrency: "THB",
  });

  assert.equal(totals.openPositionCurrency, "THB");
  assert.equal(totals.totalCostBasis, 6000);
  assert.equal(totals.totalMarketValue, 7000);
  assert.equal(totals.totalUnrealizedPnl, 1000);
  assert.equal(totals.totalRealizedPnl, 185);
  assert.equal(totals.totalFees, 37);
  assert.equal(totals.holdingsWithWeights[0]?.portfolioWeight, 0.6);
  assert.equal(totals.holdingsWithWeights[1]?.portfolioWeight, 0.4);
});

test("holdings totals preserve nulls when valuation or FX coverage is incomplete", () => {
  const totals = buildHoldingsSnapshotTotals({
    currencyBreakdown: [
      createCurrencyBreakdown({ currency: "THB", totalMarketValue: 2800 }),
      createCurrencyBreakdown({ currency: "USD", totalMarketValue: 120 }),
    ],
    fxSnapshotsByProviderSymbol: new Map(),
    holdings: [
      createHolding({ currency: "USD", marketValueInValuationCurrency: null }),
      createHolding({ currency: "THB", instrumentId: 2, marketValueInValuationCurrency: 2800 }),
    ],
    positionCount: 2,
    realizedBreakdown: [
      createRealizedBreakdown({ currency: "THB" }),
      createRealizedBreakdown({ currency: "USD" }),
    ],
    valuationCurrency: "THB",
  });

  assert.equal(totals.totalCostBasis, null);
  assert.equal(totals.totalMarketValue, null);
  assert.equal(totals.totalUnrealizedPnl, null);
  assert.equal(totals.totalRealizedPnl, null);
  assert.equal(totals.totalFees, null);
  assert.equal(totals.holdingsWithWeights[0]?.portfolioWeight, null);
});
