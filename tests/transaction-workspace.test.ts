import assert from "node:assert/strict";
import test from "node:test";
import { buildTransactionWorkspaceModel } from "@/server/transactions/workspace";
import type { Instrument, Transaction } from "@/lib/db/schema";

function createInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
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
    ...overrides,
  };
}

function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    broker: "DIME",
    createdAt: "2026-01-02T09:00:00.000Z",
    fee: 0,
    id: 10,
    instrumentId: 1,
    notes: null,
    portfolioId: 7,
    price: 10,
    quantity: 2,
    side: "BUY",
    tradeDate: "2026-01-02",
    updatedAt: "2026-01-02T09:00:00.000Z",
    ...overrides,
  };
}

test("transaction workspace model preserves summary, positions, and edit form instruments", () => {
  const inactiveInstrument = createInstrument({
    id: 2,
    isActive: false,
    providerSymbol: "OLD",
    symbol: "OLD",
  });
  const transactionRows = [
    {
      instrument: createInstrument(),
      transaction: createTransaction(),
    },
    {
      instrument: inactiveInstrument,
      transaction: createTransaction({
        id: 11,
        instrumentId: 2,
        quantity: 1,
        tradeDate: "2026-01-03",
      }),
    },
  ];

  const workspace = buildTransactionWorkspaceModel({
    editTransactionId: 11,
    includeEditingInstrumentInForm: true,
    instrumentRows: [createInstrument(), inactiveInstrument],
    transactionRows,
  });

  assert.equal(workspace.summary.transactionCount, 2);
  assert.equal(workspace.summary.uniqueInstrumentCount, 2);
  assert.equal(workspace.summary.openInstrumentCount, 2);
  assert.equal(workspace.summary.selectableInstrumentCount, 2);
  assert.equal(workspace.summary.latestTradeDate, "2026-01-02");
  assert.equal(workspace.editingTransaction?.id, 11);
  assert.equal(
    workspace.allInstruments.find((instrument) => instrument.id === 2)?.currentQuantity,
    1,
  );
  assert.deepEqual(
    workspace.formInstruments.map((instrument) => instrument.id),
    [1, 2],
  );
});

test("transaction workspace model can keep aggregate form instruments strictly selectable", () => {
  const inactiveInstrument = createInstrument({
    id: 2,
    isActive: false,
    providerSymbol: "OLD",
    symbol: "OLD",
  });

  const workspace = buildTransactionWorkspaceModel({
    editTransactionId: 11,
    includeEditingInstrumentInForm: false,
    instrumentRows: [createInstrument(), inactiveInstrument],
    transactionRows: [
      {
        instrument: createInstrument(),
        transaction: createTransaction({
          id: 11,
          instrumentId: 1,
          tradeDate: "2026-01-03",
        }),
      },
    ],
  });

  assert.equal(workspace.editingTransaction?.id, 11);
  assert.deepEqual(
    workspace.formInstruments.map((instrument) => instrument.id),
    [1],
  );
});
