import assert from "node:assert/strict";
import test from "node:test";
import {
  InsufficientQuantityError,
  calculatePositionForInstrument,
  sortTransactionsChronologically
} from "../src/lib/portfolio/positions";

test("calculates fee-aware average cost and realized P&L", () => {
  const position = calculatePositionForInstrument([
    {
      instrumentId: 1,
      tradeDate: "2026-01-01",
      side: "BUY",
      quantity: 10,
      price: 100,
      fee: 5,
      createdAt: "2026-01-01 10:00:00",
      id: 1
    },
    {
      instrumentId: 1,
      tradeDate: "2026-01-02",
      side: "SELL",
      quantity: 4,
      price: 120,
      fee: 2,
      createdAt: "2026-01-02 10:00:00",
      id: 2
    }
  ]);

  assert.equal(position.quantity, 6);
  assert.equal(position.totalCost, 603);
  assert.equal(position.averageCost, 100.5);
  assert.equal(position.realizedPnl, 76);
  assert.equal(position.totalFees, 7);
});

test("rejects selling more than the available chronological quantity", () => {
  assert.throws(
    () =>
      calculatePositionForInstrument([
        {
          instrumentId: 1,
          tradeDate: "2026-01-02",
          side: "SELL",
          quantity: 1,
          price: 120,
          fee: 0,
          createdAt: "2026-01-02 09:00:00",
          id: 2
        },
        {
          instrumentId: 1,
          tradeDate: "2026-01-03",
          side: "BUY",
          quantity: 1,
          price: 100,
          fee: 0,
          createdAt: "2026-01-03 09:00:00",
          id: 1
        }
      ]),
    InsufficientQuantityError
  );
});

test("sorts same-day transactions by created time then id", () => {
  const ordered = sortTransactionsChronologically([
    {
      instrumentId: 1,
      tradeDate: "2026-01-01",
      side: "BUY",
      quantity: 1,
      price: 1,
      fee: 0,
      createdAt: "2026-01-01 10:00:00",
      id: 2
    },
    {
      instrumentId: 1,
      tradeDate: "2026-01-01",
      side: "BUY",
      quantity: 1,
      price: 1,
      fee: 0,
      createdAt: "2026-01-01 09:00:00",
      id: 3
    },
    {
      instrumentId: 1,
      tradeDate: "2026-01-01",
      side: "BUY",
      quantity: 1,
      price: 1,
      fee: 0,
      createdAt: "2026-01-01 09:00:00",
      id: 1
    }
  ]);

  assert.deepEqual(
    ordered.map((transaction) => transaction.id),
    [1, 3, 2]
  );
});
