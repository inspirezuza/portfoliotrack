import assert from "node:assert/strict";
import test from "node:test";
import { getImportPositionValidationErrors } from "../src/server/transaction-import-export/position-validation";

test("transaction import position validation reports oversold imported rows", () => {
  const errors = getImportPositionValidationErrors(
    [
      {
        createdAt: "2026-01-01 09:00:00",
        fee: 0,
        id: 1,
        instrumentId: 10,
        price: 10,
        quantity: 5,
        side: "BUY",
        tradeDate: "2026-01-01",
      },
    ],
    [
      {
        fee: 0,
        instrumentId: 10,
        price: 11,
        quantity: 6,
        rowNumber: 8,
        side: "SELL",
        tradeDate: "2026-01-02",
      },
    ],
  );

  assert.equal(errors.get(8), "Sell quantity exceeds holdings. Available quantity is 5.");
});

test("transaction import position validation allows buys before imported sells", () => {
  const errors = getImportPositionValidationErrors(
    [],
    [
      {
        fee: 0,
        instrumentId: 10,
        price: 10,
        quantity: 5,
        rowNumber: 2,
        side: "BUY",
        tradeDate: "2026-01-01",
      },
      {
        fee: 0,
        instrumentId: 10,
        price: 11,
        quantity: 5,
        rowNumber: 3,
        side: "SELL",
        tradeDate: "2026-01-02",
      },
    ],
  );

  assert.deepEqual([...errors], []);
});
