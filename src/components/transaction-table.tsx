"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PendingBanner } from "@/components/loading-indicator";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionListItem } from "@/server/transactions";
import { InstrumentLogo } from "@/components/instrument-logo";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";

type TransactionTableProps = {
  transactions: TransactionListItem[];
  editingTransactionId?: number | null;
  language: UiLanguage;
  canEdit?: boolean;
  onCloseEdit?: () => void;
  onEdit?: (transaction: TransactionListItem) => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

type TransactionSortKey =
  | "tradeDate"
  | "instrument"
  | "portfolio"
  | "side"
  | "broker"
  | "quantity"
  | "price"
  | "fee"
  | "netAmount";

type SortDirection = "asc" | "desc";

type SortState = {
  key: TransactionSortKey;
  direction: SortDirection;
};

function getDeleteErrorMessage(error: ApiErrorResponse["error"], fallback: string) {
  return error?.message ?? fallback;
}

function getTransactionSortValue(transaction: TransactionListItem, key: TransactionSortKey) {
  if (key === "instrument") {
    return `${transaction.instrument.symbol} ${transaction.instrument.displayName} ${transaction.instrument.market}`;
  }

  if (key === "portfolio") {
    return transaction.portfolioName ?? "";
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
    transaction.broker,
    transaction.notes ?? "",
    transaction.portfolioName ?? "",
    transaction.instrument.symbol,
    transaction.instrument.displayName,
    transaction.instrument.market,
    transaction.instrument.currency
  ]
    .join(" ")
    .toLowerCase();
}

function SortableHeader({
  align = "left",
  language,
  label,
  sortKey,
  sort,
  onSort
}: {
  align?: "left" | "right";
  language: UiLanguage;
  label: string;
  sortKey: TransactionSortKey;
  sort: SortState;
  onSort: (key: TransactionSortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  const copy = getUiCopy(language).shared;
  const nextDirection =
    isActive && sort.direction === "asc" ? copy.sortDescending : copy.sortAscending;

  return (
    <th
      scope="col"
      className={align === "right" ? "table-heading-number" : undefined}
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="table-sort-button"
        data-sort-state={isActive ? sort.direction : "none"}
        onClick={() => onSort(sortKey)}
        aria-label={copy.sortLabel(label, nextDirection)}
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
  language,
  canEdit = false,
  onCloseEdit,
  onEdit,
  onWorkspaceRefresh
}: TransactionTableProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const [pendingDeleteTransaction, setPendingDeleteTransaction] =
    useState<TransactionListItem | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "tradeDate", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const showPortfolioColumn = transactions.some((transaction) => transaction.portfolioName != null);
  const columnCount = (canEdit ? 10 : 9) + (showPortfolioColumn ? 1 : 0);

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
            direction:
              sortKey === "instrument" || sortKey === "portfolio" || sortKey === "side" || sortKey === "broker"
                ? "asc"
                : "desc"
          }
    );
  }

  async function handleDelete() {
    if (!pendingDeleteTransaction) {
      return;
    }

    setDeletingTransactionId(pendingDeleteTransaction.id);
    setDeleteErrorMessage(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: pendingDeleteTransaction.id })
      });
      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getDeleteErrorMessage(payload.error, copy.transactions.table.deleteCouldNot));
      }

      if (editingTransactionId === pendingDeleteTransaction.id) {
        onCloseEdit?.();
      }

      setPendingDeleteTransaction(null);

      if (onWorkspaceRefresh) {
        setIsRefreshing(true);
        await onWorkspaceRefresh();
      }
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : copy.transactions.table.deleteCouldNot
      );
    } finally {
      setDeletingTransactionId(null);
      setIsRefreshing(false);
    }
  }

  return (
    <article className="surface-card transaction-table-card" aria-busy={isRefreshing || deletingTransactionId !== null}>
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">{copy.transactions.table.eyebrow}</p>
          <h2 className="section-title">{copy.transactions.table.title}</h2>
        </div>
      </div>

      {deleteErrorMessage ? (
        <p className="form-banner form-banner-error">{deleteErrorMessage}</p>
      ) : null}
      {deletingTransactionId != null ? (
        <PendingBanner label={copy.transactions.table.deleting} />
      ) : isRefreshing ? (
        <PendingBanner label={copy.transactions.table.refreshing} />
      ) : null}

      {pendingDeleteTransaction ? (
        <TransactionDeleteDialog
          transaction={pendingDeleteTransaction}
          language={language}
          isDeleting={deletingTransactionId === pendingDeleteTransaction.id}
          onCancel={() => {
            setPendingDeleteTransaction(null);
            setDeleteErrorMessage(null);
          }}
          onConfirm={handleDelete}
        />
      ) : null}

      {transactions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>{copy.transactions.table.noTransactions}</p>
        </div>
      ) : (
        <>
          <div className="table-toolbar" aria-label={copy.transactions.table.toolsLabel}>
            <label className="table-search">
              <span>{copy.shared.search}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={copy.transactions.table.searchPlaceholder}
              />
            </label>
          </div>

          <div className="table-count">
            {copy.shared.countOf(
              visibleTransactions.length,
              transactions.length,
              copy.transactions.table.transactionsUnit
            )}
          </div>

          <div className="transaction-table-wrap">
            <table className="transaction-table transaction-ledger-table">
              <colgroup>
                <col className="transaction-col-date" />
                <col className="transaction-col-instrument" />
                {showPortfolioColumn ? <col className="transaction-col-portfolio" /> : null}
                <col className="transaction-col-side" />
                <col className="transaction-col-broker" />
                <col className="transaction-col-quantity" />
                <col className="transaction-col-price" />
                <col className="transaction-col-fee" />
                <col className="transaction-col-net" />
                <col className="transaction-col-notes" />
                {canEdit ? <col className="transaction-col-actions" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <SortableHeader label={copy.transactions.table.columns.date} language={language} sortKey="tradeDate" sort={sort} onSort={handleSort} />
                  <SortableHeader label={copy.transactions.table.columns.instrument} language={language} sortKey="instrument" sort={sort} onSort={handleSort} />
                  {showPortfolioColumn ? (
                    <SortableHeader label={copy.transactions.table.columns.portfolio} language={language} sortKey="portfolio" sort={sort} onSort={handleSort} />
                  ) : null}
                  <SortableHeader label={copy.transactions.table.columns.side} language={language} sortKey="side" sort={sort} onSort={handleSort} />
                  <SortableHeader label={copy.transactions.table.columns.broker} language={language} sortKey="broker" sort={sort} onSort={handleSort} />
                  <SortableHeader label={copy.transactions.table.columns.quantity} language={language} sortKey="quantity" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.transactions.table.columns.price} language={language} sortKey="price" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.transactions.table.columns.fee} language={language} sortKey="fee" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.transactions.table.columns.net} language={language} sortKey="netAmount" sort={sort} onSort={handleSort} align="right" />
                  <th scope="col">{copy.transactions.table.columns.notes}</th>
                  {canEdit ? <th scope="col">{copy.transactions.table.columns.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="table-empty-cell">
                      {copy.transactions.table.noMatches}
                    </td>
                  </tr>
                ) : (
                  visibleTransactions.map((transaction) => (
                    <tr key={transaction.id} data-editing={transaction.id === editingTransactionId}>
                      <td>{transaction.tradeDate}</td>
                      <td>
                        <Link
                          href={`/assets/${encodeURIComponent(transaction.instrument.symbol)}`}
                          className="instrument-cell instrument-cell-with-logo instrument-cell-link"
                        >
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
                        </Link>
                      </td>
                      {showPortfolioColumn ? <td>{transaction.portfolioName ?? "-"}</td> : null}
                      <td>
                        <span
                          className={`side-pill ${
                            transaction.side === "BUY" ? "side-pill-buy" : "side-pill-sell"
                          }`}
                        >
                          {transaction.side}
                        </span>
                      </td>
                      <td>{transaction.broker === "WEBULL" ? "Webull" : "Dime"}</td>
                      <td className="table-number">{formatQuantity(transaction.quantity, { locale })}</td>
                      <td className="table-number">
                        {formatCurrency(transaction.price, {
                          currency: transaction.instrument.currency,
                          locale,
                          maximumFractionDigits: 4
                        })}
                      </td>
                      <td className="table-number">{formatCurrency(transaction.fee, { currency: transaction.instrument.currency, locale })}</td>
                      <td className="table-number">{formatCurrency(transaction.netAmount, { currency: transaction.instrument.currency, locale })}</td>
                      <td className="table-notes">{transaction.notes ?? "-"}</td>
                      {canEdit ? (
                        <td>
                          <div className="table-actions table-actions-icon">
                            <button
                              type="button"
                              className="table-icon-button"
                              aria-label={`${copy.transactions.table.edit} ${transaction.instrument.symbol} ${transaction.tradeDate}`}
                              title={copy.transactions.table.edit}
                              onClick={() => onEdit?.(transaction)}
                              disabled={isRefreshing || deletingTransactionId !== null}
                            >
                              <span className="table-icon table-icon-edit" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="table-icon-button table-icon-button-danger"
                              aria-label={`${copy.transactions.table.delete} ${transaction.instrument.symbol} ${transaction.tradeDate}`}
                              title={copy.transactions.table.delete}
                              onClick={() => setPendingDeleteTransaction(transaction)}
                              disabled={
                                deletingTransactionId === transaction.id ||
                                isRefreshing ||
                                deletingTransactionId !== null
                              }
                            >
                              {deletingTransactionId === transaction.id ? (
                                <span className="table-icon-spinner" aria-hidden="true" />
                              ) : (
                                <span className="table-icon table-icon-delete" aria-hidden="true" />
                              )}
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
