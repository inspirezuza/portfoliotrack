import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinalImportInput,
  buildInstrumentInsertValue,
  buildTransactionInsertValue,
  type ReadyCommitImportRow,
} from "../src/server/transaction-import-export/commit-helpers";
import { TransactionImportExportError } from "../src/server/transaction-import-export/errors";
import type { InstrumentInput } from "../src/lib/validation/instrument";
import type { TransactionInput } from "../src/lib/validation/transaction";

function createTransactionInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    instrumentId: 10,
    tradeDate: "2026-05-29",
    side: "BUY",
    broker: undefined,
    quantity: 2,
    price: 100,
    fee: 1,
    notes: "imported",
    ...overrides,
  };
}

function createInstrumentInput(overrides: Partial<InstrumentInput> = {}): InstrumentInput {
  return {
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "SET",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    ...overrides,
  };
}

test("transaction import commit helpers preserve insert defaults and DR metadata", () => {
  assert.deepEqual(buildTransactionInsertValue(createTransactionInput(), 7), {
    portfolioId: 7,
    instrumentId: 10,
    tradeDate: "2026-05-29",
    side: "BUY",
    broker: "DIME",
    quantity: 2,
    price: 100,
    fee: 1,
    notes: "imported",
  });

  const instrumentInsert = buildInstrumentInsertValue(createInstrumentInput());

  assert.equal(instrumentInsert.symbol, "AAPL80");
  assert.equal(instrumentInsert.instrumentType, "DR");
  assert.equal(instrumentInsert.underlyingSymbol, "AAPL");
  assert.equal(instrumentInsert.underlyingProviderSymbol, "AAPL");
  assert.equal(instrumentInsert.isActive, true);
});

test("transaction import commit helpers resolve pending instrument ids or throw import errors", () => {
  const existingInput = createTransactionInput({ instrumentId: 42 });
  const createdInput = createTransactionInput({ instrumentId: null as never });
  const row: ReadyCommitImportRow = {
    createInstrumentKey: "aapl80",
    input: createdInput,
    symbol: "AAPL80",
  };

  assert.deepEqual(
    buildFinalImportInput({ input: existingInput, symbol: "AAPL" }, new Map()),
    existingInput,
  );
  assert.deepEqual(buildFinalImportInput(row, new Map([["aapl80", 88]])), {
    ...createdInput,
    instrumentId: 88,
  });

  assert.throws(
    () => buildFinalImportInput(row, new Map()),
    (error) =>
      error instanceof TransactionImportExportError &&
      error.code === "INTERNAL_ERROR" &&
      error.message === "Instrument AAPL80 could not be resolved for import.",
  );
});
