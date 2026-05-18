import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { instruments, transactions, type Instrument, type NewTransaction } from "@/lib/db/schema";
import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import {
  applyTransaction,
  calculatePositions,
  sortTransactionsChronologically,
  type InstrumentPosition,
  InsufficientQuantityError,
  type PositionTransaction
} from "@/lib/portfolio/positions";
import {
  buildTransactionExcelWorkbook,
  parseTransactionExcelWorkbook,
  TransactionExcelError,
  type ParsedTransactionExcelRow
} from "@/lib/transactions/excel";
import {
  transactionInputSchema,
  type TransactionBroker,
  type TransactionInput
} from "@/lib/validation/transaction";
import { listTransactions, toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";

export const MAX_TRANSACTION_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_TRANSACTION_IMPORT_ROWS = 5000;

type ImportRowStatus = "ready" | "skipped_duplicate" | "error";

export type TransactionImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  message: string;
  symbol: string | null;
  tradeDate: string | null;
  side: "BUY" | "SELL" | null;
  broker: TransactionBroker | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  notes: string | null;
};

export type TransactionImportPreview = {
  counts: {
    totalRows: number;
    readyRows: number;
    skippedRows: number;
    errorRows: number;
  };
  rows: TransactionImportPreviewRow[];
};

type ReadyImportRow = TransactionImportPreviewRow & {
  status: "ready";
  input: TransactionInput;
  duplicateKey: string;
};

type ImportInstrument = Pick<
  Instrument,
  "id" | "symbol" | "displayName" | "market" | "currency" | "providerSymbol"
>;

type ExistingTransactionRow = Pick<
  typeof transactions.$inferSelect,
  "id" | "instrumentId" | "tradeDate" | "side" | "broker" | "quantity" | "price" | "fee" | "notes" | "createdAt"
>;

type ImportPositionTransaction = PositionTransaction & {
  sourceRowNumber?: number;
};

export class TransactionImportExportError extends Error {
  readonly code:
    | "INVALID_FILE"
    | "INVALID_MODE"
    | "IMPORT_HAS_ERRORS"
    | "IMPORT_TOO_LARGE"
    | "TOO_MANY_ROWS"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: TransactionImportExportError["code"],
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TransactionImportExportError";
    this.code = code;
    this.details = details;
  }
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeLookupValue(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : String(value ?? "").trim().toUpperCase();
}

