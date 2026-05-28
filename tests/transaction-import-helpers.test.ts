import assert from "node:assert/strict";
import test from "node:test";
import { TransactionExcelError, type ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import { transactionInputSchema } from "@/lib/validation/transaction";
import {
  getCreateInstrumentKey,
  getErrorMessage,
  getFallbackInstrumentInput,
  getImportTransactionKey,
  getMarket,
  getProviderSymbolCandidates,
  getValidationMessage,
  normalizeDisplaySymbol,
  normalizeLookupValue,
  parseInstrumentAction,
} from "../src/server/transaction-import-export/import-helpers";

function createParsedRow(
  values: Partial<ParsedTransactionExcelRow["values"]> = {},
): ParsedTransactionExcelRow {
  return {
    rowNumber: 2,
    values: {
      instrumentAction: "",
      instrumentId: "",
      symbol: "",
      displayName: "",
      market: "",
      instrumentType: "",
      currency: "",
      providerSymbol: "",
      tradeDate: "",
      side: "",
      broker: "",
      quantity: "",
      price: "",
      fee: "",
      notes: "",
      ...values,
    },
  };
}

test("transaction import helpers normalize lookup values and action aliases", () => {
  assert.equal(normalizeLookupValue(" aapl80.bk "), "AAPL80.BK");
  assert.equal(normalizeLookupValue(null), "");
  assert.equal(normalizeDisplaySymbol(" ptt.bk "), "PTT");
  assert.deepEqual(parseInstrumentAction(createParsedRow()), { action: "MATCH", error: null });
  assert.deepEqual(parseInstrumentAction(createParsedRow({ instrumentAction: " add " })), {
    action: "CREATE",
    error: null,
  });
  assert.equal(
    parseInstrumentAction(createParsedRow({ instrumentAction: "DELETE" })).error,
    "Instrument Action UPDATE/DELETE is not supported in transaction import. Use a separate instrument maintenance flow.",
  );
});

test("transaction import helpers preserve duplicate keys and validation messages", () => {
  assert.equal(
    getImportTransactionKey(
      {
        tradeDate: "2026-05-27",
        side: "BUY",
        broker: undefined,
        quantity: 1.23456789,
        price: 10.123456,
        fee: 0,
        notes: null,
      },
      "AAPL",
    ),
    "AAPL|2026-05-27|BUY|DIME|1.234568|10.1235|0|",
  );

  const validation = transactionInputSchema.safeParse({
    instrumentId: 1,
    tradeDate: "",
    side: "BUY",
    broker: "DIME",
    quantity: 1,
    price: 10,
    fee: 0,
  });

  assert.equal(
    getValidationMessage(validation),
    "Trade date must be a valid ISO date (YYYY-MM-DD).",
  );
  assert.equal(
    getErrorMessage(new TransactionExcelError("INVALID_TEMPLATE", "Missing sheet.")),
    "Missing sheet.",
  );
  assert.equal(getErrorMessage("bad"), "Excel file could not be imported.");
});

test("transaction import helpers infer provider symbols and fallback instrument input", () => {
  assert.equal(getMarket("PTT.BK"), "TH");
  assert.equal(getMarket("AAPL", "NYQ"), "US");
  assert.deepEqual(
    getProviderSymbolCandidates({ symbol: "aapl80", providerSymbol: "", market: "TH" }),
    ["AAPL80.BK", "AAPL80"],
  );
  assert.deepEqual(
    getProviderSymbolCandidates({ symbol: "AAPL", providerSymbol: "", market: "US" }),
    ["AAPL"],
  );

  const fallback = getFallbackInstrumentInput({
    symbol: "aapl80.bk",
    displayName: "",
    market: "",
    instrumentType: "",
    currency: "",
    providerSymbol: "",
  });

  assert.equal(fallback.symbol, "AAPL80");
  assert.equal(fallback.displayName, "AAPL80");
  assert.equal(fallback.market, "TH");
  assert.equal(fallback.currency, "THB");
  assert.equal(fallback.providerSymbol, "AAPL80.BK");
  assert.equal(getCreateInstrumentKey(fallback), "AAPL80.BK");
});
