"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { TransactionListItem } from "@/server/transactions";

type TransactionTableProps = {
  transactions: TransactionListItem[];
  editingTransactionId?: number | null;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

function getDeleteErrorMessage(error: ApiErrorResponse["error"]) {
  return error?.message ?? "Transaction could not be deleted.";
}

export function TransactionTable({ transactions, editingTransactionId = null }: TransactionTableProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

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
        <div className="transaction-table-wrap">
          <table className="transaction-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Instrument</th>
                <th scope="col">Side</th>
                <th scope="col">Quantity</th>
                <th scope="col">Price</th>
                <th scope="col">Fee</th>
                <th scope="col">Net</th>
                <th scope="col">Notes</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} data-editing={transaction.id === editingTransactionId}>
                  <td>{transaction.tradeDate}</td>
                  <td>
                    <div className="instrument-cell">
                      <strong>{transaction.instrument.symbol}</strong>
                      <span>
                        {transaction.instrument.displayName} - {transaction.instrument.market}
                      </span>
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
                  <td>{formatQuantity(transaction.quantity)}</td>
                  <td>
                    {formatCurrency(transaction.price, {
                      currency: transaction.instrument.currency,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td>{formatCurrency(transaction.fee, { currency: transaction.instrument.currency })}</td>
                  <td>{formatCurrency(transaction.netAmount, { currency: transaction.instrument.currency })}</td>
                  <td>{transaction.notes ?? "-"}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