function getOptionalCellString(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function getOptionalNumber(value: unknown) {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getImportTransactionKey(input: Pick<TransactionInput, "instrumentId" | "tradeDate" | "side" | "broker" | "quantity" | "price" | "fee" | "notes">) {
  return [
    input.instrumentId,
    input.tradeDate,
    input.side,
    input.broker ?? "DIME",
    normalizeQuantity(input.quantity),
    normalizePrice(input.price),
    normalizeMoney(input.fee),
    input.notes ?? ""
  ].join("|");
}

function getErrorMessage(error: unknown) {
  if (error instanceof TransactionExcelError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Excel file could not be imported.";
}

function getValidationMessage(error: ReturnType<typeof transactionInputSchema.safeParse>) {
  if (error.success) {
    return null;
  }

  const flattened = error.error.flatten();
  const fieldError = Object.values(flattened.fieldErrors)
    .flatMap((messages) => messages ?? [])
    .find(Boolean);
  const formError = flattened.formErrors.find(Boolean);

  return fieldError ?? formError ?? "Transaction row is invalid.";
}

function resolveInstrument(row: ParsedTransactionExcelRow, instrumentById: Map<number, ImportInstrument>, instrumentByProviderSymbol: Map<string, ImportInstrument>, instrumentBySymbol: Map<string, ImportInstrument>) {
  const instrumentIdValue = row.values.instrumentId;
  const normalizedInstrumentId =
    instrumentIdValue == null || String(instrumentIdValue).trim().length === 0
      ? null
      : Number(instrumentIdValue);

  if (normalizedInstrumentId != null) {
    if (!Number.isInteger(normalizedInstrumentId) || normalizedInstrumentId <= 0) {
      return { instrument: null, error: "Instrument ID must be a positive integer." };
    }

    const instrument = instrumentById.get(normalizedInstrumentId);
    return instrument
      ? { instrument, error: null }
      : { instrument: null, error: `Instrument ID ${normalizedInstrumentId} was not found.` };
  }

  const providerSymbol = normalizeLookupValue(row.values.providerSymbol);

  if (providerSymbol.length > 0) {
    const instrument = instrumentByProviderSymbol.get(providerSymbol);

    if (instrument) {
      return { instrument, error: null };
    }
  }

  const symbol = normalizeLookupValue(row.values.symbol);

  if (symbol.length > 0) {
    const instrument = instrumentBySymbol.get(symbol);

    if (instrument) {
      return { instrument, error: null };
    }
  }

  return {
    instrument: null,
    error: providerSymbol || symbol ? "Instrument was not found." : "Instrument ID, provider symbol, or symbol is required."
  };
}

async function getImportContext(portfolioId: number) {
  const instrumentRows = db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      displayName: instruments.displayName,
      market: instruments.market,
      currency: instruments.currency,
      providerSymbol: instruments.providerSymbol
    })
    .from(instruments)
    .orderBy(asc(instruments.symbol));

  const transactionRows = db
    .select({
      id: transactions.id,
      instrumentId: transactions.instrumentId,
      tradeDate: transactions.tradeDate,
      side: transactions.side,
      broker: transactions.broker,
      quantity: transactions.quantity,
      price: transactions.price,
      fee: transactions.fee,
      notes: transactions.notes,
      createdAt: transactions.createdAt
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

  return {
    instruments: await instrumentRows,
    transactions: await transactionRows
  };
}

function createEmptyPosition(instrumentId: number): InstrumentPosition {
  return {
    instrumentId,
    quantity: 0,
    averageCost: 0,
    totalCost: 0,
    realizedPnl: 0,
    totalFees: 0
  };
}

function getPositionValidationErrors(
  existingRows: ExistingTransactionRow[],
  readyRows: ReadyImportRow[]
) {
  const errors = new Map<number, string>();
  const importedTransactions: ImportPositionTransaction[] = readyRows.map((row, index) => ({
    instrumentId: row.input.instrumentId,
    tradeDate: row.input.tradeDate,
    side: row.input.side,
    quantity: row.input.quantity,
    price: row.input.price,
    fee: row.input.fee,
    createdAt: "9999-12-31 23:59:59",
    id: Number.MAX_SAFE_INTEGER - readyRows.length + index,
    sourceRowNumber: row.rowNumber
  }));
  const orderedTransactions = sortTransactionsChronologically<ImportPositionTransaction>([
    ...existingRows.map(toChronologicalPositionTransaction),
    ...importedTransactions
  ]);
  const positions = new Map<number, InstrumentPosition>();

  for (const transaction of orderedTransactions) {
    const position =
      positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

    try {
      applyTransaction(position, transaction);
      positions.set(transaction.instrumentId, position);
    } catch (error) {
      if (error instanceof InsufficientQuantityError && transaction.sourceRowNumber != null) {
        errors.set(
          transaction.sourceRowNumber,
          `Sell quantity exceeds holdings. Available quantity is ${normalizeQuantity(error.availableQuantity)}.`
        );
        continue;
      }

      throw error;
    }
  }

  return errors;
}

async function buildEvaluation(parsedRows: ParsedTransactionExcelRow[], portfolioId: number) {
  if (parsedRows.length > MAX_TRANSACTION_IMPORT_ROWS) {
    throw new TransactionImportExportError(
      "TOO_MANY_ROWS",
      `Import files can contain at most ${MAX_TRANSACTION_IMPORT_ROWS} rows.`
    );
  }

  const context = await getImportContext(portfolioId);
  const instrumentById = new Map(context.instruments.map((instrument) => [instrument.id, instrument]));
  const instrumentByProviderSymbol = new Map(
    context.instruments.map((instrument) => [normalizeLookupValue(instrument.providerSymbol), instrument])
  );
  const instrumentBySymbol = new Map(
    context.instruments.map((instrument) => [normalizeLookupValue(instrument.symbol), instrument])
  );
  const duplicateKeys = new Set(
    context.transactions.map((transaction) =>
      getImportTransactionKey({
        ...transaction,
        side: transaction.side as "BUY" | "SELL",
        broker: transaction.broker as TransactionBroker
      })
    )
  );
  const rows: TransactionImportPreviewRow[] = [];
  const readyRows: ReadyImportRow[] = [];

  for (const row of parsedRows) {
    const { instrument, error: instrumentError } = resolveInstrument(
      row,
      instrumentById,
      instrumentByProviderSymbol,
      instrumentBySymbol
    );
    const basePreview = {
      rowNumber: row.rowNumber,
      symbol: (instrument?.symbol ?? getOptionalCellString(row.values.symbol)) || null,
      tradeDate: getOptionalCellString(row.values.tradeDate) || null,
      side: normalizeLookupValue(row.values.side) === "BUY" || normalizeLookupValue(row.values.side) === "SELL"
        ? (normalizeLookupValue(row.values.side) as "BUY" | "SELL")
        : null,
      broker: normalizeLookupValue(row.values.broker) === "DIME" || normalizeLookupValue(row.values.broker) === "WEBULL"
        ? (normalizeLookupValue(row.values.broker) as TransactionBroker)
        : null,
      quantity: getOptionalNumber(row.values.quantity),
      price: getOptionalNumber(row.values.price),
      fee: getOptionalNumber(row.values.fee),
      notes: getOptionalCellString(row.values.notes) || null
    };

    if (!instrument || instrumentError) {
      rows.push({
        ...basePreview,
        status: "error",
        message: instrumentError ?? "Instrument was not found."
      });
      continue;
    }

    const parsedInput = transactionInputSchema.safeParse({
      instrumentId: instrument.id,
      tradeDate: getOptionalCellString(row.values.tradeDate),
      side: row.values.side,
      broker: getOptionalCellString(row.values.broker).length > 0 ? row.values.broker : undefined,
      quantity: row.values.quantity,
      price: row.values.price,
      fee: getOptionalCellString(row.values.fee).length > 0 ? row.values.fee : 0,
      notes: row.values.notes
    });
    const validationMessage = getValidationMessage(parsedInput);

    if (!parsedInput.success || validationMessage) {
      rows.push({
        ...basePreview,
        status: "error",
        message: validationMessage ?? "Transaction row is invalid."
      });
      continue;
    }

    const duplicateKey = getImportTransactionKey(parsedInput.data);

    if (duplicateKeys.has(duplicateKey)) {
      rows.push({
        rowNumber: row.rowNumber,
        status: "skipped_duplicate",
        message: "Duplicate transaction was skipped.",
        symbol: instrument.symbol,
        tradeDate: parsedInput.data.tradeDate,
        side: parsedInput.data.side,
        broker: parsedInput.data.broker ?? "DIME",
        quantity: parsedInput.data.quantity,
        price: parsedInput.data.price,
        fee: parsedInput.data.fee,
        notes: parsedInput.data.notes
      });
      continue;
    }

    duplicateKeys.add(duplicateKey);
    readyRows.push({
      rowNumber: row.rowNumber,
      status: "ready",
      message: "Ready to import.",
      symbol: instrument.symbol,
      tradeDate: parsedInput.data.tradeDate,
      side: parsedInput.data.side,
      broker: parsedInput.data.broker ?? "DIME",
      quantity: parsedInput.data.quantity,
      price: parsedInput.data.price,
      fee: parsedInput.data.fee,
      notes: parsedInput.data.notes,
      input: parsedInput.data,
      duplicateKey
    });
  }

  const positionErrors = getPositionValidationErrors(context.transactions, readyRows);
  const validatedReadyRows = readyRows.filter((row) => {
    const positionError = positionErrors.get(row.rowNumber);

    if (!positionError) {
      return true;
    }

    rows.push({
      rowNumber: row.rowNumber,
      status: "error",
      message: positionError,
      symbol: row.symbol,
      tradeDate: row.tradeDate,
      side: row.side,
      broker: row.broker,
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      notes: row.notes
    });

    return false;
  });

  rows.push(...validatedReadyRows);
  rows.sort((left, right) => left.rowNumber - right.rowNumber);

  const preview = {
    counts: {
      totalRows: parsedRows.length,
      readyRows: validatedReadyRows.length,
      skippedRows: rows.filter((row) => row.status === "skipped_duplicate").length,
      errorRows: rows.filter((row) => row.status === "error").length
    },
    rows
  };

  return {
    ...preview,
    readyRows: validatedReadyRows
  };
}

async function parseImportBuffer(buffer: Buffer) {
  try {
    return await parseTransactionExcelWorkbook(buffer);
  } catch (error) {
    throw new TransactionImportExportError("INVALID_FILE", getErrorMessage(error));
  }
}

function buildInsertValue(input: TransactionInput, portfolioId: number): NewTransaction {
  return {
    portfolioId,
    instrumentId: input.instrumentId,
    tradeDate: input.tradeDate,
    side: input.side,
    broker: input.broker ?? "DIME",
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    notes: input.notes
  };
}

export async function buildTransactionExport({
  portfolioId: portfolioIdInput,
  template = false
}: {
  portfolioId: number;
  template?: boolean;
}) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const transactionRows = template ? [] : await listTransactions({ portfolioId, order: "asc" });
  const buffer = await buildTransactionExcelWorkbook(transactionRows);
  const fileName = template
    ? "PortfolioTrack-transaction-template.xlsx"
    : `PortfolioTrack-transactions-${getTodayIsoDate()}.xlsx`;

  return {
    buffer,
    fileName
  };
}

export async function previewTransactionImport(
  buffer: Buffer,
  { portfolioId: portfolioIdInput }: { portfolioId: number }
): Promise<TransactionImportPreview> {
  const portfolioId = parsePortfolioId(portfolioIdInput);

  if (buffer.byteLength > MAX_TRANSACTION_IMPORT_FILE_SIZE) {
    throw new TransactionImportExportError("IMPORT_TOO_LARGE", "Import file must be 5MB or smaller.");
  }

  const parsedWorkbook = await parseImportBuffer(buffer);
  const evaluation = await buildEvaluation(parsedWorkbook.rows, portfolioId);

  return {
    counts: evaluation.counts,
    rows: evaluation.rows
  };
}

export async function commitTransactionImport(
  buffer: Buffer,
  { portfolioId: portfolioIdInput }: { portfolioId: number }
): Promise<TransactionImportPreview> {
  const portfolioId = parsePortfolioId(portfolioIdInput);

  if (buffer.byteLength > MAX_TRANSACTION_IMPORT_FILE_SIZE) {
    throw new TransactionImportExportError("IMPORT_TOO_LARGE", "Import file must be 5MB or smaller.");
  }

  const parsedWorkbook = await parseImportBuffer(buffer);
  const evaluation = await buildEvaluation(parsedWorkbook.rows, portfolioId);

  if (evaluation.counts.errorRows > 0) {
    throw new TransactionImportExportError(
      "IMPORT_HAS_ERRORS",
      "Import has row errors. Fix the file and preview again before importing.",
      { preview: evaluation }
    );
  }

  await db.transaction(async (tx) => {
    const currentRows = await tx
      .select({
        id: transactions.id,
        instrumentId: transactions.instrumentId,
        tradeDate: transactions.tradeDate,
        side: transactions.side,
        quantity: transactions.quantity,
        price: transactions.price,
        fee: transactions.fee,
        createdAt: transactions.createdAt
      })
      .from(transactions)
      .where(eq(transactions.portfolioId, portfolioId))
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

    calculatePositions([
      ...currentRows.map(toChronologicalPositionTransaction),
      ...evaluation.readyRows.map((row, index) => ({
        instrumentId: row.input.instrumentId,
        tradeDate: row.input.tradeDate,
        side: row.input.side,
        quantity: row.input.quantity,
        price: row.input.price,
        fee: row.input.fee,
        createdAt: "9999-12-31 23:59:59",
        id: Number.MAX_SAFE_INTEGER - evaluation.readyRows.length + index
      }))
    ]);

    if (evaluation.readyRows.length > 0) {
      await tx.insert(transactions).values(
        evaluation.readyRows.map((row) => buildInsertValue(row.input, portfolioId))
      );
    }
  });

  return {
    counts: evaluation.counts,
    rows: evaluation.rows
  };
}
