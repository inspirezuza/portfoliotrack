import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  instruments,
  transactions,
  type Instrument,
  type NewTransaction,
  type Transaction
} from "@/lib/db/schema";
import {
  InsufficientQuantityError,
  calculatePositionForInstrument,
  calculatePositions,
  type PositionTransaction
} from "@/lib/portfolio/positions";
import { instrumentInputSchema } from "@/lib/validation/instrument";
import {
  transactionInputSchema,
  type TransactionBroker,
  type TransactionInput
} from "@/lib/validation/transaction";
import { parsePortfolioId } from "@/server/portfolios";

export type TransactionListOrder = "asc" | "desc";

export type TransactionListItem = {
  id: number;
  portfolioId: number;
  instrumentId: number;
  tradeDate: string;
  side: "BUY" | "SELL";
  broker: TransactionBroker;
  quantity: number;
  price: number;
  fee: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  instrument: {
    id: number;
    symbol: string;
    displayName: string;
    market: string;
    instrumentType: string;
    currency: string;
    providerSymbol: string;
    underlyingProviderSymbol: string | null;
  };
  grossAmount: number;
  netAmount: number;
  signedQuantity: number;
};

export type TransactionInstrumentOption = {
  id: number;
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string | null;
  isActive: boolean;
  currentQuantity: number;
  label: string;
};

export function isTransactionInstrumentSelectable(instrument: TransactionInstrumentOption) {
  return instrument.isActive || instrument.currentQuantity > 0;
}

export class InstrumentServiceError extends Error {
  readonly code: "VALIDATION_ERROR" | "DUPLICATE_INSTRUMENT" | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: InstrumentServiceError["code"],
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "InstrumentServiceError";
    this.code = code;
    this.details = details;
  }
}

export class TransactionServiceError extends Error {
  readonly code:
    | "VALIDATION_ERROR"
    | "INSTRUMENT_NOT_FOUND"
    | "TRANSACTION_NOT_FOUND"
    | "INSUFFICIENT_QUANTITY"
    | "INTERNAL_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(
    code: TransactionServiceError["code"],
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TransactionServiceError";
    this.code = code;
    this.details = details;
  }
}

export function toChronologicalPositionTransaction(
  row: Pick<
    Transaction,
    "instrumentId" | "tradeDate" | "side" | "quantity" | "price" | "fee" | "createdAt" | "id"
  >
): PositionTransaction {
  return {
    instrumentId: row.instrumentId,
    tradeDate: row.tradeDate,
    side: row.side as "BUY" | "SELL",
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    createdAt: row.createdAt,
    id: row.id
  };
}

function mapTransactionListItem(row: {
  transaction: Transaction;
  instrument: Instrument;
}): TransactionListItem {
  const grossAmount = normalizeMoney(row.transaction.quantity * row.transaction.price);
  const netAmount =
    row.transaction.side === "BUY"
      ? normalizeMoney(grossAmount + row.transaction.fee)
      : normalizeMoney(grossAmount - row.transaction.fee);

  return {
    id: row.transaction.id,
    portfolioId: row.transaction.portfolioId,
    instrumentId: row.transaction.instrumentId,
    tradeDate: row.transaction.tradeDate,
    side: row.transaction.side as "BUY" | "SELL",
    broker: row.transaction.broker as TransactionBroker,
    quantity: row.transaction.quantity,
    price: row.transaction.price,
    fee: row.transaction.fee,
    notes: row.transaction.notes,
    createdAt: row.transaction.createdAt,
    updatedAt: row.transaction.updatedAt,
    instrument: {
      id: row.instrument.id,
      symbol: row.instrument.symbol,
      displayName: row.instrument.displayName,
      market: row.instrument.market,
      instrumentType: row.instrument.instrumentType,
      currency: row.instrument.currency,
      providerSymbol: row.instrument.providerSymbol,
      underlyingProviderSymbol: row.instrument.underlyingProviderSymbol
    },
    grossAmount,
    netAmount,
    signedQuantity: row.transaction.side === "BUY" ? row.transaction.quantity : -row.transaction.quantity
  };
}

