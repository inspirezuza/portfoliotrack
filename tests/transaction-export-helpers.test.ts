import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransactionExportFileName,
  getLocalIsoDate,
} from "@/server/transaction-import-export/export-helpers";

test("transaction export helpers preserve template and dated file names", () => {
  assert.equal(
    buildTransactionExportFileName({ template: true }),
    "PortfolioTrack-transaction-template.xlsx",
  );
  assert.equal(
    buildTransactionExportFileName({
      now: new Date(2026, 4, 29, 23, 59, 59),
      template: false,
    }),
    "PortfolioTrack-transactions-2026-05-29.xlsx",
  );
});

test("transaction export helpers format local dates with leading zeroes", () => {
  assert.equal(getLocalIsoDate(new Date(2026, 0, 5, 12, 0, 0)), "2026-01-05");
});
