import "server-only";

import { asc, eq, or } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { withOperationTimeout } from "@/lib/async/timeout";
import { db } from "@/lib/db/runtime";
import { instruments, transactions } from "@/lib/db/schema";
import {
  getInstrumentTypeFromYahooQuoteType,
  normalizeInstrumentType,
} from "@/lib/instruments/instrument-types";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { calculatePositions } from "@/lib/portfolio/positions";
import {
  buildTransactionExcelWorkbook,
  parseTransactionExcelWorkbook,
  type ParsedTransactionExcelRow,
} from "@/lib/transactions/excel";
import { instrumentInputSchema, type InstrumentInput } from "@/lib/validation/instrument";
import {
  transactionInputSchema,
  type TransactionBroker,
  type TransactionInput,
} from "@/lib/validation/transaction";
import { listTransactions, toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";
import { getImportPositionValidationErrors } from "@/server/transaction-import-export/position-validation";
import {
  resolveImportInstrument,
  type ImportInstrument,
} from "@/server/transaction-import-export/instrument-resolution";
import {
  getCreateInstrumentKey,
  getErrorMessage,
  getFallbackInstrumentInput,
  getImportTransactionKey,
  getMarket,
  getOptionalCellString,
  getOptionalNumber,
  getProviderSymbolCandidates,
  getValidationMessage,
  normalizeDisplaySymbol,
  normalizeLookupValue,
  parseInstrumentAction,
} from "@/server/transaction-import-export/import-helpers";
import {
  buildFinalImportInput,
  buildInstrumentInsertValue,
  buildTransactionInsertValue,
} from "@/server/transaction-import-export/commit-helpers";
import { TransactionImportExportError } from "@/server/transaction-import-export/errors";

export { TransactionImportExportError } from "@/server/transaction-import-export/errors";

export const MAX_TRANSACTION_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_TRANSACTION_IMPORT_ROWS = 5000;
const INSTRUMENT_CREATE_QUOTE_TIMEOUT_MS = 4000;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

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
  input: ImportTransactionInput;
  duplicateKey: string;
  instrumentKey: string;
  positionInstrumentId: number;
  createInstrumentInput?: InstrumentInput;
  createInstrumentKey?: string;
};

type PendingImportInstrument = Omit<ImportInstrument, "id"> & {
  id: null;
  createInstrumentInput: InstrumentInput;
  createInstrumentKey: string;
  positionInstrumentId: null;
};

type PreparedPendingImportInstrument = Omit<PendingImportInstrument, "positionInstrumentId"> & {
  positionInstrumentId: number;
};

type ResolvedImportInstrument = ImportInstrument | PreparedPendingImportInstrument;

