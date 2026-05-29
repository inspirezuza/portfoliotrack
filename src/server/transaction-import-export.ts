import "server-only";

import { asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { instruments, transactions } from "@/lib/db/schema";
import { calculatePositions } from "@/lib/portfolio/positions";
import {
  buildTransactionExcelWorkbook,
  parseTransactionExcelWorkbook,
} from "@/lib/transactions/excel";
import type { InstrumentInput } from "@/lib/validation/instrument";
import { listTransactions, toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";
import { buildEvaluation } from "@/server/transaction-import-export/evaluation";
import { getErrorMessage } from "@/server/transaction-import-export/import-helpers";
import {
  buildFinalImportInput,
  buildInstrumentInsertValue,
  buildTransactionInsertValue,
} from "@/server/transaction-import-export/commit-helpers";
import { buildTransactionExportFileName } from "@/server/transaction-import-export/export-helpers";
import { TransactionImportExportError } from "@/server/transaction-import-export/errors";
import type { TransactionImportPreview } from "@/server/transaction-import-export/types";

export { TransactionImportExportError } from "@/server/transaction-import-export/errors";
export { MAX_TRANSACTION_IMPORT_ROWS } from "@/server/transaction-import-export/evaluation";
export type {
  TransactionImportPreview,
  TransactionImportPreviewRow,
} from "@/server/transaction-import-export/types";

export const MAX_TRANSACTION_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

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
  const fileName = buildTransactionExportFileName({ template });

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
