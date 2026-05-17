import ExcelJS from "exceljs";
import type { TransactionListItem } from "@/server/transactions";

export const TRANSACTION_EXCEL_SHEET_NAME = "Transactions";

const transactionExcelColumns = [
  { key: "instrumentId", header: "Instrument ID", width: 14 },
  { key: "symbol", header: "Symbol", width: 16 },
  { key: "displayName", header: "Display Name", width: 28 },
  { key: "market", header: "Market", width: 12 },
  { key: "currency", header: "Currency", width: 12 },
  { key: "providerSymbol", header: "Provider Symbol", width: 20 },
  { key: "tradeDate", header: "Trade Date", width: 14 },
  { key: "side", header: "Side", width: 10 },
  { key: "quantity", header: "Quantity", width: 14 },
  { key: "price", header: "Price", width: 14 },
  { key: "fee", header: "Fee", width: 12 },
  { key: "notes", header: "Notes", width: 42 }
] as const;

export type TransactionExcelColumnKey = (typeof transactionExcelColumns)[number]["key"];

export type ParsedTransactionExcelRow = {
  rowNumber: number;
  values: Record<TransactionExcelColumnKey, unknown>;
};

export type TransactionExcelParseResult = {
  rows: ParsedTransactionExcelRow[];
};

export class TransactionExcelError extends Error {
  readonly code: "INVALID_WORKBOOK" | "INVALID_TEMPLATE" | "EMPTY_WORKBOOK";

  constructor(code: TransactionExcelError["code"], message: string) {
    super(message);
    this.name = "TransactionExcelError";
    this.code = code;
  }
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatIsoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getExcelSerialDate(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 60000) {
    return null;
  }

  const milliseconds = Math.round((value - 25569) * 86400 * 1000);
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime()) ? null : formatIsoDate(date);
}

function getCellValue(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return formatLocalIsoDate(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if ("result" in value) {
    return value.result ?? null;
  }

  if ("text" in value) {
    return value.text;
  }

  if ("richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }

  return cell.text;
}

function isEmptyValue(value: unknown) {
  return value == null || (typeof value === "string" && value.trim().length === 0);
}

function getHeaderColumnMap(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const columnMap = new Map<string, number>();

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const value = String(getCellValue(cell) ?? "").trim();

    if (value.length > 0) {
      columnMap.set(normalizeHeader(value), columnNumber);
    }
  });

  return columnMap;
}

function getWorksheet(workbook: ExcelJS.Workbook) {
  const worksheet = workbook.getWorksheet(TRANSACTION_EXCEL_SHEET_NAME);

  if (!worksheet) {
    throw new TransactionExcelError(
      "INVALID_TEMPLATE",
      `Workbook must include a "${TRANSACTION_EXCEL_SHEET_NAME}" sheet.`
    );
  }

  return worksheet;
}

function assertTemplateColumns(worksheet: ExcelJS.Worksheet) {
  const headerColumnMap = getHeaderColumnMap(worksheet);
  const missingHeaders = transactionExcelColumns
    .filter((column) => !headerColumnMap.has(normalizeHeader(column.header)))
    .map((column) => column.header);

  if (missingHeaders.length > 0) {
    throw new TransactionExcelError(
      "INVALID_TEMPLATE",
      `Workbook is missing template columns: ${missingHeaders.join(", ")}.`
    );
  }

  return headerColumnMap;
}

function toWorkbookBuffer(buffer: ExcelJS.Buffer) {
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}

export function getTransactionExcelColumns() {
  return transactionExcelColumns;
}

export async function parseTransactionExcelWorkbook(buffer: Buffer): Promise<TransactionExcelParseResult> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (error) {
    throw new TransactionExcelError(
      "INVALID_WORKBOOK",
      error instanceof Error ? error.message : "Workbook could not be read."
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new TransactionExcelError("EMPTY_WORKBOOK", "Workbook does not contain any sheets.");
  }

  const worksheet = getWorksheet(workbook);
  const headerColumnMap = assertTemplateColumns(worksheet);
  const rows: ParsedTransactionExcelRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Object.fromEntries(
      transactionExcelColumns.map((column) => {
        const columnNumber = headerColumnMap.get(normalizeHeader(column.header));
        const cellValue = columnNumber ? getCellValue(row.getCell(columnNumber)) : null;
        const parsedValue =
          column.key === "tradeDate" && typeof cellValue === "number"
            ? getExcelSerialDate(cellValue) ?? cellValue
            : cellValue;

        return [column.key, parsedValue];
      })
    ) as Record<TransactionExcelColumnKey, unknown>;

    if (Object.values(values).every(isEmptyValue)) {
      continue;
    }

    rows.push({ rowNumber, values });
  }

  return { rows };
}

export async function buildTransactionExcelWorkbook(
  transactions: TransactionListItem[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PortfolioTrack";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(TRANSACTION_EXCEL_SHEET_NAME);
  worksheet.columns = transactionExcelColumns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: transactionExcelColumns.length }
  };

  for (const transaction of transactions) {
    worksheet.addRow({
      instrumentId: transaction.instrumentId,
      symbol: transaction.instrument.symbol,
      displayName: transaction.instrument.displayName,
      market: transaction.instrument.market,
      currency: transaction.instrument.currency,
      providerSymbol: transaction.instrument.providerSymbol,
      tradeDate: transaction.tradeDate,
      side: transaction.side,
      quantity: transaction.quantity,
      price: transaction.price,
      fee: transaction.fee,
      notes: transaction.notes ?? ""
    });
  }

  worksheet.getColumn("quantity").numFmt = "0.000000";
  worksheet.getColumn("price").numFmt = "0.0000";
  worksheet.getColumn("fee").numFmt = "0.00";

  return toWorkbookBuffer(await workbook.xlsx.writeBuffer());
}
