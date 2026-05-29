import assert from "node:assert/strict";
import test from "node:test";
import { InsufficientQuantityError } from "@/lib/portfolio/positions";
import {
  buildEditedPositionTransactions,
  buildPendingPositionTransaction,
  buildRemainingPositionTransactionsAfterDelete,
  getInsufficientQuantityDetails,
  getPendingTransactionOrderMarker,
  toChronologicalPositionTransaction,
} from "@/server/transactions/position-validation";

test("transaction position validation helpers preserve position row fields", () => {
  const positionTransaction = toChronologicalPositionTransaction({
    createdAt: "2026-05-29 10:00:00",
    fee: 0.25,
    id: 42,
    instrumentId: 7,
    price: 123.45,
    quantity: 3,
    side: "SELL",
    tradeDate: "2026-05-28",
  });

  assert.deepEqual(positionTransaction, {
    createdAt: "2026-05-29 10:00:00",
    fee: 0.25,
    id: 42,
    instrumentId: 7,
    price: 123.45,
    quantity: 3,
    side: "SELL",
    tradeDate: "2026-05-28",
  });
});

test("transaction position validation helpers expose stable service-error details", () => {
  assert.deepEqual(getInsufficientQuantityDetails(new InsufficientQuantityError(7, 2, 3)), {
    attemptedQuantity: 3,
    availableQuantity: 2,
    instrumentId: 7,
  });

  assert.match(getPendingTransactionOrderMarker(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("transaction position validation helpers build pending create rows", () => {
  const pendingTransaction = buildPendingPositionTransaction({
    fee: 1.5,
    instrumentId: 7,
    notes: null,
    price: 50,
    quantity: 2,
    side: "BUY",
    tradeDate: "2026-05-29",
  });

  assert.deepEqual(pendingTransaction, {
    createdAt: pendingTransaction.createdAt,
    fee: 1.5,
    id: Number.MAX_SAFE_INTEGER,
    instrumentId: 7,
    price: 50,
    quantity: 2,
    side: "BUY",
    tradeDate: "2026-05-29",
  });
  assert.match(pendingTransaction.createdAt ?? "", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("transaction position validation helpers replace only the edited row", () => {
  const editedTransactions = buildEditedPositionTransactions(
    [
      {
        createdAt: "2026-05-28 09:00:00",
        fee: 0,
        id: 1,
        instrumentId: 7,
        price: 100,
        quantity: 1,
        side: "BUY",
        tradeDate: "2026-05-28",
      },
      {
        createdAt: "2026-05-29 09:00:00",
        fee: 0.5,
        id: 2,
        instrumentId: 7,
        price: 110,
        quantity: 1,
        side: "SELL",
        tradeDate: "2026-05-29",
      },
    ],
    2,
    {
      fee: 0.75,
      instrumentId: 8,
      notes: "rebalance",
      price: 120,
      quantity: 3,
      side: "BUY",
      tradeDate: "2026-05-30",
    },
  );

  assert.deepEqual(editedTransactions, [
    {
      createdAt: "2026-05-28 09:00:00",
      fee: 0,
      id: 1,
      instrumentId: 7,
      price: 100,
      quantity: 1,
      side: "BUY",
      tradeDate: "2026-05-28",
    },
    {
      createdAt: "2026-05-29 09:00:00",
      fee: 0.75,
      id: 2,
      instrumentId: 8,
      price: 120,
      quantity: 3,
      side: "BUY",
      tradeDate: "2026-05-30",
    },
  ]);
});

test("transaction position validation helpers remove deleted rows", () => {
  const remainingTransactions = buildRemainingPositionTransactionsAfterDelete(
    [
      {
        createdAt: "2026-05-28 09:00:00",
        fee: 0,
        id: 1,
        instrumentId: 7,
        price: 100,
        quantity: 1,
        side: "BUY",
        tradeDate: "2026-05-28",
      },
      {
        createdAt: "2026-05-29 09:00:00",
        fee: 0.5,
        id: 2,
        instrumentId: 7,
        price: 110,
        quantity: 1,
        side: "SELL",
        tradeDate: "2026-05-29",
      },
    ],
    2,
  );

  assert.deepEqual(remainingTransactions, [
    {
      createdAt: "2026-05-28 09:00:00",
      fee: 0,
      id: 1,
      instrumentId: 7,
      price: 100,
      quantity: 1,
      side: "BUY",
      tradeDate: "2026-05-28",
    },
  ]);
});
