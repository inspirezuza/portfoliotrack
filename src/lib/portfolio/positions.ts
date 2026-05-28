import { nearlyEqual, normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import type { TransactionSide } from "@/lib/validation/transaction";

export type PositionTransaction = {
  instrumentId: number;
  tradeDate: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  createdAt?: string | null;
  id?: number;
};

export type InstrumentPosition = {
  instrumentId: number;
  quantity: number;
  averageCost: number;
  totalCost: number;
  realizedPnl: number;
  totalFees: number;
};

export class InsufficientQuantityError extends Error {
  readonly instrumentId: number;
  readonly availableQuantity: number;
  readonly attemptedQuantity: number;

  constructor(instrumentId: number, availableQuantity: number, attemptedQuantity: number) {
    super(
      `Cannot sell ${attemptedQuantity} units for instrument ${instrumentId}; only ${availableQuantity} available.`,
    );
    this.name = "InsufficientQuantityError";
    this.instrumentId = instrumentId;
    this.availableQuantity = availableQuantity;
    this.attemptedQuantity = attemptedQuantity;
  }
}

function compareNullable(left?: string | null, right?: string | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  return left.localeCompare(right);
}

function compareNullableNumber(left?: number, right?: number) {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return -1;
  }

  if (right == null) {
    return 1;
  }

  return left - right;
}

function normalizePositionTransaction<T extends PositionTransaction>(transaction: T): T {
  return {
    ...transaction,
    quantity: normalizeQuantity(transaction.quantity),
    price: normalizePrice(transaction.price),
    fee: normalizeMoney(transaction.fee),
  };
}

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

export function applyTransaction(
  position: InstrumentPosition,
  rawTransaction: PositionTransaction,
) {
  const transaction = normalizePositionTransaction(rawTransaction);
  const grossAmount = normalizeMoney(transaction.quantity * transaction.price);

  if (transaction.side === "BUY") {
    position.quantity = normalizeQuantity(position.quantity + transaction.quantity);
    position.totalCost = normalizeMoney(position.totalCost + grossAmount + transaction.fee);
    position.totalFees = normalizeMoney(position.totalFees + transaction.fee);
    position.averageCost =
      position.quantity > 0 ? normalizePrice(position.totalCost / position.quantity) : 0;
    return;
  }

  if (
    transaction.quantity > position.quantity &&
    !nearlyEqual(transaction.quantity, position.quantity)
  ) {
    throw new InsufficientQuantityError(
      transaction.instrumentId,
      position.quantity,
      transaction.quantity,
    );
  }

  const removedCostBasis = normalizeMoney(position.averageCost * transaction.quantity);
  const saleProceeds = normalizeMoney(grossAmount - transaction.fee);

  position.quantity = normalizeQuantity(position.quantity - transaction.quantity);
  position.totalCost = normalizeMoney(position.totalCost - removedCostBasis);
  position.realizedPnl = normalizeMoney(position.realizedPnl + saleProceeds - removedCostBasis);
  position.totalFees = normalizeMoney(position.totalFees + transaction.fee);

  if (position.quantity <= 0 || nearlyEqual(position.quantity, 0)) {
    position.quantity = 0;
    position.totalCost = 0;
    position.averageCost = 0;
    return;
  }

  position.averageCost = normalizePrice(position.totalCost / position.quantity);
}

export function sortTransactionsChronologically<T extends PositionTransaction>(transactions: T[]) {
  return [...transactions].sort((left, right) => {
    const tradeDateComparison = left.tradeDate.localeCompare(right.tradeDate);

    if (tradeDateComparison !== 0) {
      return tradeDateComparison;
    }

    const createdAtComparison = compareNullable(left.createdAt, right.createdAt);

    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return compareNullableNumber(left.id, right.id);
  });
}

export function calculatePositionForInstrument(transactions: PositionTransaction[]) {
  if (transactions.length === 0) {
    return createEmptyPosition(0);
  }

  const orderedTransactions = sortTransactionsChronologically(transactions);
  const position = createEmptyPosition(orderedTransactions[0].instrumentId);

  for (const transaction of orderedTransactions) {
    applyTransaction(position, transaction);
  }

  return position;
}

export function calculatePositions(transactions: PositionTransaction[]) {
  const orderedTransactions = sortTransactionsChronologically(transactions);
  const positions = new Map<number, InstrumentPosition>();

  for (const transaction of orderedTransactions) {
    const existingPosition =
      positions.get(transaction.instrumentId) ?? createEmptyPosition(transaction.instrumentId);

    applyTransaction(existingPosition, transaction);
    positions.set(transaction.instrumentId, existingPosition);
  }

  return positions;
}
