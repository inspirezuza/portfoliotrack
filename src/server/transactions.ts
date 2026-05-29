import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { instruments, portfolios, transactions } from "@/lib/db/schema";
import { parsePortfolioId } from "@/server/portfolios";
import { mapTransactionListItem } from "@/server/transactions/mappers";
import { buildTransactionWorkspaceModel } from "@/server/transactions/workspace";
export type {
  TransactionInstrumentOption,
  TransactionListItem,
} from "@/server/transactions/mappers";
export { InstrumentServiceError, TransactionServiceError } from "@/server/transactions/errors";
export {
  createInstrument,
  listSelectableTransactionInstrumentOptions,
  listTransactionInstrumentOptions,
} from "@/server/transactions/instruments";
export { isTransactionInstrumentSelectable } from "@/server/transactions/mappers";
export { toChronologicalPositionTransaction } from "@/server/transactions/position-validation";
export {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/server/transactions/mutations";

export type TransactionListOrder = "asc" | "desc";

function getTransactionOrder(order: TransactionListOrder) {
  if (order === "asc") {
    return [
      asc(transactions.tradeDate),
      asc(transactions.createdAt),
      asc(transactions.id),
    ] as const;
  }

  return [
    desc(transactions.tradeDate),
    desc(transactions.createdAt),
    desc(transactions.id),
  ] as const;
}

export async function listTransactions({
  portfolioId: portfolioIdInput,
  instrumentId,
  order = "desc",
}: {
  portfolioId: number;
  instrumentId?: number;
  order?: TransactionListOrder;
}) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const query = db
    .select({
      transaction: transactions,
      instrument: instruments,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id));

  const rows =
    instrumentId == null
      ? await query
          .where(eq(transactions.portfolioId, portfolioId))
          .orderBy(...getTransactionOrder(order))
      : await query
          .where(
            and(
              eq(transactions.portfolioId, portfolioId),
              eq(transactions.instrumentId, instrumentId),
            ),
          )
          .orderBy(...getTransactionOrder(order));

  return rows.map(mapTransactionListItem);
}

export async function getTransactionWorkspace({
  editTransactionId,
  portfolioId: portfolioIdInput,
}: {
  editTransactionId: number | null;
  portfolioId: number;
}) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const [transactionRows, instrumentRows] = await Promise.all([
    db
      .select({
        transaction: transactions,
        instrument: instruments,
      })
      .from(transactions)
      .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
      .where(eq(transactions.portfolioId, portfolioId))
      .orderBy(...getTransactionOrder("desc")),
    db.select().from(instruments).orderBy(asc(instruments.symbol)),
  ]);

  return buildTransactionWorkspaceModel({
    editTransactionId,
    includeEditingInstrumentInForm: true,
    instrumentRows,
    transactionRows,
  });
}

export async function getAggregateTransactionWorkspace({
  editTransactionId,
}: {
  editTransactionId: number | null;
}) {
  const [transactionRows, instrumentRows] = await Promise.all([
    db
      .select({
        transaction: transactions,
        instrument: instruments,
        portfolio: portfolios,
      })
      .from(transactions)
      .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
      .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
      .orderBy(...getTransactionOrder("desc")),
    db.select().from(instruments).orderBy(asc(instruments.symbol)),
  ]);

  return buildTransactionWorkspaceModel({
    editTransactionId,
    includeEditingInstrumentInForm: false,
    instrumentRows,
    transactionRows,
  });
}
