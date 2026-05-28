import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  TRANSACTION_EXCEL_SHEET_NAME,
  buildTransactionExcelWorkbook,
  parseTransactionExcelWorkbook,
} from "@/lib/transactions/excel";
import type { TransactionListItem } from "@/server/transactions";

function createTransaction(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: 1,
    portfolioId: 1,
    instrumentId: 80,
    tradeDate: "2026-05-16",
    side: "BUY",
    broker: "DIME",
    quantity: 12.5,
    price: 10.25,
    fee: 2,
    notes: "first lot",
    createdAt: "2026-05-16T10:00:00.000Z",
    updatedAt: "2026-05-16T10:00:00.000Z",
    portfolioName: "Main Portfolio",
    instrument: {
      id: 80,
      symbol: "AAPL80",
      displayName: "Apple DR",
      market: "TH",
      instrumentType: "DR",
      currency: "THB",
      providerSymbol: "AAPL80.BK",
      underlyingProviderSymbol: "AAPL",
    },
    grossAmount: 128.125,
    netAmount: 130.125,
    signedQuantity: 12.5,
    ...overrides,
  };
}

test("transaction workbook export parses back as template rows without description text", async () => {
  const buffer = await buildTransactionExcelWorkbook([createTransaction()]);
  const parsed = await parseTransactionExcelWorkbook(buffer);

  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0]?.values, {
    instrumentAction: "",
    instrumentId: 80,
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "TH",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    tradeDate: "2026-05-16",
    side: "BUY",
    broker: "DIME",
    quantity: 12.5,
    price: 10.25,
    fee: 2,
    notes: "first lot",
  });
});

test("transaction workbook parser accepts Excel serial trade dates", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(TRANSACTION_EXCEL_SHEET_NAME);
  worksheet.addRow([
    "Instrument ID",
    "Symbol",
    "Display Name",
    "Market",
    "Currency",
    "Provider Symbol",
    "Trade Date",
    "Side",
    "Quantity",
    "Price",
    "Fee",
    "Notes",
  ]);
  worksheet.addRow([
    80,
    "AAPL80",
    "Apple DR",
    "TH",
    "THB",
    "AAPL80.BK",
    46158,
    "BUY",
    1,
    10,
    0,
    "",
  ]);

  const parsed = await parseTransactionExcelWorkbook(
    Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
  );

  assert.equal(parsed.rows[0]?.values.tradeDate, "2026-05-16");
});
