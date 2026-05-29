import assert from "node:assert/strict";
import test from "node:test";
import {
  compareTransactions,
  getDeleteErrorMessage,
  getNextTransactionSort,
  getTransactionSearchText,
  getTransactionSortValue,
  getVisibleTransactions,
  type SortState,
} from "../src/components/transaction-table/table-helpers";
import type { TransactionListItem } from "../src/server/transactions";

function createTransaction(
  id: number,
  overrides: Partial<TransactionListItem> = {},
): TransactionListItem {
  return {
    broker: "DIME",
    createdAt: "2026-01-01T00:00:00.000Z",
    fee: 1,
    grossAmount: 100,
    id,
    instrument: {
      currency: "USD",
      displayName: "Apple Inc",
      id,
      instrumentType: "STOCK",
      market: "US",
      providerSymbol: "AAPL",
      symbol: "AAPL",
      underlyingProviderSymbol: null,
    },
    instrumentId: id,
    netAmount: 101,
    notes: null,
    portfolioId: 10,
    portfolioName: "Core",
    price: 100,
    quantity: 1,
    side: "BUY",
    signedQuantity: 1,
    tradeDate: "2026-01-01",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("transaction table helper returns fallback delete errors safely", () => {
  assert.equal(getDeleteErrorMessage(undefined, "Could not delete"), "Could not delete");
  assert.equal(
    getDeleteErrorMessage({ message: "Transaction already changed" }, "Could not delete"),
    "Transaction already changed",
  );
});

test("transaction table helper preserves sort values and next sort states", () => {
  const transaction = createTransaction(1, {
    broker: "WEBULL",
    portfolioName: null,
    instrument: {
      currency: "USD",
      displayName: "Invesco QQQ",
      id: 1,
      instrumentType: "ETF",
      market: "US",
      providerSymbol: "QQQ",
      symbol: "QQQ",
      underlyingProviderSymbol: null,
    },
  });
  const currentSort: SortState = { key: "tradeDate", direction: "desc" };

  assert.equal(getTransactionSortValue(transaction, "instrument"), "QQQ Invesco QQQ US");
  assert.equal(getTransactionSortValue(transaction, "portfolio"), "");
  assert.deepEqual(getNextTransactionSort(currentSort, "tradeDate"), {
    key: "tradeDate",
    direction: "asc",
  });
  assert.deepEqual(getNextTransactionSort(currentSort, "instrument"), {
    key: "instrument",
    direction: "asc",
  });
  assert.deepEqual(getNextTransactionSort(currentSort, "quantity"), {
    key: "quantity",
    direction: "desc",
  });
});

test("transaction table helper preserves sorting direction and id tie-break", () => {
  const older = createTransaction(1, { tradeDate: "2026-01-01" });
  const newer = createTransaction(2, { tradeDate: "2026-01-02" });
  const sameDateHigherId = createTransaction(3, { tradeDate: "2026-01-01" });

  assert.equal(compareTransactions(older, newer, { key: "tradeDate", direction: "desc" }), 1);
  assert.equal(compareTransactions(older, newer, { key: "tradeDate", direction: "asc" }), -1);
  assert.equal(
    compareTransactions(older, sameDateHigherId, { key: "tradeDate", direction: "asc" }),
    2,
  );
});

test("transaction table helper preserves searchable fields and visible transaction ordering", () => {
  const transactions = [
    createTransaction(1, {
      broker: "DIME",
      instrument: {
        currency: "THB",
        displayName: "Apple DR",
        id: 1,
        instrumentType: "DR",
        market: "TH",
        providerSymbol: "AAPL80.BK",
        symbol: "AAPL80",
        underlyingProviderSymbol: "AAPL",
      },
      notes: "Dividend reinvest",
      portfolioName: "Thai DR",
      tradeDate: "2026-01-03",
    }),
    createTransaction(2, {
      broker: "WEBULL",
      instrument: {
        currency: "USD",
        displayName: "Invesco QQQ",
        id: 2,
        instrumentType: "ETF",
        market: "US",
        providerSymbol: "QQQ",
        symbol: "QQQ",
        underlyingProviderSymbol: null,
      },
      portfolioName: "Growth",
      quantity: 5,
      tradeDate: "2026-01-02",
    }),
  ];

  assert.match(getTransactionSearchText(transactions[0]), /dividend reinvest/);
  assert.match(getTransactionSearchText(transactions[0]), /thai dr/);
  assert.match(getTransactionSearchText(transactions[0]), /aapl80/);
  assert.deepEqual(
    getVisibleTransactions({
      searchQuery: "growth qqq",
      sort: { key: "tradeDate", direction: "desc" },
      transactions,
    }).map((transaction) => transaction.id),
    [2],
  );
  assert.deepEqual(
    getVisibleTransactions({
      searchQuery: "",
      sort: { key: "instrument", direction: "asc" },
      transactions,
    }).map((transaction) => transaction.id),
    [1, 2],
  );
});
