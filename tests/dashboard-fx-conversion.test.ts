import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardFxConvertedRows } from "../src/server/dashboard/fx-conversion";

const BASE_INSTRUMENT = {
  createdAt: "2026-01-01T00:00:00.000Z",
  displayName: "Base",
  drRatio: null,
  fxProviderSymbol: null,
  instrumentType: "EQUITY",
  isActive: true,
  market: "NASDAQ",
  underlyingCurrency: null,
  underlyingDisplayName: null,
  underlyingProviderSymbol: null,
  underlyingSymbol: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("dashboard FX conversion preserves valuation rows and benchmark timeline rows", () => {
  const result = buildDashboardFxConvertedRows({
    benchmarkInstrumentId: 3,
    fxInstrumentIds: [2],
    historicalPriceRows: [
      {
        id: 1,
        instrumentId: 1,
        priceDate: "2026-01-02",
        close: 10,
        currency: "USD",
        source: "test",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: 2,
        instrumentId: 2,
        priceDate: "2026-01-02",
        close: 35,
        currency: "THB",
        source: "test",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: 3,
        instrumentId: 3,
        priceDate: "2026-01-02",
        close: 100,
        currency: "USD",
        source: "test",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    instrumentRows: [
      {
        ...BASE_INSTRUMENT,
        id: 1,
        symbol: "AAPL",
        displayName: "Apple",
        providerSymbol: "AAPL",
        currency: "USD",
      },
      {
        ...BASE_INSTRUMENT,
        id: 2,
        symbol: "USDTHB=X",
        displayName: "USD/THB",
        providerSymbol: "USDTHB=X",
        currency: "THB",
      },
      {
        ...BASE_INSTRUMENT,
        id: 3,
        symbol: "SPY",
        displayName: "SPY",
        providerSymbol: "SPY",
        currency: "USD",
      },
    ],
    intradayPriceRows: [
      {
        id: 1,
        instrumentId: 1,
        observedAt: "2026-01-02T10:00:00.000Z",
        close: 11,
        currency: "USD",
        interval: "1h",
        source: "test",
        createdAt: "2026-01-02T10:00:00.000Z",
      },
      {
        id: 2,
        instrumentId: 2,
        observedAt: "2026-01-02T09:00:00.000Z",
        close: 36,
        currency: "THB",
        interval: "1h",
        source: "test",
        createdAt: "2026-01-02T09:00:00.000Z",
      },
      {
        id: 3,
        instrumentId: 3,
        observedAt: "2026-01-02T10:00:00.000Z",
        close: 101,
        currency: "USD",
        interval: "1h",
        source: "test",
        createdAt: "2026-01-02T10:00:00.000Z",
      },
    ],
    priceSnapshotRows: [
      {
        id: 1,
        instrumentId: 1,
        asOf: "2026-01-02T11:00:00.000Z",
        price: 12,
        currency: "USD",
        source: "test",
        createdAt: "2026-01-02T11:00:00.000Z",
      },
      {
        id: 3,
        instrumentId: 3,
        asOf: "2026-01-02T11:00:00.000Z",
        price: 102,
        currency: "USD",
        source: "test",
        createdAt: "2026-01-02T11:00:00.000Z",
      },
    ],
    transactionRows: [
      {
        instrumentId: 1,
        tradeDate: "2026-01-02",
        side: "BUY",
        quantity: 1,
        price: 10,
        fee: 1,
        createdAt: "2026-01-02T00:00:00.000Z",
        id: 1,
      },
    ],
    valuationCurrency: "THB",
  });

  assert.deepEqual(result.convertedTransactionRows, [
    {
      instrumentId: 1,
      tradeDate: "2026-01-02",
      side: "BUY",
      quantity: 1,
      price: 350,
      fee: 35,
      createdAt: "2026-01-02T00:00:00.000Z",
      id: 1,
    },
  ]);
  assert.deepEqual(
    result.convertedInstrumentRows.map(({ id, currency }) => ({ id, currency })),
    [
      { id: 1, currency: "THB" },
      { id: 2, currency: "THB" },
      { id: 3, currency: "THB" },
    ],
  );
  assert.deepEqual(
    result.timelineHistoricalPriceRows.map(({ instrumentId, close, currency }) => ({
      instrumentId,
      close,
      currency,
    })),
    [
      { instrumentId: 1, close: 350, currency: "THB" },
      { instrumentId: 3, close: 100, currency: "USD" },
    ],
  );
  assert.deepEqual(
    result.timelineIntradayPriceRows.map(({ instrumentId, close, currency, interval }) => ({
      instrumentId,
      close,
      currency,
      interval,
    })),
    [
      { instrumentId: 1, close: 396, currency: "THB", interval: "1h" },
      { instrumentId: 1, close: 432, currency: "THB", interval: "1h" },
      { instrumentId: 3, close: 101, currency: "USD", interval: "1h" },
      { instrumentId: 3, close: 102, currency: "USD", interval: "1h" },
    ],
  );
});
