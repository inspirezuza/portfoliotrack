"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PendingBanner } from "@/components/loading-indicator";
import { sortInstrumentOptions } from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import { TransactionEditModal } from "@/components/transaction-edit-modal";
import { TransactionExcelTools } from "@/components/transaction-excel-tools";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";

type TransactionSummary = {
  allInstrumentCount: number;
  latestTradeDate: string | null;
  openInstrumentCount: number;
  selectableInstrumentCount: number;
  transactionCount: number;
  uniqueInstrumentCount: number;
};

type TransactionWorkspaceClientProps = {
  canEdit: boolean;
  initialAllInstruments: TransactionInstrumentOption[];
  initialEditingTransaction: TransactionListItem | null;
  initialInstruments: TransactionInstrumentOption[];
  initialSummary: TransactionSummary;
  initialTransactions: TransactionListItem[];
  isAggregatePortfolio: boolean;
  language: UiLanguage;
  selectedPortfolioKey: string;
  selectedPortfolioName: string;
  transactionsPath: string;
};

type WorkspaceApiResponse = {
  allInstruments?: TransactionInstrumentOption[];
  instruments?: TransactionInstrumentOption[];
  summary?: TransactionSummary;
  transactions?: TransactionListItem[];
  error?: {
    message?: string;
  };
};