type ImportTransactionInput = Omit<TransactionInput, "instrumentId"> & {
  instrumentId: number | null;
};

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function getYahooInstrumentInput({
  symbol,
  displayName,
  market,
  instrumentType,
  currency,
  providerSymbol,
}: {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
}): Promise<InstrumentInput | null> {
  for (const candidateProviderSymbol of getProviderSymbolCandidates({
    symbol,
    providerSymbol,
    market,
  })) {
    try {
      const quote = await withOperationTimeout(
        yahooFinance.quote(candidateProviderSymbol, {
          fields: [
            "symbol",
            "currency",
            "exchange",
            "market",
            "quoteType",
            "shortName",
            "longName",
          ],
        }),
        {
          label: `Yahoo instrument create quote ${candidateProviderSymbol}`,
          timeoutMs: INSTRUMENT_CREATE_QUOTE_TIMEOUT_MS,
        },
      );

      if (!quote.symbol || !quote.currency) {
        continue;
      }

      const resolvedSymbol = normalizeDisplaySymbol(symbol || quote.symbol);
      const knownDrMetadata = getKnownDrMetadata({
        symbol: resolvedSymbol,
        providerSymbol: quote.symbol,
      });

      return {
        symbol: resolvedSymbol,
        displayName: displayName || quote.longName || quote.shortName || resolvedSymbol,
        market: market || getMarket(quote.symbol, quote.exchange, quote.market),
        instrumentType:
          normalizeInstrumentType(instrumentType) ||
          knownDrMetadata?.instrumentType ||
          getInstrumentTypeFromYahooQuoteType(quote.quoteType),
        currency: currency || quote.currency,
        providerSymbol: quote.symbol.toUpperCase(),
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function buildCreateInstrument(row: ParsedTransactionExcelRow) {
  const symbol = getOptionalCellString(row.values.symbol);
  const providerSymbol = getOptionalCellString(row.values.providerSymbol);

  if (symbol.length === 0 && providerSymbol.length === 0) {
    return {
      instrument: null,
      error: "Symbol or Provider Symbol is required when Instrument Action is CREATE.",
    };
  }

  const baseInput = {
    symbol: symbol || providerSymbol,
    displayName: getOptionalCellString(row.values.displayName),
    market: normalizeLookupValue(row.values.market),
    instrumentType: normalizeLookupValue(row.values.instrumentType),
    currency: normalizeLookupValue(row.values.currency),
    providerSymbol,
  };
  const yahooInput = await getYahooInstrumentInput(baseInput);
  const parsedInput = instrumentInputSchema.safeParse(
    yahooInput ?? getFallbackInstrumentInput(baseInput),
  );

  if (!parsedInput.success) {
    const fieldError = Object.values(parsedInput.error.flatten().fieldErrors)
      .flatMap((messages) => messages ?? [])
      .find(Boolean);

    return {
      instrument: null,
      error: fieldError ?? "New instrument input is invalid.",
    };
  }

  const createInstrumentKey = getCreateInstrumentKey(parsedInput.data);

  return {
    instrument: {
      id: null,
      symbol: parsedInput.data.symbol,
      displayName: parsedInput.data.displayName,
      market: parsedInput.data.market,
      instrumentType: parsedInput.data.instrumentType,
      currency: parsedInput.data.currency,
      providerSymbol: parsedInput.data.providerSymbol,
      createInstrumentInput: parsedInput.data,
      createInstrumentKey,
      positionInstrumentId: null,
    } satisfies PendingImportInstrument,
    error: null,
  };
}

async function getImportContext(portfolioId: number) {
  const instrumentRows = db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      displayName: instruments.displayName,
      market: instruments.market,
      instrumentType: instruments.instrumentType,
      currency: instruments.currency,
      providerSymbol: instruments.providerSymbol,
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
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

  return {
    instruments: await instrumentRows,
    transactions: await transactionRows,
  };
}

async function buildEvaluation(parsedRows: ParsedTransactionExcelRow[], portfolioId: number) {
  if (parsedRows.length > MAX_TRANSACTION_IMPORT_ROWS) {
    throw new TransactionImportExportError(
      "TOO_MANY_ROWS",
      `Import files can contain at most ${MAX_TRANSACTION_IMPORT_ROWS} rows.`,
    );
  }

  const context = await getImportContext(portfolioId);
  const instrumentById = new Map(
    context.instruments.map((instrument) => [instrument.id, instrument]),
  );
  const instrumentByProviderSymbol = new Map(
    context.instruments.map((instrument) => [
      normalizeLookupValue(instrument.providerSymbol),
      instrument,
    ]),
  );
  const instrumentBySymbol = new Map(
    context.instruments.map((instrument) => [normalizeLookupValue(instrument.symbol), instrument]),
  );
  const duplicateKeys = new Set(
    context.transactions.map((transaction) =>
      getImportTransactionKey(
        {
          ...transaction,
          side: transaction.side as "BUY" | "SELL",
          broker: transaction.broker as TransactionBroker,
        },
        transaction.instrumentId,
      ),
    ),
  );
  const rows: TransactionImportPreviewRow[] = [];
  const readyRows: ReadyImportRow[] = [];
  const pendingInstrumentsByKey = new Map<string, PreparedPendingImportInstrument>();

  for (const row of parsedRows) {
    const { action, error: actionError } = parseInstrumentAction(row);
    const existingInstrumentResult = resolveImportInstrument(
      row,
      instrumentById,
      instrumentByProviderSymbol,
      instrumentBySymbol,
    );
    let resolvedInstrument: ResolvedImportInstrument | null = existingInstrumentResult.instrument;
    let instrumentError = existingInstrumentResult.error;

    if (!resolvedInstrument && !instrumentError && action === "CREATE") {
      const createInstrumentResult = await buildCreateInstrument(row);

      if (createInstrumentResult.instrument) {
        const existingPendingInstrument = pendingInstrumentsByKey.get(
          createInstrumentResult.instrument.createInstrumentKey,
        );
        const pendingInstrument =
          existingPendingInstrument ??
          ({
            ...createInstrumentResult.instrument,
            positionInstrumentId: -(pendingInstrumentsByKey.size + 1),
          } satisfies PreparedPendingImportInstrument);

        resolvedInstrument = pendingInstrument;
        pendingInstrumentsByKey.set(pendingInstrument.createInstrumentKey, pendingInstrument);
        instrumentError = null;
      } else {
        instrumentError = createInstrumentResult.error;
      }
    }

    const basePreview = {
      rowNumber: row.rowNumber,
      symbol: (resolvedInstrument?.symbol ?? getOptionalCellString(row.values.symbol)) || null,
      tradeDate: getOptionalCellString(row.values.tradeDate) || null,
      side:
        normalizeLookupValue(row.values.side) === "BUY" ||
        normalizeLookupValue(row.values.side) === "SELL"
          ? (normalizeLookupValue(row.values.side) as "BUY" | "SELL")
          : null,
      broker:
        normalizeLookupValue(row.values.broker) === "DIME" ||
        normalizeLookupValue(row.values.broker) === "WEBULL"
          ? (normalizeLookupValue(row.values.broker) as TransactionBroker)
          : null,
      quantity: getOptionalNumber(row.values.quantity),
      price: getOptionalNumber(row.values.price),
      fee: getOptionalNumber(row.values.fee),
      notes: getOptionalCellString(row.values.notes) || null,
    };

    if (actionError) {
      rows.push({
        ...basePreview,
        status: "error",
        message: actionError,
      });
      continue;
    }

    if (!resolvedInstrument || instrumentError) {
      rows.push({
        ...basePreview,
        status: "error",
        message:
          instrumentError ??
          "Instrument was not found. Use Instrument Action CREATE to create it from Symbol.",
      });
      continue;
    }

    const validationInstrumentId =
      resolvedInstrument.id ?? Math.abs(resolvedInstrument.positionInstrumentId);
    const parsedInput = transactionInputSchema.safeParse({
      instrumentId: validationInstrumentId,
      tradeDate: getOptionalCellString(row.values.tradeDate),
      side: row.values.side,
      broker: getOptionalCellString(row.values.broker).length > 0 ? row.values.broker : undefined,
      quantity: row.values.quantity,
      price: row.values.price,
      fee: getOptionalCellString(row.values.fee).length > 0 ? row.values.fee : 0,
      notes: row.values.notes,
    });
    const validationMessage = getValidationMessage(parsedInput);

    if (!parsedInput.success || validationMessage) {
      rows.push({
        ...basePreview,
        status: "error",
        message: validationMessage ?? "Transaction row is invalid.",
      });
      continue;
    }

    const importInput: ImportTransactionInput = {
      ...parsedInput.data,
      instrumentId: resolvedInstrument.id,
    };
    const instrumentKey =
      resolvedInstrument.id == null
        ? `create:${resolvedInstrument.createInstrumentKey}`
        : String(resolvedInstrument.id);
    const duplicateKey = getImportTransactionKey(importInput, instrumentKey);

    if (duplicateKeys.has(duplicateKey)) {
      rows.push({
        rowNumber: row.rowNumber,
        status: "skipped_duplicate",
        message: "Duplicate transaction was skipped.",
        symbol: resolvedInstrument.symbol,
        tradeDate: parsedInput.data.tradeDate,
        side: parsedInput.data.side,
        broker: parsedInput.data.broker ?? "DIME",
        quantity: parsedInput.data.quantity,
        price: parsedInput.data.price,
        fee: parsedInput.data.fee,
        notes: parsedInput.data.notes,
      });
      continue;
    }

    duplicateKeys.add(duplicateKey);
    readyRows.push({
      rowNumber: row.rowNumber,
      status: "ready",
      message:
        resolvedInstrument.id == null
          ? `Ready to import. ${resolvedInstrument.symbol} will be created.`
          : "Ready to import.",
      symbol: resolvedInstrument.symbol,
      tradeDate: parsedInput.data.tradeDate,
      side: parsedInput.data.side,
      broker: parsedInput.data.broker ?? "DIME",
      quantity: parsedInput.data.quantity,
      price: parsedInput.data.price,
      fee: parsedInput.data.fee,
      notes: parsedInput.data.notes,
      input: importInput,
      duplicateKey,
      instrumentKey,
      positionInstrumentId: resolvedInstrument.id ?? resolvedInstrument.positionInstrumentId,
      createInstrumentInput:
        resolvedInstrument.id == null ? resolvedInstrument.createInstrumentInput : undefined,
      createInstrumentKey:
        resolvedInstrument.id == null ? resolvedInstrument.createInstrumentKey : undefined,
    });
  }

  const positionErrors = getImportPositionValidationErrors(
    context.transactions.map((transaction) => ({
      ...transaction,
      side: transaction.side as "BUY" | "SELL",
    })),
    readyRows.map((row) => ({
      instrumentId: row.positionInstrumentId,
      tradeDate: row.input.tradeDate,
      side: row.input.side,
      quantity: row.input.quantity,
      price: row.input.price,
      fee: row.input.fee,
      rowNumber: row.rowNumber,
    })),
  );
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
      notes: row.notes,
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
      errorRows: rows.filter((row) => row.status === "error").length,
    },
    rows,
  };

  return {
    ...preview,
    readyRows: validatedReadyRows,
  };
}

async function parseImportBuffer(buffer: Buffer) {
  try {
    return await parseTransactionExcelWorkbook(buffer);
  } catch (error) {
    throw new TransactionImportExportError("INVALID_FILE", getErrorMessage(error));
  }
}

export async function buildTransactionExport({
  portfolioId: portfolioIdInput,
  template = false,
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
    fileName,
  };
}

export async function previewTransactionImport(
  buffer: Buffer,
  { portfolioId: portfolioIdInput }: { portfolioId: number },
): Promise<TransactionImportPreview> {
  const portfolioId = parsePortfolioId(portfolioIdInput);

  if (buffer.byteLength > MAX_TRANSACTION_IMPORT_FILE_SIZE) {
    throw new TransactionImportExportError(
      "IMPORT_TOO_LARGE",
      "Import file must be 5MB or smaller.",
    );
  }

  const parsedWorkbook = await parseImportBuffer(buffer);
  const evaluation = await buildEvaluation(parsedWorkbook.rows, portfolioId);

  return {
    counts: evaluation.counts,
    rows: evaluation.rows,
  };
}

export async function commitTransactionImport(
  buffer: Buffer,
  { portfolioId: portfolioIdInput }: { portfolioId: number },
): Promise<TransactionImportPreview> {
  const portfolioId = parsePortfolioId(portfolioIdInput);

  if (buffer.byteLength > MAX_TRANSACTION_IMPORT_FILE_SIZE) {
    throw new TransactionImportExportError(
      "IMPORT_TOO_LARGE",
      "Import file must be 5MB or smaller.",
    );
  }

  const parsedWorkbook = await parseImportBuffer(buffer);
  const evaluation = await buildEvaluation(parsedWorkbook.rows, portfolioId);

  if (evaluation.counts.errorRows > 0) {
    throw new TransactionImportExportError(
      "IMPORT_HAS_ERRORS",
      "Import has row errors. Fix the file and preview again before importing.",
      { preview: evaluation },
    );
  }

  await db.transaction(async (tx) => {
    const createdInstrumentIds = new Map<string, number>();
    const pendingInstrumentInputs = new Map<string, InstrumentInput>();

    for (const row of evaluation.readyRows) {
      if (row.createInstrumentKey != null && row.createInstrumentInput != null) {
        pendingInstrumentInputs.set(row.createInstrumentKey, row.createInstrumentInput);
      }
    }

    for (const [createInstrumentKey, input] of pendingInstrumentInputs) {
      const [existingInstrument] = await tx
        .select({ id: instruments.id })
        .from(instruments)
        .where(
          or(
            eq(instruments.symbol, input.symbol),
            eq(instruments.providerSymbol, input.providerSymbol),
          ),
        )
        .limit(1);

      if (existingInstrument) {
        createdInstrumentIds.set(createInstrumentKey, existingInstrument.id);
        continue;
      }

      const [insertedInstrument] = await tx
        .insert(instruments)
        .values(buildInstrumentInsertValue(input))
        .returning({ id: instruments.id });

      if (!insertedInstrument) {
        throw new TransactionImportExportError(
          "INTERNAL_ERROR",
          `Instrument ${input.symbol} could not be created.`,
        );
      }

      createdInstrumentIds.set(createInstrumentKey, insertedInstrument.id);
    }

    const readyInputs = evaluation.readyRows.map((row) =>
      buildFinalImportInput(row, createdInstrumentIds),
    );
    const currentRows = await tx
      .select({
        id: transactions.id,
        instrumentId: transactions.instrumentId,
        tradeDate: transactions.tradeDate,
        side: transactions.side,
        quantity: transactions.quantity,
        price: transactions.price,
        fee: transactions.fee,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(eq(transactions.portfolioId, portfolioId))
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

    calculatePositions([
      ...currentRows.map(toChronologicalPositionTransaction),
      ...readyInputs.map((input, index) => ({
        instrumentId: input.instrumentId,
        tradeDate: input.tradeDate,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        fee: input.fee,
        createdAt: "9999-12-31 23:59:59",
        id: Number.MAX_SAFE_INTEGER - readyInputs.length + index,
      })),
    ]);

    if (readyInputs.length > 0) {
      await tx
        .insert(transactions)
        .values(readyInputs.map((input) => buildTransactionInsertValue(input, portfolioId)));
    }
  });

  return {
    counts: evaluation.counts,
    rows: evaluation.rows,
  };
}
