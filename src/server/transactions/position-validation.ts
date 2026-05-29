import type { Transaction } from "@/lib/db/schema";
import type { InsufficientQuantityError, PositionTransaction } from "@/lib/portfolio/positions";
import type { TransactionInput } from "@/lib/validation/transaction";

type ChronologicalPositionTransactionRow = Pick<
  Transaction,
  "instrumentId" | "tradeDate" | "side" | "quantity" | "price" | "fee" | "createdAt" | "id"
>;

export function toChronologicalPositionTransaction(
  row: ChronologicalPositionTransactionRow,
): PositionTransaction {
  return {
    instrumentId: row.instrumentId,
    tradeDate: row.tradeDate,
    side: row.side as "BUY" | "SELL",
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    createdAt: row.createdAt,
    id: row.id,
  };
}

export function getInsufficientQuantityDetails(error: InsufficientQuantityError) {
  return {
    instrumentId: error.instrumentId,
    availableQuantity: error.availableQuantity,
    attemptedQuantity: error.attemptedQuantity,
  };
}

export function getPendingTransactionOrderMarker() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildPendingPositionTransaction(input: TransactionInput): PositionTransaction {
  return {
    instrumentId: input.instrumentId,
    tradeDate: input.tradeDate,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    createdAt: getPendingTransactionOrderMarker(),
    id: Number.MAX_SAFE_INTEGER,
  };
}

export function buildEditedPositionTransactions(
  rows: ChronologicalPositionTransactionRow[],
  id: number,
  input: TransactionInput,
): PositionTransaction[] {
  return rows.map((transaction) => {
    if (transaction.id !== id) {
      return toChronologicalPositionTransaction(transaction);
    }

    return {
      instrumentId: input.instrumentId,
      tradeDate: input.tradeDate,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee,
      createdAt: transaction.createdAt,
      id,
    };
  });
}

export function buildRemainingPositionTransactionsAfterDelete(
  rows: ChronologicalPositionTransactionRow[],
  id: number,
): PositionTransaction[] {
  return rows
    .filter((transaction) => transaction.id !== id)
    .map(toChronologicalPositionTransaction);
}