function parseInstrumentInput(input: unknown) {
  const result = instrumentInputSchema.safeParse(input);

  if (!result.success) {
    throw new InstrumentServiceError("VALIDATION_ERROR", "Instrument input is invalid.", {
      issues: result.error.flatten()
    });
  }

  return result.data;
}

function mapInstrumentOption(instrument: Instrument, currentQuantity = 0): TransactionInstrumentOption {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    market: instrument.market,
    instrumentType: instrument.instrumentType,
    currency: instrument.currency,
    providerSymbol: instrument.providerSymbol,
    isActive: instrument.isActive,
    currentQuantity,
    label: `${instrument.symbol} - ${instrument.displayName} - ${instrument.market} - ${instrument.currency}`
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "23505";
}

function getTransactionOrder(order: TransactionListOrder) {
  if (order === "asc") {
    return [asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)] as const;
  }

  return [desc(transactions.tradeDate), desc(transactions.createdAt), desc(transactions.id)] as const;
}

function parseTransactionInput(input: unknown) {
  const result = transactionInputSchema.safeParse(input);

  if (!result.success) {
    throw new TransactionServiceError("VALIDATION_ERROR", "Transaction input is invalid.", {
      issues: result.error.flatten()
    });
  }

  return result.data;
}

function parseTransactionId(input: unknown) {
  const id = Number(input);

  if (!Number.isInteger(id) || id <= 0) {
    throw new TransactionServiceError("VALIDATION_ERROR", "Transaction id must be a positive integer.");
  }

  return id;
}

function buildInsertValues(input: TransactionInput, portfolioId: number): NewTransaction {
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

function getInsufficientQuantityDetails(error: InsufficientQuantityError) {
  return {
    instrumentId: error.instrumentId,
    availableQuantity: error.availableQuantity,
    attemptedQuantity: error.attemptedQuantity
  };
}

function getPendingTransactionOrderMarker() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function getJoinedTransactionById(id: number, portfolioId: number) {
  const [row] = await db
    .select({
      transaction: transactions,
      instrument: instruments
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
        instrumentType: knownDrMetadata?.instrumentType ?? parsedInput.instrumentType,
        currency: parsedInput.currency,
        providerSymbol: parsedInput.providerSymbol,
        underlyingSymbol: knownDrMetadata?.underlyingSymbol ?? null,
        underlyingDisplayName: knownDrMetadata?.underlyingDisplayName ?? null,
        underlyingCurrency: knownDrMetadata?.underlyingCurrency ?? null,
        underlyingProviderSymbol: knownDrMetadata?.underlyingProviderSymbol ?? null,
        drRatio: knownDrMetadata?.drRatio ?? null,
        fxProviderSymbol: knownDrMetadata?.fxProviderSymbol ?? null,
        isActive: true
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
          providerSymbol: parsedInput.providerSymbol
        }
      );
    }

    throw error;
  }
}

