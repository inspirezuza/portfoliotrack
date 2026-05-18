"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import { TransactionForm } from "@/components/transaction-form";

type TransactionEditModalProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction: TransactionListItem;
  language: UiLanguage;
};

export function TransactionEditModal({
  instruments,
  editingTransaction,
  language
}: TransactionEditModalProps) {
  const router = useRouter();
  const copy = getUiCopy(language).transactions.form;

  const closeModal = useCallback(() => {
    router.push("/transactions");
  }, [router]);

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
      <a className="transaction-edit-backdrop" href="/transactions" aria-label={copy.close} />
      <div
        className="transaction-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.updateTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <a
          className="transaction-edit-close"
          href="/transactions"
          aria-label={copy.close}
          title={copy.close}
        >
          <span aria-hidden="true">x</span>
        </a>
        <TransactionForm
          instruments={instruments}
          editingTransaction={editingTransaction}
          language={language}
        />
      </div>
    </div>
  );
}
