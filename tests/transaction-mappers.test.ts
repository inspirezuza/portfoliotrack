import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransactionInstrumentSelectable,
  mapInstrumentOption,
  mapTransactionListItem,
} from "@/server/transactions/mappers";
import type { Instrument, Transaction } from "@/lib/db/schema";

const BASE_INSTRUMENT: Instrument = {
  createdAt: "2026-01-01T00:00:00.000Z",
  currency: "USD",
  displayName: "Apple Inc.",
  drRatio: null,
  fxProviderSymbol: null,
  id: 1,
  instrumentType: "COMMON_STOCK",
  isActive: true,
  market: "NASDAQ",
  providerSymbol: "AAPL",
  symbol: "AAPL",
  underlyingCurrency: null,
  underlyingDisplayName: null,
  underlyingProviderSymbol: null,
  underlyingSymbol: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const BASE_TRANSACTION: Transaction = {
  broker: "DIME",
  createdAt: "2026-01-02T09:00:00.000Z",
  fee: 1.25,
  id: 10,
  instrumentId: 1,
  notes: "first buy",
  portfolioId: 7,
  price: 12.345,
  quantity: 3,
  side: "BUY",
  tradeDate: "2026-01-02",
  updatedAt: "2026-01-02T09:00:00.000Z",
};

test("transaction list mapper preserves money, signed quantity, and nested display fields", () => {
  const buyItem = mapTransactionListItem({
    instrument: BASE_INSTRUMENT,
    portfolio: { name: "Core" },
    transaction: BASE_TRANSACTION,
  });
  const sellItem = mapTransactionListItem({
    instrument: {
      ...BASE_INSTRUMENT,
      underlyingProviderSymbol: "AAPL",
    },
    transaction: {
      ...BASE_TRANSACTION,
      fee: 0.5,
      id: 11,
      notes: null,
      price: 20,
      quantity: 2,
      side: "SELL",
    },
  });

  assert.equal(buyItem.grossAmount, 37.04);
  assert.equal(buyItem.netAmount, 38.29);
  assert.equal(buyItem.signedQuantity, 3);
  assert.equal(buyItem.portfolioName, "Core");
  assert.equal(buyItem.instrument.providerSymbol, "AAPL");
  assert.equal(sellItem.grossAmount, 40);
  assert.equal(sellItem.netAmount, 39.5);
  assert.equal(sellItem.signedQuantity, -2);
  assert.equal(sellItem.portfolioName, null);
  assert.equal(sellItem.instrument.underlyingProviderSymbol, "AAPL");
});

test("instrument option mapper preserves labels and inactive held selectability", () => {
  const activeEmptyOption = mapInstrumentOption(BASE_INSTRUMENT);
  const inactiveHeldOption = mapInstrumentOption(
    {
      ...BASE_INSTRUMENT,
      isActive: false,
      providerSymbol: "AAPL.BK",
      symbol: "AAPL80",
    },
    2,
  );
  const inactiveEmptyOption = mapInstrumentOption(
    {
      ...BASE_INSTRUMENT,
      id: 2,
      isActive: false,
      symbol: "OLD",
    },
    0,
  );

  assert.equal(activeEmptyOption.label, "AAPL - Apple Inc. - NASDAQ - USD");
  assert.equal(activeEmptyOption.currentQuantity, 0);
  assert.equal(inactiveHeldOption.providerSymbol, "AAPL.BK");
  assert.equal(isTransactionInstrumentSelectable(activeEmptyOption), true);
  assert.equal(isTransactionInstrumentSelectable(inactiveHeldOption), true);
  assert.equal(isTransactionInstrumentSelectable(inactiveEmptyOption), false);
});