export async function createTransaction(input: unknown, { portfolioId: portfolioIdInput }: { portfolioId: number }) {
  const parsedInput = parseTransactionInput(input);
  const portfolioId = parsePortfolioId(portfolioIdInput);

  const insertedTransactionId = await db.transaction(async (tx) => {
    const [instrument] = await tx
      .select({
        id: instruments.id
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId));

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`
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
          createdAt: transactions.createdAt
        })
        .from(transactions)
        .where(and(eq(transactions.portfolioId, portfolioId), eq(transactions.instrumentId, parsedInput.instrumentId)))
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
            id: Number.MAX_SAFE_INTEGER
          }
        ]);
      } catch (error) {
        if (error instanceof InsufficientQuantityError) {
          throw new TransactionServiceError(
            "INSUFFICIENT_QUANTITY",
            "Sell quantity exceeds current holdings.",
            getInsufficientQuantityDetails(error)
          );
        }

        throw error;
      }
    }

    const [insertedRow] = await tx
      .insert(transactions)
      .values(buildInsertValues(parsedInput, portfolioId))
      .returning({ id: transactions.id });

    return insertedRow.id;
  });

  const insertedTransaction = await getJoinedTransactionById(insertedTransactionId, portfolioId);

  if (!insertedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was created but could not be reloaded."
    );
  }

  return insertedTransaction;
}

export async function updateTransaction(
  idInput: unknown,
  input: unknown,
  { portfolioId: portfolioIdInput }: { portfolioId: number }
) {
  const id = parseTransactionId(idInput);
  const parsedInput = parseTransactionInput(input);
  const portfolioId = parsePortfolioId(portfolioIdInput);

  await db.transaction(async (tx) => {
    const [existingTransaction] = await tx
      .select({
        id: transactions.id
      })
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));

    if (!existingTransaction) {
      throw new TransactionServiceError(
        "TRANSACTION_NOT_FOUND",
        `Transaction ${id} does not exist.`
      );
    }

    const [instrument] = await tx
      .select({
        id: instruments.id
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId));

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`
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
        createdAt: transactions.createdAt
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
        id
      };
    });

    try {
      calculatePositions(editedTransactions);
    } catch (error) {
      if (error instanceof InsufficientQuantityError) {
        throw new TransactionServiceError(
          "INSUFFICIENT_QUANTITY",
          "Edited transaction would make holdings negative.",
          getInsufficientQuantityDetails(error)
        );
      }

      throw error;
    }

    await tx.update(transactions)
      .set({
        ...buildInsertValues(parsedInput, portfolioId),
        updatedAt: getPendingTransactionOrderMarker()
      })
      .where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));
  });

  const updatedTransaction = await getJoinedTransactionById(id, portfolioId);

  if (!updatedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was updated but could not be reloaded."
    );
  }

  return updatedTransaction;
}

export async function deleteTransaction(
  idInput: unknown,
  { portfolioId: portfolioIdInput }: { portfolioId: number }
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
        createdAt: transactions.createdAt
      })
      .from(transactions)
      .where(eq(transactions.portfolioId, portfolioId))
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));

    const hasMatchingTransaction = transactionRows.some((transaction) => transaction.id === id);

    if (!hasMatchingTransaction) {
      throw new TransactionServiceError(
        "TRANSACTION_NOT_FOUND",
        `Transaction ${id} does not exist.`
      );
    }

    try {
      calculatePositions(
        transactionRows
          .filter((transaction) => transaction.id !== id)
          .map(toChronologicalPositionTransaction)
      );
    } catch (error) {
      if (error instanceof InsufficientQuantityError) {
        throw new TransactionServiceError(
          "INSUFFICIENT_QUANTITY",
          "Deleting this transaction would make holdings negative.",
          getInsufficientQuantityDetails(error)
        );
      }

      throw error;
    }

    await tx.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.portfolioId, portfolioId)));
  });

  return { id };
}

export async function listTransactions({
  portfolioId: portfolioIdInput,
  instrumentId,
  order = "desc"
}: {
  portfolioId: number;
  instrumentId?: number;
  order?: TransactionListOrder;
}) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const query = db
    .select({
      transaction: transactions,
      instrument: instruments
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id));

  const rows =
    instrumentId == null
      ? await query
          .where(eq(transactions.portfolioId, portfolioId))
          .orderBy(...getTransactionOrder(order))
      : await query
          .where(and(eq(transactions.portfolioId, portfolioId), eq(transactions.instrumentId, instrumentId)))
          .orderBy(...getTransactionOrder(order));

  return rows.map(mapTransactionListItem);
}

export async function listTransactionInstrumentOptions({
  portfolioId: portfolioIdInput,
  activeOnly = true
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
      createdAt: transactions.createdAt
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

export async function listSelectableTransactionInstrumentOptions({ portfolioId }: { portfolioId: number }) {
  const instruments = await listTransactionInstrumentOptions({ portfolioId, activeOnly: false });

  return instruments.filter(isTransactionInstrumentSelectable);
}
