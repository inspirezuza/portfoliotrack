import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import {
  buildBaseImportPreviewRow,
  buildDuplicateImportKeys,
  buildDuplicateImportPreviewRow,
  buildImportEvaluationPreview,
  buildImportInstrumentLookupMaps,
  buildReadyImportPreviewRow,
} from "../src/server/transaction-import-export/evaluation-helpers";
import type { ImportInstrument } from "../src/server/transaction-import-export/instrument-resolution";
import type { ImportTransactionInput } from "../src/server/transaction-import-export/types";

const instrument: ImportInstrument = {
  id: 7,
  symbol: "AAPL80",
  displayName: "Apple DR",
  market: "TH",
  instrumentType: "DR",
  currency: "THB",
  providerSymbol: "AAPL80.BK",
};

function createParsedRow(
  values: Partial<ParsedTransactionExcelRow["values"]> = {},
): ParsedTransactionExcelRow {
  return {
    rowNumber: 3,
    values: {
      instrumentAction: "",
      instrumentId: "",
      symbol: "AAPL80",
      displayName: "",
      market: "",
      instrumentType: "",
      currency: "",
      providerSymbol: "AAPL80.BK",
      tradeDate: "2026-05-29",
      side: "BUY",
      broker: "",
      quantity: "2",
      price: "100",
      fee: "",
      notes: "imported",
      ...values,
    },
  };
}

function createImportInput(
  overrides: Partial<ImportTransactionInput> = {},
): ImportTransactionInput {
  return {
    instrumentId: 7,
    tradeDate: "2026-05-29",
    side: "BUY",
    broker: undefined,
    quantity: 2,
    price: 100,
    fee: 0,
    notes: "imported",
    ...overrides,
  };
}

test("transaction import evaluation helpers preserve lookup maps and duplicate keys", () => {
  const lookupMaps = buildImportInstrumentLookupMaps([instrument]);

  assert.equal(lookupMaps.instrumentById.get(7), instrument);
  assert.equal(lookupMaps.instrumentByProviderSymbol.get("AAPL80.BK"), instrument);
  assert.equal(lookupMaps.instrumentBySymbol.get("AAPL80"), instrument);

  assert.deepEqual(
    buildDuplicateImportKeys([
      {
        id: 11,
        instrumentId: 7,
        tradeDate: "2026-05-29",
        side: "BUY",
        broker: "DIME",
        quantity: 2,
        price: 100,
        fee: 0,
        notes: "imported",
        createdAt: "2026-05-29 09:00:00",
      },
    ]),
    new Set(["7|2026-05-29|BUY|DIME|2|100|0|imported"]),
  );
});

test("transaction import evaluation helpers preserve preview row shaping and counts", () => {
  const parsedRow = createParsedRow({ broker: "", fee: "" });
  const input = createImportInput();
  const basePreview = buildBaseImportPreviewRow(parsedRow, instrument);

  assert.deepEqual(basePreview, {
    rowNumber: 3,
    symbol: "AAPL80",
    tradeDate: "2026-05-29",
    side: "BUY",
    broker: null,
    quantity: 2,
    price: 100,
    fee: null,
    notes: "imported",
  });

  const duplicatePreview = buildDuplicateImportPreviewRow({
    input,
    resolvedInstrument: instrument,
    rowNumber: parsedRow.rowNumber,
  });
  const readyPreview = buildReadyImportPreviewRow({
    duplicateKey: "7|2026-05-29|BUY|DIME|2|100|0|imported",
    input,
    instrumentKey: "7",
    resolvedInstrument: instrument,
    rowNumber: parsedRow.rowNumber,
  });
  const preview = buildImportEvaluationPreview({
    parsedRowsCount: 3,
    readyRows: [readyPreview],
    rows: [
      {
        ...basePreview,
        status: "error",
        message: "Bad row.",
      },
      duplicatePreview,
    ],
  });

  assert.equal(duplicatePreview.broker, "DIME");
  assert.equal(readyPreview.message, "Ready to import.");
  assert.deepEqual(preview.counts, {
    totalRows: 3,
    readyRows: 1,
    skippedRows: 1,
    errorRows: 1,
  });
  assert.deepEqual(
    preview.rows.map((row) => row.status),
    ["error", "skipped_duplicate", "ready"],
  );
});
