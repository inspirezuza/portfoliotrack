import assert from "node:assert/strict";
import test from "node:test";
import { instrumentInputSchema } from "../src/lib/validation/instrument";
import { transactionInputSchema } from "../src/lib/validation/transaction";

test("transaction validation rejects future trade dates", () => {
  const result = transactionInputSchema.safeParse({
    instrumentId: 1,
    tradeDate: "2099-01-01",
    side: "BUY",
    quantity: 1,
    price: 1,
    fee: 0,
    notes: ""
  });

  if (result.success) {
    assert.fail("Expected future trade date validation to fail.");
  }

  assert.match(JSON.stringify(result.error.flatten().fieldErrors), /future/);
});

test("transaction validation normalizes side, quantity, price, fee, and blank notes", () => {
  const result = transactionInputSchema.parse({
    instrumentId: "1",
    tradeDate: "2026-01-01",
    side: " buy ",
    quantity: "1.123456789",
    price: "12.345678",
    fee: "",
    notes: "   "
  });

  assert.deepEqual(result, {
    instrumentId: 1,
    tradeDate: "2026-01-01",
    side: "BUY",
    quantity: 1.123457,
    price: 12.3457,
    fee: 0,
    notes: null
  });
});

test("instrument validation defaults Thai provider symbols and uppercases input", () => {
  const result = instrumentInputSchema.parse({
    symbol: "asts03",
    displayName: "AST SpaceMobile, Inc.",
    market: "th",
    instrumentType: "equity",
    currency: "thb",
    providerSymbol: ""
  });

  assert.deepEqual(result, {
    symbol: "ASTS03",
    displayName: "AST SpaceMobile, Inc.",
    market: "TH",
    instrumentType: "EQUITY",
    currency: "THB",
    providerSymbol: "ASTS03.BK"
  });
});
