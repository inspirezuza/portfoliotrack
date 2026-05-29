import type { TransactionListItem } from "@/server/transactions";

export type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

export type TransactionSortKey =
  | "tradeDate"
  | "instrument"
  | "portfolio"
  | "side"
  | "broker"
  | "quantity"
  | "price"
  | "fee"
  | "netAmount";

export type SortDirection = "asc" | "desc";

export type SortState = {
  key: TransactionSortKey;
  direction: SortDirection;
};

const ASCENDING_DEFAULT_SORT_KEYS = new Set<TransactionSortKey>([
  "instrument",
  "portfolio",
  "side",
  "broker",
]);

export function getDeleteErrorMessage(error: ApiErrorResponse["error"], fallback: string) {
  return error?.message ?? fallback;
}

export function getTransactionSortValue(transaction: TransactionListItem, key: TransactionSortKey) {
  if (key === "instrument") {
    return `${transaction.instrument.symbol} ${transaction.instrument.displayName} ${transaction.instrument.market}`;
  }

  if (key === "portfolio") {
    return transaction.portfolioName ?? "";
  }

  return transaction[key];
}

export function compareTransactions(
  left: TransactionListItem,
  right: TransactionListItem,
  sort: SortState,
) {
  const leftValue = getTransactionSortValue(left, sort.key);
  const rightValue = getTransactionSortValue(right, sort.key);
  const comparison =
    typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue);

  if (comparison !== 0) {
    return sort.direction === "asc" ? comparison : -comparison;
  }

  return right.id - left.id;
}

export function getTransactionSearchText(transaction: TransactionListItem) {
  return [
    transaction.tradeDate,
    transaction.side,
    transaction.broker,
    transaction.notes ?? "",
    transaction.portfolioName ?? "",
    transaction.instrument.symbol,
    transaction.instrument.displayName,
    transaction.instrument.market,
    transaction.instrument.currency,
  ]
    .join(" ")
    .toLowerCase();
}

export function getNextTransactionSort(
  currentSort: SortState,
  sortKey: TransactionSortKey,
): SortState {
  if (currentSort.key === sortKey) {
    return {
      key: sortKey,
      direction: currentSort.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    key: sortKey,
    direction: ASCENDING_DEFAULT_SORT_KEYS.has(sortKey) ? "asc" : "desc",
  };
}

export function getVisibleTransactions({
  searchQuery,
  sort,
  transactions,
}: {
  searchQuery: string;
  sort: SortState;
  transactions: TransactionListItem[];
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return transactions
    .filter((transaction) =>
      normalizedQuery.length === 0
        ? true
        : getTransactionSearchText(transaction).includes(normalizedQuery),
    )
    .sort((left, right) => compareTransactions(left, right, sort));
}
