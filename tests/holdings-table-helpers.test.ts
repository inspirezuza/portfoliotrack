import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVisibleHoldings,
  compareHoldings,
  getHoldingsSummary,
  getHoldingLotInstrumentOption,
  getHoldingLotTransaction,
  getHoldingSearchText,
  getPerformanceKey,
  getValuationAverageCost,
  getValuationLastPrice,
  isNativeCurrencyVisible,
  matchesHoldingFilter,
  type SortState,
} from "../src/components/holdings-table/table-helpers";
import type { HoldingLot, HoldingRow } from "../src/server/holdings";

const EMPTY_PERFORMANCE = {
  amount: null,
  amountInValuationCurrency: null,
  percent: null,
};

function createHolding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  const holding: HoldingRow = {
    averageCost: 10,
    currency: "USD",
    displayName: "Apple Inc.",
    drRatio: null,
    fxRateToValuationCurrency: null,
    instrumentId: 1,
    instrumentType: "STOCK",
    lastPrice: 12,
    lastPriceAsOf: "2026-01-02T10:00:00.000Z",
    lastPriceCurrency: "USD",
    lastPriceSource: "manual",
    lots: [],
    market: "NASDAQ",
    marketValue: 120,
    marketValueInValuationCurrency: null,
    oneDayGain: 2,
    oneDayGainInValuationCurrency: null,
    oneDayGainPercent: 0.02,
    parentAverageCost: null,
    parentLastPrice: null,
    parentLastPriceAsOf: null,
    performance: {
      "1D": { amount: 2, amountInValuationCurrency: null, percent: 0.02 },
      "1M": EMPTY_PERFORMANCE,
      "1W": EMPTY_PERFORMANCE,
      "1Y": EMPTY_PERFORMANCE,
      "3Y": EMPTY_PERFORMANCE,
      "5Y": EMPTY_PERFORMANCE,
      COST_1D: { amount: 1, amountInValuationCurrency: null, percent: 0.01 },
      COST_1M: EMPTY_PERFORMANCE,
      COST_1W: EMPTY_PERFORMANCE,
      COST_1Y: EMPTY_PERFORMANCE,
      COST_3Y: EMPTY_PERFORMANCE,
      COST_5Y: EMPTY_PERFORMANCE,
      COST_MAX: EMPTY_PERFORMANCE,
      COST_YTD: EMPTY_PERFORMANCE,
      MAX: EMPTY_PERFORMANCE,
      YTD: EMPTY_PERFORMANCE,
    },
    portfolioWeight: 0.5,
    providerSymbol: "AAPL",
    quantity: 10,
    realizedPnl: 0,
    symbol: "AAPL",
    totalCost: 100,
    totalCostInValuationCurrency: null,
    totalFees: 0,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    underlyingSymbol: null,
    unrealizedPnl: 20,
    unrealizedPnlInValuationCurrency: null,
    unrealizedPnlPercent: 0.2,
    valuationCurrency: "USD",
    ...overrides,
  };

  return holding;
}

function createLot(overrides: Partial<HoldingLot> = {}): HoldingLot {
  return {
    broker: "WEBULL",
    costBasis: 50,
    costBasisInValuationCurrency: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    fee: 1,
    instrumentId: 1,
    marketValue: 60,
    marketValueInValuationCurrency: null,
    notes: "first lot",
    originalQuantity: 5,
    portfolioId: 7,
    portfolioName: "Core",
    price: 10,
    remainingQuantity: 5,
    side: "BUY",
    totalGain: 10,
    totalGainInValuationCurrency: null,
    totalGainPercent: 0.2,
    tradeDate: "2026-01-01",
    transactionId: 42,
    updatedAt: "2026-01-02T09:00:00.000Z",
    ...overrides,
  };
}

test("valuation helpers use valuation currency only when native currency differs", () => {
  const sameCurrency = createHolding();
  const foreignCurrency = createHolding({
    averageCost: 20,
    currency: "USD",
    fxRateToValuationCurrency: 35,
    lastPrice: 22,
    valuationCurrency: "THB",
  });

  assert.equal(isNativeCurrencyVisible(sameCurrency), false);
  assert.equal(isNativeCurrencyVisible(foreignCurrency), true);
  assert.equal(getValuationAverageCost(foreignCurrency), 700);
  assert.equal(getValuationLastPrice(foreignCurrency), 770);
});

