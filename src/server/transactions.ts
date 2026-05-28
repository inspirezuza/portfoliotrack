import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { normalizeInstrumentType } from "@/lib/instruments/instrument-types";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { instruments, portfolios, transactions } from "@/lib/db/schema";
import {
  InsufficientQuantityError,
  calculatePositionForInstrument,
  calculatePositions,
} from "@/lib/portfolio/positions";
import { parsePortfolioId } from "@/server/portfolios";
import { InstrumentServiceError, TransactionServiceError } from "@/server/transactions/errors";
import {
  buildTransactionInsertValues,
  parseInstrumentInput,
  parseTransactionId,
  parseTransactionInput,
} from "@/server/transactions/input";
import {
  isTransactionInstrumentSelectable,
  mapInstrumentOption,
  mapTransactionListItem,
  type TransactionInstrumentOption,
} from "@/server/transactions/mappers";
import {
  getInsufficientQuantityDetails,
  getPendingTransactionOrderMarker,
  toChronologicalPositionTransaction,
} from "@/server/transactions/position-validation";
import { buildTransactionWorkspaceModel } from "@/server/transactions/workspace";
export type {
  TransactionInstrumentOption,
  TransactionListItem,
} from "@/server/transactions/mappers";
export { InstrumentServiceError, TransactionServiceError } from "@/server/transactions/errors";
export { isTransactionInstrumentSelectable } from "@/server/transactions/mappers";
export { toChronologicalPositionTransaction } from "@/server/transactions/position-validation";

export type TransactionListOrder = "asc" | "desc";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "23505";
}

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

async function getJoinedTransactionById(id: number, portfolioId: number) {
  const [row] = await db
    .select({
      transaction: transactions,
      instrument: instruments,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));

  return row ? mapTransactionListItem(row) : null;
}

export async function createInstrument(input: unknown) {
  const parsedInput = parseInstrumentInput(input);
  const knownDrMetadata = getKnownDrMetadata(parsedInput);

  try {
    const [instrument] = await db
      .insert(instruments)
      .values({
        symbol: parsedInput.symbol,
        displayName: parsedInput.displayName,
        market: parsedInput.market,
        instrumentType:
          knownDrMetadata?.instrumentType ?? normalizeInstrumentType(parsedInput.instrumentType),
        currency: parsedInput.currency,
        providerSymbol: parsedInput.providerSymbol,
        underlyingSymbol: knownDrMetadata?.underlyingSymbol ?? null,
        underlyingDisplayName: knownDrMetadata?.underlyingDisplayName ?? null,
        underlyingCurrency: knownDrMetadata?.underlyingCurrency ?? null,
        underlyingProviderSymbol: knownDrMetadata?.underlyingProviderSymbol ?? null,
        drRatio: knownDrMetadata?.drRatio ?? null,
        fxProviderSymbol: knownDrMetadata?.fxProviderSymbol ?? null,
        isActive: true,
      })
      .returning();

    return mapInstrumentOption(instrument);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new InstrumentServiceError(
        "DUPLICATE_INSTRUMENT",
        "An instrument with that app symbol or provider symbol already exists.",
        {
          symbol: parsedInput.symbol,
          providerSymbol: parsedInput.providerSymbol,
        },
      );
    }

    throw error;
  }
}

