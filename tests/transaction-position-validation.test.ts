import assert from "node:assert/strict";
import test from "node:test";
import { InsufficientQuantityError } from "@/lib/portfolio/positions";
import {
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