test("performance key switches between price and cost bases", () => {
  assert.equal(getPerformanceKey({ basis: "price", timeframe: "1D" }), "1D");
  assert.equal(getPerformanceKey({ basis: "cost", timeframe: "1D" }), "COST_1D");
});

test("holding sort and filters use valuation values for mixed-currency rows", () => {
  const gain = createHolding({
    symbol: "GAIN",
    currency: "USD",
    marketValue: 2,
    marketValueInValuationCurrency: 200,
    unrealizedPnl: -1,
    unrealizedPnlInValuationCurrency: 10,
    valuationCurrency: "THB",
  });
  const loss = createHolding({
    symbol: "LOSS",
    marketValue: 100,
    unrealizedPnl: -5,
  });
  const sort: SortState = { direction: "desc", key: "marketValue" };

  assert.equal(compareHoldings(gain, loss, sort, "1D") < 0, true);
  assert.equal(matchesHoldingFilter(gain, "gain"), true);
  assert.equal(matchesHoldingFilter(gain, "loss"), false);
  assert.equal(matchesHoldingFilter(loss, "loss"), true);
});

test("visible holdings and summary preserve filter, search, sort, and null rollups", () => {
  const performanceKey = getPerformanceKey({ basis: "price", timeframe: "1D" });
  const gain = createHolding({
    symbol: "GAIN",
    displayName: "Gain Corp",
    marketValue: 20,
    marketValueInValuationCurrency: 700,
    oneDayGain: 2,
    oneDayGainInValuationCurrency: 70,
    portfolioWeight: 0.25,
    unrealizedPnl: 5,
    unrealizedPnlInValuationCurrency: 175,
    valuationCurrency: "THB",
    performance: {
      ...createHolding().performance,
      "1D": { amount: 2, amountInValuationCurrency: 70, percent: 0.02 },
    },
  });
  const loss = createHolding({
    symbol: "LOSS",
    displayName: "Loss Corp",
    marketValue: 10,
    oneDayGain: null,
    portfolioWeight: 0.1,
    totalCostInValuationCurrency: null,
    unrealizedPnl: -2,
  });

  const visibleHoldings = buildVisibleHoldings({
    filter: "gain",
    holdings: [loss, gain],
    performanceKey,
    searchQuery: "gain",
    sort: { direction: "desc", key: "marketValue" },
  });

  assert.deepEqual(
    visibleHoldings.map((holding) => holding.symbol),
    ["GAIN"],
  );
  assert.deepEqual(getHoldingsSummary(visibleHoldings, performanceKey), {
    totalCost: null,
    marketValue: 700,
    unrealizedPnl: 175,
    oneDayGain: 70,
    portfolioWeight: 0.25,
  });
});

test("holding search text includes core identifying fields", () => {
  assert.equal(getHoldingSearchText(createHolding()), "aapl apple inc. nasdaq stock usd");
});

test("lot helpers map holdings to transaction edit models", () => {
  const holding = createHolding();
  const lot = createLot();

  assert.deepEqual(getHoldingLotInstrumentOption(holding), {
    currency: "USD",
    currentQuantity: 10,
    displayName: "Apple Inc.",
    id: 1,
    instrumentType: "STOCK",
    isActive: true,
    label: "AAPL - Apple Inc. - NASDAQ - USD",
    market: "NASDAQ",
    providerSymbol: "AAPL",
    symbol: "AAPL",
  });

  assert.deepEqual(getHoldingLotTransaction(holding, lot), {
    broker: "WEBULL",
    createdAt: "2026-01-01T09:00:00.000Z",
    fee: 1,
    grossAmount: 50,
    id: 42,
    instrument: {
      currency: "USD",
      displayName: "Apple Inc.",
      id: 1,
      instrumentType: "STOCK",
      market: "NASDAQ",
      providerSymbol: "AAPL",
      symbol: "AAPL",
      underlyingProviderSymbol: null,
    },
    instrumentId: 1,
    netAmount: 51,
    notes: "first lot",
    portfolioId: 7,
    portfolioName: "Core",
    price: 10,
    quantity: 5,
    side: "BUY",
    signedQuantity: 5,
    tradeDate: "2026-01-01",
    updatedAt: "2026-01-02T09:00:00.000Z",
  });
});
