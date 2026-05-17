"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { TransactionListItem } from "@/server/transactions";
import { InstrumentLogo } from "@/components/instrument-logo";

type TransactionTableProps = {
  transactions: TransactionListItem[];
  editingTransactionId?: number | null;
  canEdit?: boolean;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

type TransactionSortKey =
  | "tradeDate"
  | "instrument"
  | "side"
  | "quantity"
  | "price"
  | "fee"
  | "netAmount";

type SortDirection = "asc" | "desc";

type SortState = {
  key: TransactionSortKey;
  direction: SortDirection;
};

function getDeleteErrorMessage(error: ApiErrorResponse["error"]) {
  return error?.message ?? "Transaction could not be deleted.";
}

function getTransactionSortValue(transaction: TransactionListItem, key: TransactionSortKey) {
  if (key === "instrument") {
    return `${transaction.instrument.symbol} ${transaction.instrument.displayName} ${transaction.instrument.market}`;
  }

  return transaction[key];
}

function compareTransactions(
  left: TransactionListItem,
  right: TransactionListItem,
  sort: SortState
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

function getTransactionSearchText(transaction: TransactionListItem) {
  return [
    transaction.tradeDate,
    transaction.side,
    transaction.notes ?? "",
    transaction.instrument.symbol,
    transaction.instrument.displayName,
    transaction.instrument.market,
    transaction.instrument.currency
  ]
    .join(" ")
    .toLowerCase();
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: TransactionSortKey;
  sort: SortState;
  onSort: (key: TransactionSortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  const nextDirection = isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <th scope="col" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="table-sort-button"
        data-sort-state={isActive ? sort.direction : "none"}
        onClick={() => onSort(sortKey)}
        aria-label={`Sort ${label} ${nextDirection}`}
      >
        <span className="table-sort-label">{label}</span>
        <span className="table-sort-icon" aria-hidden="true" />
      </button>
    </th>
  );
}

export function TransactionTable({
  transactions,
  editingTransactionId = null,
  canEdit = false
}: TransactionTableProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "tradeDate", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return transactions
      .filter((transaction) =>
        normalizedQuery.length === 0
          ? true
          : getTransactionSearchText(transaction).includes(normalizedQuery)
      )
      .sort((left, right) => compareTransactions(left, right, sort));
  }, [searchQuery, sort, transactions]);

  function handleSort(sortKey: TransactionSortKey) {
    setSort((currentSort) =>
      currentSort.key === sortKey
        ? {
            key: sortKey,
            direction: currentSort.direction === "asc" ? "desc" : "asc"
          }
        : {
            key: sortKey,
            direction: sortKey === "instrument" || sortKey === "side" ? "asc" : "desc"
          }
    );
  }

  async function handleDelete(transaction: TransactionListItem) {
    const isConfirmed = window.confirm(
      `Delete ${transaction.side} ${formatQuantity(transaction.quantity)} ${transaction.instrument.symbol} from ${transaction.tradeDate}?`
    );

    if (!isConfirmed) {
      return;
    }

    setDeletingTransactionId(transaction.id);
    setDeleteErrorMessage(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: transaction.id })
      });
      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getDeleteErrorMessage(payload.error));
      }

      startTransition(() => {
        if (editingTransactionId === transaction.id) {
          router.push("/transactions");
        }

        router.refresh();
      });
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : "Transaction could not be deleted."
      );
    } finally {
      setDeletingTransactionId(null);
    }
  }

  return (
    <article className="surface-card transaction-table-card">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2 className="section-title">Latest transactions</h2>
        </div>
      </div>

      {deleteErrorMessage ? (
        <p className="form-banner form-banner-error">{deleteErrorMessage}</p>
      ) : null}

      {transactions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No transactions yet. The first recorded trade will appear here immediately.</p>
        </div>
      ) : (
        <>
          <div className="table-toolbar" aria-label="Transaction table tools">
            <label className="table-search">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Symbol, date, note"
              />
            </label>
          </div>

          <div className="table-count">
            Showing {visibleTransactions.length} of {transactions.length} transactions
          </div>

          <div className="transaction-table-wrap">
            <table className="transaction-table">
              <thead>
                <tr>
                  <SortableHeader label="Date" sortKey="tradeDate" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Instrument" sortKey="instrument" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Side" sortKey="side" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Quantity" sortKey="quantity" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Price" sortKey="price" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Fee" sortKey="fee" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Net" sortKey="netAmount" sort={sort} onSort={handleSort} />
                  <th scope="col">Notes</th>
                  {canEdit ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8} className="table-empty-cell">
                      No transactions match the current search.
                    </td>
                  </tr>
                ) : (
                  visibleTransactions.map((transaction) => (
                    <tr key={transaction.id} data-editing={transaction.id === editingTransactionId}>
                      <td>{transaction.tradeDate}</td>
                      <td>
                        <div className="instrument-cell instrument-cell-with-logo">
                          <InstrumentLogo
                            symbol={transaction.instrument.symbol}
                            displayName={transaction.instrument.displayName}
                            instrumentType={transaction.instrument.instrumentType}
                            providerSymbol={transaction.instrument.providerSymbol}
                            underlyingProviderSymbol={transaction.instrument.underlyingProviderSymbol}
                            size="sm"
                          />
                          <div className="instrument-cell-copy">
                            <strong>{transaction.instrument.symbol}</strong>
                            <span>
                              {transaction.instrument.displayName} - {transaction.instrument.market}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`side-pill ${
                            transaction.side === "BUY" ? "side-pill-buy" : "side-pill-sell"
                          }`}
                        >
                          {transaction.side}
                        </span>
                      </td>
                      <td className="table-number">{formatQuantity(transaction.quantity)}</td>
                      <td className="table-number">
                        {formatCurrency(transaction.price, {
                          currency: transaction.instrument.currency,
                          maximumFractionDigits: 4
                        })}
                      </td>
                      <td className="table-number">{formatCurrency(transaction.fee, { currency: transaction.instrument.currency })}</td>
                      <td className="table-number">{formatCurrency(transaction.netAmount, { currency: transaction.instrument.currency })}</td>
                      <td>{transaction.notes ?? "-"}</td>
                      {canEdit ? (
                        <td>
                          <div className="table-actions">
                            <Link className="table-action-link" href={`/transactions?edit=${transaction.id}`}>
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="table-action-button table-action-button-danger"
                              onClick={() => void handleDelete(transaction)}
                              disabled={
                                deletingTransactionId === transaction.id ||
                                isRefreshing ||
                                deletingTransactionId !== null
                              }
                            >
                              {deletingTransactionId === transaction.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </article>
  );
}
