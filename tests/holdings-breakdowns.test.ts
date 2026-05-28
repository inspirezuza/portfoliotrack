import assert from "node:assert/strict";
import test from "node:test";
import { buildCurrencyBreakdown, buildRealizedBreakdown } from "@/server/holdings/breakdowns";

test("holdings currency breakdown preserves null totals for missing prices", () => {
  const breakdown = buildCurrencyBreakdown([
    {
      currency: "USD",
      marketValue: 120,
      realizedPnl: 5,
      symbol: "AAPL",
      totalCost: 100,
      totalFees: 1,
      unrealizedPnl: 20,
    },
    {
      currency: "THB",
      marketValue: null,
      realizedPnl: 3,
      symbol: "AAPL80",
      totalCost: 200,
      totalFees: 2,
      unrealizedPnl: null,
    },
    {
      currency: "THB",
      marketValue: 90,
      realizedPnl: -1,
      symbol: "NVDA80",
      totalCost: 80,
      totalFees: 0.5,
      unrealizedPnl: 10,
    },
  ]);

  assert.deepEqual(breakdown, [
    {
      currency: "THB",
      awaitingPriceSymbols: ["AAPL80"],
      missingPricePositionCount: 1,
      openPositionCount: 2,
      pricedPositionCount: 1,
      totalCostBasis: 280,
      totalFees: 0,
      totalMarketValue: null,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: null,
    },
    {
      currency: "USD",
      awaitingPriceSymbols: [],
      missingPricePositionCount: 0,
      openPositionCount: 1,
      pricedPositionCount: 1,
      totalCostBasis: 100,
      totalFees: 0,
      totalMarketValue: 120,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 20,
    },
  ]);
});

test("holdings realized breakdown aggregates by instrument currency", () => {
  const breakdown = buildRealizedBreakdown({
    instrumentCurrencyById: new Map([
      [1, "USD"],
      [2, "THB"],
      [3, "USD"],
    ]),
    positions: [
      { instrumentId: 1, realizedPnl: 5, totalFees: 1 },
      { instrumentId: 2, realizedPnl: -2, totalFees: 0.5 },
      { instrumentId: 3, realizedPnl: 1.25, totalFees: 0.75 },
      { instrumentId: 99, realizedPnl: 100, totalFees: 100 },
    ],
  });

  assert.deepEqual(breakdown, [
    { currency: "THB", totalFees: 0.5, totalRealizedPnl: -2 },
    { currency: "USD", totalFees: 1.75, totalRealizedPnl: 6.25 },
  ]);
});
