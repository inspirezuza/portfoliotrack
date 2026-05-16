import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { db } from "@/lib/db/runtime";
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
  isActive: boolean;
  currentQuantity: number;
  label: string;
};

export function isTransactionInstrumentSelectable(instrument: TransactionInstrumentOption) {
  return instrument.isActive || instrument.currentQuantity > 0;
}

export class TransactionServiceError extends Error {
  readonly code:
    | "VALIDATION_ERROR"
    | "INSTRUMENT_NOT_FOUND"
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
      currency: row.instrument.currency
    },
    grossAmount,
    netAmount,
    signedQuantity: row.transaction.side === "BUY" ? row.transaction.quantity : -row.transaction.quantity
  };
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
            {
              instrumentId: error.instrumentId,
              availableQuantity: error.availableQuantity,
              attemptedQuantity: error.attemptedQuantity
            }
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

    return {
      id: instrument.id,
      symbol: instrument.symbol,
      displayName: instrument.displayName,
      market: instrument.market,
      instrumentType: instrument.instrumentType,
      currency: instrument.currency,
      isActive: instrument.isActive,
      currentQuantity,
      label: `${instrument.symbol} - ${instrument.displayName} - ${instrument.market} - ${instrument.currency}`
    };
  });
}

export async function listSelectableTransactionInstrumentOptions() {
  const instruments = await listTransactionInstrumentOptions({ activeOnly: false });

  return instruments.filter(isTransactionInstrumentSelectable);
}