export async function createTransaction(
  input: unknown,
  { portfolioId: portfolioIdInput }: { portfolioId: number },
) {
  const parsedInput = parseTransactionInput(input);
  const portfolioId = parsePortfolioId(portfolioIdInput);

  const insertedTransactionId = await db.transaction(async (tx) => {
    const [instrument] = await tx
      .select({
        id: instruments.id,
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId));

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`,
      );
    }

    if (parsedInput.side === "SELL") {
      const existingTransactionRows = await tx
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
        .where(
          and(
            eq(transactions.portfolioId, portfolioId),
            eq(transactions.instrumentId, parsedInput.instrumentId),
          ),
        )
        .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));
      const existingTransactions = existingTransactionRows.map(toChronologicalPositionTransaction);

      try {
        calculatePositionForInstrument([
          ...existingTransactions,
          {
            instrumentId: parsedInput.instrumentId,
            tradeDate: parsedInput.tradeDate,
            side: parsedInput.side,
            quantity: parsedInput.quantity,
            price: parsedInput.price,
            fee: parsedInput.fee,
            createdAt: getPendingTransactionOrderMarker(),
            id: Number.MAX_SAFE_INTEGER,
          },
        ]);
      } catch (error) {
        if (error instanceof InsufficientQuantityError) {
          throw new TransactionServiceError(
            "INSUFFICIENT_QUANTITY",
            "Sell quantity exceeds current holdings.",
            getInsufficientQuantityDetails(error),
          );
        }

        throw error;
      }
    }

    const [insertedRow] = await tx
      .insert(transactions)
      .values(buildTransactionInsertValues(parsedInput, portfolioId))
      .returning({ id: transactions.id });

    return insertedRow.id;
  });

  const insertedTransaction = await getJoinedTransactionById(insertedTransactionId, portfolioId);

  if (!insertedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was created but could not be reloaded.",
    );
  }

  return insertedTransaction;
}

export async function updateTransaction(
  idInput: unknown,
  input: unknown,
  { portfolioId: portfolioIdInput }: { portfolioId: number },
) {
  const id = parseTransactionId(idInput);
  const parsedInput = parseTransactionInput(input);
  const portfolioId = parsePortfolioId(portfolioIdInput);

  await db.transaction(async (tx) => {
    const [existingTransaction] = await tx
      .select({
        id: transactions.id,
      })
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));

    if (!existingTransaction) {
      throw new TransactionServiceError(
        "TRANSACTION_NOT_FOUND",
        `Transaction ${id} does not exist.`,
      );
    }

    const [instrument] = await tx
      .select({
        id: instruments.id,
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId));

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`,
      );
    }

    const transactionRows = await tx
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

    const editedTransactions = transactionRows.map((transaction) => {
      if (transaction.id !== id) {
        return toChronologicalPositionTransaction(transaction);
      }

      return {
        instrumentId: parsedInput.instrumentId,
        tradeDate: parsedInput.tradeDate,
        side: parsedInput.side,
        quantity: parsedInput.quantity,
        price: parsedInput.price,
        fee: parsedInput.fee,
        createdAt: transaction.createdAt,
        id,
      };
    });

    try {
      calculatePositions(editedTransactions);
    } catch (error) {
      if (error instanceof InsufficientQuantityError) {
        throw new TransactionServiceError(
          "INSUFFICIENT_QUANTITY",
          "Edited transaction would make holdings negative.",
          getInsufficientQuantityDetails(error),
        );
      }

      throw error;
    }

    await tx
      .update(transactions)
      .set({
        ...buildTransactionInsertValues(parsedInput, portfolioId),
        updatedAt: getPendingTransactionOrderMarker(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));
  });

  const updatedTransaction = await getJoinedTransactionById(id, portfolioId);

  if (!updatedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was updated but could not be reloaded.",
    );
  }

  return updatedTransaction;
}

export async function deleteTransaction(
  idInput: unknown,
  { portfolioId: portfolioIdInput }: { portfolioId: number },
) {
  const id = parseTransactionId(idInput);
  const portfolioId = parsePortfolioId(portfolioIdInput);

  await db.transaction(async (tx) => {
    const transactionRows = await tx
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

    const hasMatchingTransaction = transactionRows.some((transaction) => transaction.id === id);

    if (!hasMatchingTransaction) {
      throw new TransactionServiceError(
        "TRANSACTION_NOT_FOUND",
        `Transaction ${id} does not exist.`,
      );
    }

    try {
      calculatePositions(
        transactionRows
          .filter((transaction) => transaction.id !== id)
          .map(toChronologicalPositionTransaction),
      );
    } catch (error) {
      if (error instanceof InsufficientQuantityError) {
        throw new TransactionServiceError(
          "INSUFFICIENT_QUANTITY",
          "Deleting this transaction would make holdings negative.",
          getInsufficientQuantityDetails(error),
        );
      }

      throw error;
    }

    await tx
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));
  });

  return { id };
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

export async function listTransactionInstrumentOptions({
  portfolioId: portfolioIdInput,
  activeOnly = true,
}: {
  portfolioId: number;
  activeOnly?: boolean;
}): Promise<TransactionInstrumentOption[]> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const instrumentRows = activeOnly
    ? await db
        .select()
        .from(instruments)
        .where(eq(instruments.isActive, true))
        .orderBy(asc(instruments.symbol))
    : await db.select().from(instruments).orderBy(asc(instruments.symbol));

  const positionRows = await db
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

  const positions = calculatePositions(positionRows.map(toChronologicalPositionTransaction));

  return instrumentRows.map((instrument) => {
    const currentQuantity = positions.get(instrument.id)?.quantity ?? 0;

    return mapInstrumentOption(instrument, currentQuantity);
  });
}

export async function listSelectableTransactionInstrumentOptions({
  portfolioId,
}: {
  portfolioId: number;
}) {
  const instruments = await listTransactionInstrumentOptions({ portfolioId, activeOnly: false });

  return instruments.filter(isTransactionInstrumentSelectable);
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
