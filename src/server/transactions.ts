import "server-only";

import { asc, desc, eq } from "drizzle-orm";
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
import { transactionInputSchema, type TransactionInput } from "@/lib/validation/transaction";

export type TransactionListOrder = "asc" | "desc";

export type TransactionListItem = {
  id: number;
  instrumentId: number;
  tradeDate: string;
  side: "BUY" | "SELL";
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
    instrumentId: row.transaction.instrumentId,
    tradeDate: row.transaction.tradeDate,
    side: row.transaction.side as "BUY" | "SELL",
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
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
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

function buildInsertValues(input: TransactionInput): NewTransaction {
  return {
    instrumentId: input.instrumentId,
    tradeDate: input.tradeDate,
    side: input.side,
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

async function getJoinedTransactionById(id: number) {
  const row = await db
    .select({
      transaction: transactions,
      instrument: instruments
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(eq(transactions.id, id))
    .get();

  return row ? mapTransactionListItem(row) : null;
}

export async function createInstrument(input: unknown) {
  const parsedInput = parseInstrumentInput(input);
  const knownDrMetadata = getKnownDrMetadata(parsedInput);

  try {
    const instrument = db
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
      .returning()
      .get();

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

export async function createTransaction(input: unknown) {
  const parsedInput = parseTransactionInput(input);

  const insertedTransactionId = db.transaction((tx) => {
    const instrument = tx
      .select({
        id: instruments.id
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId))
      .get();

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`
      );
    }

    if (parsedInput.side === "SELL") {
      const existingTransactions = tx
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
        .where(eq(transactions.instrumentId, parsedInput.instrumentId))
        .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
        .all()
        .map(toChronologicalPositionTransaction);

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

    const insertedRow = tx
      .insert(transactions)
      .values(buildInsertValues(parsedInput))
      .returning({ id: transactions.id })
      .get();

    return insertedRow.id;
  });

  const insertedTransaction = await getJoinedTransactionById(insertedTransactionId);

  if (!insertedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was created but could not be reloaded."
    );
  }

  return insertedTransaction;
}

export async function updateTransaction(idInput: unknown, input: unknown) {
  const id = parseTransactionId(idInput);
  const parsedInput = parseTransactionInput(input);

  db.transaction((tx) => {
    const existingTransaction = tx
      .select({
        id: transactions.id
      })
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();

    if (!existingTransaction) {
      throw new TransactionServiceError(
        "TRANSACTION_NOT_FOUND",
        `Transaction ${id} does not exist.`
      );
    }

    const instrument = tx
      .select({
        id: instruments.id
      })
      .from(instruments)
      .where(eq(instruments.id, parsedInput.instrumentId))
      .get();

    if (!instrument) {
      throw new TransactionServiceError(
        "INSTRUMENT_NOT_FOUND",
        `Instrument ${parsedInput.instrumentId} does not exist.`
      );
    }

    const transactionRows = tx
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
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
      .all();

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

    tx.update(transactions)
      .set({
        ...buildInsertValues(parsedInput),
        updatedAt: getPendingTransactionOrderMarker()
      })
      .where(eq(transactions.id, id))
      .run();
  });

  const updatedTransaction = await getJoinedTransactionById(id);

  if (!updatedTransaction) {
    throw new TransactionServiceError(
      "INTERNAL_ERROR",
      "Transaction was updated but could not be reloaded."
    );
  }

  return updatedTransaction;
}

export async function deleteTransaction(idInput: unknown) {
  const id = parseTransactionId(idInput);

  db.transaction((tx) => {
    const transactionRows = tx
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
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
      .all();

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

    tx.delete(transactions).where(eq(transactions.id, id)).run();
  });

  return { id };
}

export async function listTransactions({
  instrumentId,
  order = "desc"
}: {
  instrumentId?: number;
  order?: TransactionListOrder;
} = {}) {
  const query = db
    .select({
      transaction: transactions,
      instrument: instruments
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id));

  const rows = await (instrumentId == null
    ? query.orderBy(...getTransactionOrder(order)).all()
    : query
        .where(eq(transactions.instrumentId, instrumentId))
        .orderBy(...getTransactionOrder(order))
        .all());

  return rows.map(mapTransactionListItem);
}

export async function listTransactionInstrumentOptions({
  activeOnly = true
}: {
  activeOnly?: boolean;
} = {}): Promise<TransactionInstrumentOption[]> {
  const instrumentRows = await (activeOnly
    ? db
        .select()
        .from(instruments)
        .where(eq(instruments.isActive, true))
        .orderBy(asc(instruments.symbol))
        .all()
    : db.select().from(instruments).orderBy(asc(instruments.symbol)).all());

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
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
    .all();

  const positions = calculatePositions(positionRows.map(toChronologicalPositionTransaction));

  return instrumentRows.map((instrument) => {
    const currentQuantity = positions.get(instrument.id)?.quantity ?? 0;

    return mapInstrumentOption(instrument, currentQuantity);
  });
}

export async function listSelectableTransactionInstrumentOptions() {
  const instruments = await listTransactionInstrumentOptions({ activeOnly: false });

  return instruments.filter(isTransactionInstrumentSelectable);
}
