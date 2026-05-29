"use client";

import Link from "next/link";
import { InstrumentLogo } from "@/components/instrument-logo";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { getUiCopy } from "@/lib/ui/copy";
import type { TransactionListItem } from "@/server/transactions";

type TransactionRowProps = {
  canEdit: boolean;
  copy: ReturnType<typeof getUiCopy>;
  deletingTransactionId: number | null;
  editingTransactionId: number | null;
  isRefreshing: boolean;
  locale: string;
  onEdit?: (transaction: TransactionListItem) => void;
  onRequestDelete: (transaction: TransactionListItem) => void;
  showPortfolioColumn: boolean;
  transaction: TransactionListItem;
};

export function TransactionRow({
  canEdit,
  copy,
  deletingTransactionId,
  editingTransactionId,
  isRefreshing,
  locale,
  onEdit,
  onRequestDelete,
  showPortfolioColumn,
  transaction,
}: TransactionRowProps) {
  return (
    <tr data-editing={transaction.id === editingTransactionId}>
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
          className={`side-pill ${transaction.side === "BUY" ? "side-pill-buy" : "side-pill-sell"}`}
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
          maximumFractionDigits: 4,
        })}
      </td>
      <td className="table-number">
        {formatCurrency(transaction.fee, {
          currency: transaction.instrument.currency,
          locale,
        })}
      </td>
      <td className="table-number">
        {formatCurrency(transaction.netAmount, {
          currency: transaction.instrument.currency,
          locale,
        })}
      </td>
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
              onClick={() => onRequestDelete(transaction)}
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
  );
}
