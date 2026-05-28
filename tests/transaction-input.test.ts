import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransactionInsertValues,
  parseTransactionId,
  parseTransactionInput,
} from "@/server/transactions/input";
import { TransactionServiceError } from "@/server/transactions/errors";

test("transaction input helpers preserve id validation and insert defaults", () => {
  assert.equal(parseTransactionId("42"), 42);
  assert.throws(() => parseTransactionId("0"), {
    code: "VALIDATION_ERROR",
    message: "Transaction id must be a positive integer.",
    name: "TransactionServiceError",
  });

  const parsedInput = parseTransactionInput({
    instrumentId: 5,
    tradeDate: "2026-05-28",
    side: "BUY",
    quantity: "3",
    price: "12.5",
    fee: "",
    notes: "",
  });

  assert.deepEqual(buildTransactionInsertValues(parsedInput, 7), {
    portfolioId: 7,
    instrumentId: 5,
    tradeDate: "2026-05-28",
    side: "BUY",
    broker: "DIME",
    quantity: 3,
    price: 12.5,
    fee: 0,
    notes: null,
  });
});

test("transaction input parser preserves validation error shape", () => {
  assert.throws(
    () =>
      parseTransactionInput({
        instrumentId: 5,
        tradeDate: "3026-05-28",
        side: "BUY",
        quantity: "3",
        price: "12.5",
      }),
    (error) =>
      error instanceof TransactionServiceError &&
      error.code === "VALIDATION_ERROR" &&
      error.message === "Transaction input is invalid." &&
      error.details != null,
  );
});
