"use client";

import { TransactionFormPanel } from "@/components/transaction-form/form-panel";
import { useTransactionFormController } from "@/components/transaction-form/use-transaction-form-controller";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";

type TransactionFormProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction?: TransactionListItem | null;
  language: UiLanguage;
  onCloseEdit?: () => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

export function TransactionForm({
  instruments,
  editingTransaction = null,
  language,
  onCloseEdit,
  onWorkspaceRefresh,
}: TransactionFormProps) {
  const panelProps = useTransactionFormController({
    editingTransaction,
    instruments,
    language,
    onCloseEdit,
    onWorkspaceRefresh,
  });

  return <TransactionFormPanel {...panelProps} />;
}
