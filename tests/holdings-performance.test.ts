import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHoldingPerformance,
  buildOpenHoldingLots,
  calculateOneDayGain,
  getFxProviderSymbol,
  getFxRateToValuationCurrency,
} from "../src/server/holdings-performance";
import type { HistoricalPrice, PriceSnapshot } from "../src/lib/db/schema";
import type { PositionTransaction } from "../src/lib/portfolio/positions";

function createPriceSnapshot(overrides: Partial<PriceSnapshot> = {}): PriceSnapshot {
  return {
    asOf: "2026-05-15T10:00:00.000Z",
    createdAt: "2026-05-15T10:00:00.000Z",
    currency: "USD",
    id: 1,
    instrumentId: 1,
    price: 12,
    source: "manual",
    ...overrides,
  };
}

function createHistoricalPrice(overrides: Partial<HistoricalPrice>): HistoricalPrice {
  return {
    close: 10,
    createdAt: "2026-05-01T10:00:00.000Z",
    currency: "USD",
    id: 1,
    instrumentId: 1,
    priceDate: "2026-05-01",
    source: "manual",
    ...overrides,
  };
}

function createTransaction(overrides: Partial<PositionTransaction> = {}): PositionTransaction {
  return {
    createdAt: "2026-01-01T09:00:00.000Z",
    fee: 0,
    id: 1,
    instrumentId: 1,
    price: 10,
    quantity: 10,
    side: "BUY",
    tradeDate: "2026-01-01",
    ...overrides,
  };
}

test("FX helpers resolve provider symbols and same-currency rates", () => {
  assert.equal(getFxProviderSymbol("USD", "THB"), "USDTHB=X");
  assert.equal(
    getFxRateToValuationCurrency({
      currency: "THB",
      fxSnapshotsByProviderSymbol: new Map(),
      valuationCurrency: "THB",
    }),
    1,
  );
  assert.equal(
    getFxRateToValuationCurrency({
      currency: "USD",
      fxSnapshotsByProviderSymbol: new Map([
        ["USDTHB=X", createPriceSnapshot({ currency: "THB", price: 35 })],
      ]),
      valuationCurrency: "THB",
    }),
    35,
  );
});

test("one-day gain returns nulls without a usable previous close", () => {
  assert.deepEqual(calculateOneDayGain({ lastPrice: 12, previousClose: null, quantity: 10 }), {
    oneDayGain: null,
    oneDayGainPercent: null,
  });

  assert.deepEqual(calculateOneDayGain({ lastPrice: 12, previousClose: 10, quantity: 10 }), {
    oneDayGain: 20,
    oneDayGainPercent: 0.2,
  });
});

test("holding performance uses historical and cost-basis windows", () => {
  const performance = buildHoldingPerformance({
    fxRateToValuationCurrency: 35,
    historicalRows: [
      createHistoricalPrice({ close: 8, priceDate: "2026-01-01" }),
      createHistoricalPrice({ close: 10, priceDate: "2026-04-15" }),
      createHistoricalPrice({ close: 10, priceDate: "2026-05-01" }),
    ],
    lastPrice: 12,
    oneDayGain: 20,
    oneDayGainPercent: 0.2,
    priceSnapshot: createPriceSnapshot({ asOf: "2026-05-15T10:00:00.000Z", price: 12 }),
    quantity: 10,
    transactions: [
      createTransaction({ id: 1, price: 10, quantity: 10, tradeDate: "2026-01-01" }),
      createTransaction({ id: 2, price: 11, quantity: 2, tradeDate: "2026-05-10" }),
    ],
  });

  assert.deepEqual(performance["1D"], {
    amount: 20,
    amountInValuationCurrency: 700,
    percent: 0.2,
  });
  assert.deepEqual(performance["1M"], {
    amount: 20,
    amountInValuationCurrency: 700,
    percent: 0.2,
  });
  assert.deepEqual(performance.MAX, {
    amount: 40,
    amountInValuationCurrency: 1400,
    percent: 0.5,
  });
  assert.deepEqual(performance.COST_MAX, {
    amount: 22,
    amountInValuationCurrency: 770,
    percent: 0.18032786885245902,
  });
});

test("open holding lots consume sells FIFO within the same portfolio", () => {
  assert.deepEqual(
    buildOpenHoldingLots({
      fxRateToValuationCurrency: 35,
      lastPrice: 15,
      transactions: [
        {
          ...createTransaction({ id: 1, price: 10, quantity: 10, tradeDate: "2026-01-01" }),
          broker: "WEBULL",
          notes: "first",
          portfolioId: 1,
          portfolioName: "Core",
          updatedAt: "2026-01-01T10:00:00.000Z",
        },
        {
          ...createTransaction({ id: 2, price: 12, quantity: 5, tradeDate: "2026-01-02" }),
          broker: "DIME",
          notes: null,
          portfolioId: 2,
          portfolioName: "Satellite",
          updatedAt: "2026-01-02T10:00:00.000Z",
        },
        {
          ...createTransaction({
            id: 3,
            price: 15,
            quantity: 4,
            side: "SELL",
            tradeDate: "2026-01-03",
          }),
          broker: "WEBULL",
          notes: null,
          portfolioId: 1,
          portfolioName: "Core",
          updatedAt: "2026-01-03T10:00:00.000Z",
        },
      ],
    }).map((lot) => ({
      costBasis: lot.costBasis,
      marketValue: lot.marketValue,
      portfolioId: lot.portfolioId,
      remainingQuantity: lot.remainingQuantity,
      totalGain: lot.totalGain,
      totalGainInValuationCurrency: lot.totalGainInValuationCurrency,
      transactionId: lot.transactionId,
    })),
    [
      {
        costBasis: 60,
        marketValue: 90,
        portfolioId: 1,
        remainingQuantity: 6,
        totalGain: 30,
        totalGainInValuationCurrency: 1050,
        transactionId: 1,
      },
      {
        costBasis: 60,
        marketValue: 75,
        portfolioId: 2,
        remainingQuantity: 5,
        totalGain: 15,
        totalGainInValuationCurrency: 525,
        transactionId: 2,
      },
    ],
  );
});
