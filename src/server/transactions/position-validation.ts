import type { Transaction } from "@/lib/db/schema";
import type { InsufficientQuantityError, PositionTransaction } from "@/lib/portfolio/positions";

export function toChronologicalPositionTransaction(
  row: Pick<
    Transaction,
    "instrumentId" | "tradeDate" | "side" | "quantity" | "price" | "fee" | "createdAt" | "id"
  >,
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
