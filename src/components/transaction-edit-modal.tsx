"use client";

import { useCallback, useEffect } from "react";
import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import { TransactionForm } from "@/components/transaction-form";

type TransactionEditModalProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction: TransactionListItem;
  language: UiLanguage;
  onClose: () => void;
  onWorkspaceRefresh: () => Promise<void> | void;
};

export function TransactionEditModal({
  instruments,
  editingTransaction,
  language,
  onClose,
  onWorkspaceRefresh
}: TransactionEditModalProps) {
  const copy = getUiCopy(language).transactions.form;

  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal]);

  return (
    <div
      className="transaction-edit-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      <button
        type="button"
        className="transaction-edit-backdrop"
        aria-label={copy.close}
        onClick={closeModal}
      />
      <div
        className="transaction-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.updateTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="transaction-edit-close"
          aria-label={copy.close}
          title={copy.close}
          onClick={closeModal}
        >
          <span aria-hidden="true">x</span>
        </button>
        <TransactionForm
          instruments={instruments}
          editingTransaction={editingTransaction}
          language={language}
          onCloseEdit={closeModal}
          onWorkspaceRefresh={onWorkspaceRefresh}
        />
      </div>
    </div>
  );
}
