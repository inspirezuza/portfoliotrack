"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { PendingBanner } from "@/components/loading-indicator";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionListItem } from "@/server/transactions";
import { TransactionLedgerHead } from "@/components/transaction-table/table-head";
import { TransactionRow } from "@/components/transaction-table/transaction-row";
import {
  getDeleteErrorMessage,
  getNextTransactionSort,
  getVisibleTransactions,
  type ApiErrorResponse,
  type SortState,
  type TransactionSortKey,
} from "@/components/transaction-table/table-helpers";

type TransactionTableProps = {
  transactions: TransactionListItem[];
  editingTransactionId?: number | null;
  language: UiLanguage;
  canEdit?: boolean;
  onCloseEdit?: () => void;
  onEdit?: (transaction: TransactionListItem) => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

const TransactionDeleteDialog = lazy(() =>
  import("@/components/transaction-delete-dialog").then((module) => ({
    default: module.TransactionDeleteDialog,
  })),
);

export function TransactionTable({
  transactions,
  editingTransactionId = null,
  language,
  canEdit = false,
  onCloseEdit,
  onEdit,
  onWorkspaceRefresh,
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
  const visibleTransactions = useMemo(
    () => getVisibleTransactions({ searchQuery, sort, transactions }),
    [searchQuery, sort, transactions],
  );

  function handleSort(sortKey: TransactionSortKey) {
    setSort((currentSort) => getNextTransactionSort(currentSort, sortKey));
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
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: pendingDeleteTransaction.id,
          portfolioId: pendingDeleteTransaction.portfolioId,
        }),
      });
      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(
          getDeleteErrorMessage(payload.error, copy.transactions.table.deleteCouldNot),
        );
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
        error instanceof Error ? error.message : copy.transactions.table.deleteCouldNot,
      );
    } finally {
      setDeletingTransactionId(null);
      setIsRefreshing(false);
    }
  }

  return (
    <article
      className="surface-card transaction-table-card"
      aria-busy={isRefreshing || deletingTransactionId !== null}
    >
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
        <Suspense fallback={null}>
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
        </Suspense>
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
              copy.transactions.table.transactionsUnit,
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
              <TransactionLedgerHead
                canEdit={canEdit}
                copy={copy}
                language={language}
                onSort={handleSort}
                showPortfolioColumn={showPortfolioColumn}
                sort={sort}
              />
              <tbody>
                {visibleTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="table-empty-cell">
                      {copy.transactions.table.noMatches}
                    </td>
                  </tr>
                ) : (
                  visibleTransactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      canEdit={canEdit}
                      copy={copy}
                      deletingTransactionId={deletingTransactionId}
                      editingTransactionId={editingTransactionId}
                      isRefreshing={isRefreshing}
                      locale={locale}
                      onEdit={onEdit}
                      onRequestDelete={setPendingDeleteTransaction}
                      showPortfolioColumn={showPortfolioColumn}
                      transaction={transaction}
                    />
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
