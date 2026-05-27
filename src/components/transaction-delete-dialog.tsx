"use client";

import { useCallback, useEffect } from "react";
import { ButtonLoadingContent } from "@/components/loading-indicator";
import { formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionListItem } from "@/server/transactions";

type TransactionDeleteDialogProps = {
  transaction: TransactionListItem;
  language: UiLanguage;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

export function TransactionDeleteDialog({
  transaction,
  language,
  isDeleting,
  onCancel,
  onConfirm,
}: TransactionDeleteDialogProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const closeDialog = useCallback(() => {
    if (!isDeleting) {
      onCancel();
    }
  }, [isDeleting, onCancel]);
  const dialogBody = copy.transactions.table.deleteConfirm(
    transaction.side,
    formatQuantity(transaction.quantity, { locale }),
    transaction.instrument.symbol,
    transaction.tradeDate,
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialog();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog]);

  return (
    <div
      className="transaction-edit-modal transaction-delete-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
    >
      <button
        type="button"
        className="transaction-edit-backdrop"
        aria-label={copy.transactions.form.close}
        onClick={closeDialog}
        disabled={isDeleting}
      />
      <div
        className="transaction-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="transaction-delete-title"
        aria-describedby="transaction-delete-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="transaction-delete-icon" aria-hidden="true">
          <span className="table-icon table-icon-delete" />
        </div>
        <div>
          <p className="eyebrow">{copy.transactions.table.delete}</p>
          <h2 id="transaction-delete-title" className="section-title">
            {copy.transactions.table.delete}
          </h2>
          <p id="transaction-delete-body" className="transaction-delete-copy">
            {dialogBody}
          </p>
        </div>
        <div className="transaction-delete-actions">
          <button
            type="button"
            className="compact-button"
            onClick={closeDialog}
            disabled={isDeleting}
          >
            {copy.transactions.form.close}
          </button>
          <button
            type="button"
            className="table-action-button table-action-button-danger"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ButtonLoadingContent label={copy.transactions.table.deleting}>
                {copy.transactions.table.delete}
              </ButtonLoadingContent>
            ) : (
              copy.transactions.table.delete
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
