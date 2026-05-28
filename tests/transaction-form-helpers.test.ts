import assert from "node:assert/strict";
import test from "node:test";
import {
  createTransactionRequestBody,
  createValuesFromTransaction,
  findExistingInstrumentForLookup,
  getErrorMessage,
  getInitialInstrumentSearch,
  getNextTransactionFormSyncState,
  getSynchronizedInstrumentId,
  getTransactionSubmitButtonLabel,
  getTransactionInstrumentLabel,
  getVisibleInstrumentOptions,
  type ApiErrorResponse,
} from "../src/components/transaction-form/form-helpers";
import type { TransactionInstrumentOption, TransactionListItem } from "../src/server/transactions";
import { getUiCopy } from "../src/lib/ui/copy";

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

test("transaction form helpers preserve request body and lookup duplicate matching", () => {
  const instruments = [
    createInstrument({ id: 20, symbol: "MSFT", providerSymbol: "MSFT" }),
    createInstrument(),
  ];
  const transaction = createTransaction({ id: 42, portfolioId: 7 });

  assert.deepEqual(
    createTransactionRequestBody(
      {
        instrumentId: "10",
        tradeDate: "2026-05-28",
        side: "BUY",
        broker: "DIME",
        quantity: "4.5",
        price: "88.25",
        fee: "",
        notes: "trim stays in caller",
      },
      transaction,
    ),
    {
      id: 42,
      portfolioId: 7,
      instrumentId: 10,
      tradeDate: "2026-05-28",
      side: "BUY",
      broker: "DIME",
      quantity: 4.5,
      price: 88.25,
      fee: 0,
      notes: "trim stays in caller",
    },
  );
  assert.equal(
    findExistingInstrumentForLookup(instruments, {
      symbol: "aapl",
      displayName: "Apple Inc.",
      market: "NASDAQ",
      instrumentType: "EQUITY",
      currency: "USD",
      providerSymbol: "AAPL",
      exchangeName: "Nasdaq",
    })?.id,
    10,
  );
  assert.equal(
    findExistingInstrumentForLookup(instruments, {
      symbol: "META",
      displayName: "Meta Platforms",
      market: "NASDAQ",
      instrumentType: "EQUITY",
      currency: "USD",
      providerSymbol: "META",
      exchangeName: "Nasdaq",
    }),
    undefined,
  );
});

test("transaction form helper preserves submit button labels", () => {
  const copy = getUiCopy("EN");

  assert.equal(
    getTransactionSubmitButtonLabel({
      copy,
      isEditing: false,
      isRefreshing: false,
      isSubmitting: false,
    }),
    "Save transaction",
  );
  assert.equal(
    getTransactionSubmitButtonLabel({
      copy,
      isEditing: true,
      isRefreshing: false,
      isSubmitting: true,
    }),
    "Updating...",
  );
  assert.equal(
    getTransactionSubmitButtonLabel({
      copy,
      isEditing: false,
      isRefreshing: true,
      isSubmitting: false,
    }),
    "Refreshing...",
  );
});

test("transaction form sync helper preserves edit hydration and instrument resync", () => {
  const instruments = [
    createInstrument({ id: 20, symbol: "MSFT", label: "MSFT - Microsoft - NASDAQ - USD" }),
    createInstrument(),
  ];
  const currentValues = {
    instrumentId: "999",
    tradeDate: "2026-05-29",
    side: "BUY" as const,
    broker: "DIME" as const,
    quantity: "1",
    price: "10",
    fee: "0",
    notes: "draft",
  };

  assert.deepEqual(
    getNextTransactionFormSyncState({
      currentValues,
      editingTransaction: createTransaction(),
      instruments,
    }),
    {
      values: createValuesFromTransaction(createTransaction()),
      instrumentSearch: "AAPL - Apple Inc. - NASDAQ - USD",
      highlightedInstrumentId: "10",
      isInstrumentComboboxOpen: false,
      errorMessage: null,
      successMessage: null,
    },
  );
  assert.deepEqual(
    getNextTransactionFormSyncState({
      currentValues,
      editingTransaction: null,
      instruments,
    }),
    {
      values: { ...currentValues, instrumentId: "" },
    },
  );
});

test("transaction form helper ranks visible instrument options by search score then symbol", () => {
  const apple = createInstrument({ id: 1, symbol: "AAPL", displayName: "Apple Inc." });
  const alphabet = createInstrument({
    id: 2,
    symbol: "GOOGL",
    displayName: "Alphabet Inc.",
    label: "GOOGL - Alphabet Inc. - NASDAQ - USD",
    providerSymbol: "GOOGL",
  });
  const aad = createInstrument({
    id: 3,
    symbol: "AAD",
    displayName: "Asia Aviation",
    label: "AAD - Asia Aviation - SET - THB",
    market: "SET",
    providerSymbol: "AAD.BK",
  });

  assert.deepEqual(
    getVisibleInstrumentOptions([alphabet, apple, aad], "aa").map(
      (instrument) => instrument.symbol,
    ),
    ["AAD", "AAPL"],
  );
  assert.deepEqual(getVisibleInstrumentOptions([alphabet, apple], "missing"), []);
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
