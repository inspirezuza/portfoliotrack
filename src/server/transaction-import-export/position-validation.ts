import { normalizeQuantity } from "@/lib/db/precision";
import {
  applyTransaction,
  sortTransactionsChronologically,
  type InstrumentPosition,
  InsufficientQuantityError,
  type PositionTransaction,
} from "@/lib/portfolio/positions";

export type ExistingImportPositionRow = Pick<
  PositionTransaction,
  "id" | "instrumentId" | "tradeDate" | "side" | "quantity" | "price" | "fee" | "createdAt"
>;

export type ReadyImportPositionRow = Pick<
  PositionTransaction,
  "instrumentId" | "tradeDate" | "side" | "quantity" | "price" | "fee"
> & {
  rowNumber: number;
};

type ImportPositionTransaction = PositionTransaction & {
  sourceRowNumber?: number;
};

function createEmptyPosition(instrumentId: number): InstrumentPosition {
  return {
    instrumentId,
    quantity: 0,
    averageCost: 0,
    totalCost: 0,
    realizedPnl: 0,
    totalFees: 0,
  };
}

function toImportPositionTransaction(row: ExistingImportPositionRow): PositionTransaction {
  return {
    instrumentId: row.instrumentId,
    tradeDate: row.tradeDate,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    createdAt: row.createdAt,
    id: row.id,
  };
}

export function getImportPositionValidationErrors(
  existingRows: ExistingImportPositionRow[],
  readyRows: ReadyImportPositionRow[],
) {
  const errors = new Map<number, string>();
  const importedTransactions: ImportPositionTransaction[] = readyRows.map((row, index) => ({
    instrumentId: row.instrumentId,
    tradeDate: row.tradeDate,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    createdAt: "9999-12-31 23:59:59",
    id: Number.MAX_SAFE_INTEGER - readyRows.length + index,
    sourceRowNumber: row.rowNumber,
  }));
  const orderedTransactions = sortTransactionsChronologically<ImportPositionTransaction>([
    ...existingRows.map(toImportPositionTransaction),
    ...importedTransactions,
  ]);
  const positions = new Map<number, InstrumentPosition>();

  for (const transaction of orderedTransactions) {
    const position =
      positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

    try {
      applyTransaction(position, transaction);
      positions.set(transaction.instrumentId, position);
    } catch (error) {
      if (error instanceof InsufficientQuantityError && transaction.sourceRowNumber != null) {
        errors.set(
          transaction.sourceRowNumber,
          `Sell quantity exceeds holdings. Available quantity is ${normalizeQuantity(error.availableQuantity)}.`,
        );
        continue;
      }

      throw error;
    }
  }

  return errors;
}