function getEditTransactionIdFromUrl() {
  const edit = new URLSearchParams(window.location.search).get("edit");
  const id = Number(edit);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function setEditTransactionUrl(id: number | null, transactionsPath: string) {
  const nextUrl = id == null ? transactionsPath : `${transactionsPath}?edit=${id}`;
  window.history.pushState(null, "", nextUrl);
}

function clearEditTransactionUrl(transactionsPath: string) {
  window.history.replaceState(null, "", transactionsPath);
}

function getEditFormInstruments(
  editingTransaction: TransactionListItem | null,
  instruments: TransactionInstrumentOption[],
  allInstruments: TransactionInstrumentOption[],
) {
  if (
    !editingTransaction ||
    instruments.some((instrument) => instrument.id === editingTransaction.instrumentId)
  ) {
    return instruments;
  }

  const editingInstrument = allInstruments.find(
    (instrument) => instrument.id === editingTransaction.instrumentId,
  );

  return editingInstrument
    ? sortInstrumentOptions([...instruments, editingInstrument])
    : instruments;
}

export function TransactionWorkspaceClient({
  canEdit,
  initialAllInstruments,
  initialEditingTransaction,
  initialInstruments,
  initialSummary,
  initialTransactions,
  isAggregatePortfolio,
  language,
  selectedPortfolioKey,
  selectedPortfolioName,
  transactionsPath,
}: TransactionWorkspaceClientProps) {
  const copy = getUiCopy(language);
  const [allInstruments, setAllInstruments] = useState(initialAllInstruments);
  const [instruments, setInstruments] = useState(initialInstruments);
  const [summary, setSummary] = useState(initialSummary);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [editingTransaction, setEditingTransaction] = useState(initialEditingTransaction);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);

  useEffect(() => {
    setAllInstruments(initialAllInstruments);
    setInstruments(initialInstruments);
    setSummary(initialSummary);
    setTransactions(initialTransactions);
    setEditingTransaction(initialEditingTransaction);
    setSyncErrorMessage(null);
    setIsSyncingWorkspace(false);
  }, [
    initialAllInstruments,
    initialEditingTransaction,
    initialInstruments,
    initialSummary,
    initialTransactions,
    selectedPortfolioKey,
  ]);

  const refreshWorkspace = useCallback(async () => {
    setSyncErrorMessage(null);
    setIsSyncingWorkspace(true);

    try {
      const searchParams = new URLSearchParams({
        order: "desc",
        portfolioId: selectedPortfolioKey,
      });
      const response = await fetch(`/api/transactions?${searchParams.toString()}`, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const payload = (await response.json()) as WorkspaceApiResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Transactions could not be refreshed.");
      }

      if (payload.allInstruments) {
        setAllInstruments(payload.allInstruments);
      }

      if (payload.instruments) {
        setInstruments(payload.instruments);
      }

      if (payload.summary) {
        setSummary(payload.summary);
      }

      if (payload.transactions) {
        setTransactions(payload.transactions);
        setEditingTransaction((currentTransaction) => {
          if (!currentTransaction) {
            return null;
          }

          const refreshedTransaction =
            payload.transactions?.find((transaction) => transaction.id === currentTransaction.id) ??
            null;

          if (!refreshedTransaction) {
            clearEditTransactionUrl(transactionsPath);
          }

          return refreshedTransaction;
        });
      }
    } catch (error) {
      setSyncErrorMessage(
        error instanceof Error ? error.message : "Transactions could not be refreshed.",
      );
    } finally {
      setIsSyncingWorkspace(false);
    }
  }, [selectedPortfolioKey, transactionsPath]);

  const openEditModal = useCallback(
    (transaction: TransactionListItem) => {
      setEditingTransaction(transaction);
      setEditTransactionUrl(transaction.id, transactionsPath);
    },
    [transactionsPath],
  );

  const closeEditModal = useCallback(() => {
    setEditingTransaction(null);
    clearEditTransactionUrl(transactionsPath);
  }, [transactionsPath]);

  useEffect(() => {
    function handlePopState() {
      const editTransactionId = getEditTransactionIdFromUrl();

      setEditingTransaction(
        editTransactionId == null
          ? null
          : (transactions.find((transaction) => transaction.id === editTransactionId) ?? null),
      );
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [transactions]);

  const editFormInstruments = useMemo(
    () => getEditFormInstruments(editingTransaction, instruments, allInstruments),
    [allInstruments, editingTransaction, instruments],
  );
  const latestTradeDate = summary.latestTradeDate ?? copy.shared.noTradesYet;

  return (
    <section className="transactions-page transactions-workspace" aria-busy={isSyncingWorkspace}>
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.transactions.pageEyebrow}</p>
          <h1>{copy.transactions.pageTitle}</h1>
          <p>
            {copy.transactions.pageDescription} {selectedPortfolioName}
          </p>
        </div>
      </div>

      <div className="transaction-summary-strip" aria-label={copy.transactions.summaryLabel}>
        <div>
          <span>{copy.transactions.recorded}</span>
          <strong>{summary.transactionCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.traded}</span>
          <strong>{summary.uniqueInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.open}</span>
          <strong>{summary.openInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.latest}</span>
          <strong>{latestTradeDate}</strong>
        </div>
        <div>
          <span>{copy.transactions.selectable}</span>
          <strong>{summary.selectableInstrumentCount}</strong>
        </div>
        <div>
          <span>{copy.transactions.allInstruments}</span>
          <strong>{summary.allInstrumentCount}</strong>
        </div>
      </div>

      {syncErrorMessage ? (
        <p className="form-banner form-banner-error">{syncErrorMessage}</p>
      ) : null}
      {isAggregatePortfolio ? (
        <p className="form-banner">{copy.transactions.aggregateReadOnly}</p>
      ) : null}
      {isSyncingWorkspace ? <PendingBanner label={copy.transactions.syncing} /> : null}

      {canEdit ? (
        <>
          <TransactionForm
            instruments={instruments}
            language={language}
            onWorkspaceRefresh={refreshWorkspace}
          />
          {editingTransaction ? (
            <TransactionEditModal
              instruments={editFormInstruments}
              editingTransaction={editingTransaction}
              language={language}
              onClose={closeEditModal}
              onWorkspaceRefresh={refreshWorkspace}
            />
          ) : null}
          <TransactionExcelTools language={language} onWorkspaceRefresh={refreshWorkspace} />
        </>
      ) : null}
      <TransactionTable
        transactions={transactions}
        editingTransactionId={editingTransaction?.id ?? null}
        language={language}
        canEdit={canEdit}
        onCloseEdit={closeEditModal}
        onEdit={openEditModal}
        onWorkspaceRefresh={refreshWorkspace}
      />
    </section>
  );
}
