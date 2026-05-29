import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { instruments, transactions } from "@/lib/db/schema";
import { type ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import { transactionInputSchema } from "@/lib/validation/transaction";
import { getImportPositionValidationErrors } from "@/server/transaction-import-export/position-validation";
import { resolveImportInstrument } from "@/server/transaction-import-export/instrument-resolution";
import {
  buildBaseImportPreviewRow,
  buildDuplicateImportKeys,
  buildDuplicateImportPreviewRow,
  buildImportEvaluationPreview,
  buildImportInstrumentLookupMaps,
  buildReadyImportPreviewRow,
} from "@/server/transaction-import-export/evaluation-helpers";
import {
  getImportTransactionKey,
  getOptionalCellString,
  getValidationMessage,
  parseInstrumentAction,
} from "@/server/transaction-import-export/import-helpers";
import { TransactionImportExportError } from "@/server/transaction-import-export/errors";
import { buildCreateInstrument } from "@/server/transaction-import-export/instrument-create";
import type {
  ImportTransactionInput,
  PreparedPendingImportInstrument,
  ReadyImportRow,
  ResolvedImportInstrument,
  TransactionImportPreview,
  TransactionImportPreviewRow,
} from "@/server/transaction-import-export/types";

export const MAX_TRANSACTION_IMPORT_ROWS = 5000;

export type TransactionImportEvaluation = TransactionImportPreview & {
  readyRows: ReadyImportRow[];
};

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

export async function buildEvaluation(
  parsedRows: ParsedTransactionExcelRow[],
  portfolioId: number,
): Promise<TransactionImportEvaluation> {
  if (parsedRows.length > MAX_TRANSACTION_IMPORT_ROWS) {
    throw new TransactionImportExportError(
      "TOO_MANY_ROWS",
      `Import files can contain at most ${MAX_TRANSACTION_IMPORT_ROWS} rows.`,
    );
  }

  const context = await getImportContext(portfolioId);
  const { instrumentById, instrumentByProviderSymbol, instrumentBySymbol } =
    buildImportInstrumentLookupMaps(context.instruments);
  const duplicateKeys = buildDuplicateImportKeys(context.transactions);
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

    const basePreview = buildBaseImportPreviewRow(row, resolvedInstrument);

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
      rows.push(
        buildDuplicateImportPreviewRow({
          input: importInput,
          resolvedInstrument,
          rowNumber: row.rowNumber,
        }),
      );
      continue;
    }

    duplicateKeys.add(duplicateKey);
    readyRows.push(
      buildReadyImportPreviewRow({
        createInstrumentInput:
          resolvedInstrument.id == null ? resolvedInstrument.createInstrumentInput : undefined,
        duplicateKey,
        input: importInput,
        instrumentKey,
        resolvedInstrument,
        rowNumber: row.rowNumber,
      }),
    );
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

  const preview = buildImportEvaluationPreview({
    parsedRowsCount: parsedRows.length,
    readyRows: validatedReadyRows,
    rows,
  });

  return {
    ...preview,
    readyRows: validatedReadyRows,
  };
}
