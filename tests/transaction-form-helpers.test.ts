import assert from "node:assert/strict";
import test from "node:test";
import {
  createValuesFromTransaction,
  getErrorMessage,
  getInitialInstrumentSearch,
  getSynchronizedInstrumentId,
  getTransactionInstrumentLabel,
  type ApiErrorResponse,
} from "../src/components/transaction-form/form-helpers";
import type { TransactionInstrumentOption, TransactionListItem } from "../src/server/transactions";

function createInstrument(
  overrides: Partial<TransactionInstrumentOption> = {},
): TransactionInstrumentOption {
  return {
    id: 10,
    symbol: "AAPL",
    displayName: "Apple Inc.",
    market: "NASDAQ",
    instrumentType: "EQUITY",
    currency: "USD",
    providerSymbol: "AAPL",
    isActive: true,
    currentQuantity: 12.5,
    label: "AAPL - Apple Inc. - NASDAQ - USD",
    ...overrides,
  };
}

function createTransaction(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: 99,
    portfolioId: 1,
    instrumentId: 10,
    tradeDate: "2026-05-27",
    side: "SELL",
    broker: "WEBULL",
    quantity: 3.25,
    price: 101.5,
    fee: 0.75,
    notes: null,
    createdAt: "2026-05-27T10:00:00.000Z",
    updatedAt: "2026-05-27T10:00:00.000Z",
    portfolioName: "Main",
    instrument: {
      id: 10,
      symbol: "AAPL",
      displayName: "Apple Inc.",
      market: "NASDAQ",
      instrumentType: "EQUITY",
      currency: "USD",
      providerSymbol: "AAPL",
      underlyingProviderSymbol: null,
    },
    grossAmount: 329.88,
    netAmount: 329.13,
    signedQuantity: -3.25,
    ...overrides,
  };
}

test("transaction form helpers preserve edit values and instrument search labels", () => {
  const instruments = [
    createInstrument({ id: 20, label: "MSFT - Microsoft - NASDAQ - USD" }),
    createInstrument(),
  ];
  const transaction = createTransaction({
    notes: null,
    instrument: {
      id: 10,
      symbol: "AAPL",
      displayName: "Apple Inc.",
      market: "NASDAQ",
      instrumentType: "EQUITY",
      currency: "USD",
      providerSymbol: "AAPL",
      underlyingProviderSymbol: null,
    },
  });

  assert.deepEqual(createValuesFromTransaction(transaction), {
    instrumentId: "10",
    tradeDate: "2026-05-27",
    side: "SELL",
    broker: "WEBULL",
    quantity: "3.25",
    price: "101.5",
    fee: "0.75",
    notes: "",
  });
  assert.equal(getSynchronizedInstrumentId("20", instruments), "20");
  assert.equal(getSynchronizedInstrumentId("999", instruments), "");
  assert.equal(getInitialInstrumentSearch(instruments), "");
  assert.equal(
    getTransactionInstrumentLabel(transaction, instruments),
    "AAPL - Apple Inc. - NASDAQ - USD",
  );
  assert.equal(
    getTransactionInstrumentLabel(createTransaction({ instrumentId: 30 }), instruments),
    "AAPL - Apple Inc. - NASDAQ - USD",
  );
});

test("transaction form error helper preserves validation priority and insufficient quantity copy", () => {
  const fieldError: ApiErrorResponse["error"] = {
    message: "Fallback API message",
    details: {
      issues: {
        fieldErrors: {
          quantity: ["Quantity is required."],
        },
      },
    },
  };
  const formError: ApiErrorResponse["error"] = {
    message: "Fallback API message",
    details: {
      issues: {
        formErrors: ["Trade date is closed."],
      },
    },
  };

  assert.equal(getErrorMessage(fieldError, "Fallback message", "EN"), "Quantity is required.");
  assert.equal(getErrorMessage(formError, "Fallback message", "EN"), "Trade date is closed.");
  assert.equal(
    getErrorMessage(
      {
        code: "INSUFFICIENT_QUANTITY",
        details: { availableQuantity: 12.5 },
      },
      "Fallback message",
      "EN",
    ),
    "Sell quantity is greater than current holdings. Maximum sellable quantity is 12.5.",
  );
  assert.equal(getErrorMessage(undefined, "Fallback message", "EN"), "Fallback message");
});
