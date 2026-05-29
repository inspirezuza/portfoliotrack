"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { ButtonLoadingContent, PendingBanner } from "@/components/loading-indicator";
import {
  MarketRefreshStatus,
  type MarketRefreshStatusRun,
} from "@/components/market-refresh-status";
import { HoldingDetailDialog } from "@/components/holding-detail-dialog";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import { TransactionEditModal } from "@/components/transaction-edit-modal";
import { HoldingsPositionTable } from "@/components/holdings-table/position-table";
import { HoldingsTableToolbar } from "@/components/holdings-table/table-toolbar";
import {
  buildVisibleHoldings,
  getHoldingsSummary,
  getHoldingLotInstrumentOption,
  getHoldingLotTransaction,
  getNextHoldingSortState,
  getPerformanceKey,
  getToggledExpandedHoldingIds,
  type HoldingFilter,
  type HoldingSortKey,
  type PerformanceBasis,
  type SortState,
} from "@/components/holdings-table/table-helpers";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { HoldingPerformanceTimeframe, HoldingLot, HoldingRow } from "@/server/holdings";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";

type HoldingsTableProps = {
  holdings: HoldingRow[];
  language: UiLanguage;
  canEdit?: boolean;
  canRefresh?: boolean;
};

type RefreshResponse = {
  run?: MarketRefreshStatusRun;
  error?: {
    message?: string;
  };
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

function getDeleteErrorMessage(error: ApiErrorResponse["error"], fallback: string) {
  return error?.message ?? fallback;
}

export function HoldingsTable({
  holdings,
  language,
  canEdit = false,
  canRefresh = false,
}: HoldingsTableProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isRefreshRequestPending, setIsRefreshRequestPending] = useState(false);
  const [editInstruments, setEditInstruments] = useState<TransactionInstrumentOption[]>([]);
  const [editingTransaction, setEditingTransaction] = useState<TransactionListItem | null>(null);
  const [pendingDeleteTransaction, setPendingDeleteTransaction] =
    useState<TransactionListItem | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [activeRefreshRunId, setActiveRefreshRunId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "marketValue", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const [performanceBasis, setPerformanceBasis] = useState<PerformanceBasis>("price");
  const [performanceTimeframe, setPerformanceTimeframe] =
    useState<HoldingPerformanceTimeframe>("1D");
  const [expandedHoldingIds, setExpandedHoldingIds] = useState<Set<number>>(() => new Set());
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshTone, setRefreshTone] = useState<"success" | "warning">("success");
  const selectedPerformanceKey = getPerformanceKey({
    basis: performanceBasis,
    timeframe: performanceTimeframe,
  });
  const visibleHoldings = useMemo(
    () =>
      buildVisibleHoldings({
        filter,
        holdings,
        performanceKey: selectedPerformanceKey,
        searchQuery,
        sort,
      }),
    [filter, holdings, searchQuery, selectedPerformanceKey, sort],
  );
  const visibleSummaryCurrency = visibleHoldings[0]?.valuationCurrency ?? null;

  const visibleSummary = useMemo(
    () => getHoldingsSummary(visibleHoldings, selectedPerformanceKey),
    [selectedPerformanceKey, visibleHoldings],
  );

  function handleSort(sortKey: HoldingSortKey) {
    setSort((currentSort) => getNextHoldingSortState(currentSort, sortKey));
  }

  function toggleHoldingLots(instrumentId: number) {
    setExpandedHoldingIds((currentIds) => getToggledExpandedHoldingIds(currentIds, instrumentId));
  }

  function refreshHoldings() {
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  function handleEditHoldingLot(holding: HoldingRow, lot: HoldingLot) {
    setDeleteErrorMessage(null);
    setEditInstruments([getHoldingLotInstrumentOption(holding)]);
    setEditingTransaction(getHoldingLotTransaction(holding, lot));
  }

  function handleDeleteHoldingLot(holding: HoldingRow, lot: HoldingLot) {
    setDeleteErrorMessage(null);
    setPendingDeleteTransaction(getHoldingLotTransaction(holding, lot));
  }

  async function confirmDeleteHoldingLot() {
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

      if (editingTransaction?.id === pendingDeleteTransaction.id) {
        setEditingTransaction(null);
        setEditInstruments([]);
      }

      setPendingDeleteTransaction(null);
      refreshHoldings();
    } catch (error) {
      setDeleteErrorMessage(
        error instanceof Error ? error.message : copy.transactions.table.deleteCouldNot,
      );
    } finally {
      setDeletingTransactionId(null);
    }
  }

  const handleRefreshSettled = useCallback(
    (run: MarketRefreshStatusRun) => {
      setActiveRefreshRunId(null);

      if (run.status === "success") {
        setRefreshTone(run.issueCount > 0 ? "warning" : "success");
        setRefreshMessage(
          run.issueCount > 0
            ? copy.holdings.table.updatedWithIssues(run.issueCount)
            : copy.holdings.table.updatedPrices(run.quoteRefreshCount),
        );
        startRefreshTransition(() => {
          router.refresh();
        });
        return;
      }

      if (run.status === "failed") {
        setRefreshTone("warning");
        setRefreshMessage(run.errorMessage ?? copy.holdings.table.refreshFailed);
      }
    },
    [copy.holdings.table, router],
  );

  async function handleRefresh() {
    setRefreshMessage(null);
    setIsRefreshRequestPending(true);

    try {
      const response = await fetch("/api/market-data/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.holdings.table.refreshFailed);
      }

      if (payload.run == null) {
        throw new Error(copy.holdings.table.refreshFailed);
      }

      setActiveRefreshRunId(payload.run.id);
      setRefreshTone("success");
      setRefreshMessage(copy.holdings.table.refreshStarted);
    } catch (error) {
      setRefreshTone("warning");
      setRefreshMessage(error instanceof Error ? error.message : copy.holdings.table.refreshFailed);
    } finally {
      setIsRefreshRequestPending(false);
    }
  }

  const isRefreshBusy = isRefreshRequestPending || isRefreshing || activeRefreshRunId != null;
  const isTransactionActionBusy = deletingTransactionId != null || isRefreshing;

  return (
    <article
      className="surface-card holdings-table-card"
      aria-busy={isRefreshBusy || isTransactionActionBusy}
    >
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">{copy.holdings.table.eyebrow}</p>
          <h2 className="section-title">{copy.holdings.table.title}</h2>
        </div>
        {canRefresh ? (
          <button
            type="button"
            className="secondary-button table-refresh-button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshBusy}
          >
            {isRefreshBusy ? (
              <ButtonLoadingContent label={copy.holdings.table.refreshing}>
                {copy.holdings.table.refreshPrices}
              </ButtonLoadingContent>
            ) : (
              copy.holdings.table.refreshPrices
            )}
          </button>
        ) : null}
      </div>

      {isRefreshBusy ? <PendingBanner label={copy.holdings.table.refreshing} /> : null}
      {deleteErrorMessage ? (
        <p className="form-banner form-banner-error">{deleteErrorMessage}</p>
      ) : null}

      {activeRefreshRunId != null ? (
        <MarketRefreshStatus
          language={language}
          onSettled={handleRefreshSettled}
          runId={activeRefreshRunId}
        />
      ) : null}

      {editingTransaction ? (
        <TransactionEditModal
          instruments={editInstruments}
          editingTransaction={editingTransaction}
          language={language}
          onClose={() => {
            setEditingTransaction(null);
            setEditInstruments([]);
          }}
          onWorkspaceRefresh={refreshHoldings}
        />
      ) : null}

      {detailSymbol ? (
        <HoldingDetailDialog
          key={detailSymbol}
          symbol={detailSymbol}
          language={language}
          onClose={() => setDetailSymbol(null)}
        />
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
          onConfirm={confirmDeleteHoldingLot}
        />
      ) : null}

      {holdings.length === 0 ? (
        <div className="transaction-empty-state">
          <p>{copy.holdings.table.noOpenPositions}</p>
        </div>
      ) : (
        <>
          <HoldingsTableToolbar
            copy={copy}
            filter={filter}
            onFilterChange={setFilter}
            onPerformanceBasisChange={setPerformanceBasis}
            onPerformanceTimeframeChange={setPerformanceTimeframe}
            onSearchQueryChange={setSearchQuery}
            performanceBasis={performanceBasis}
            performanceTimeframe={performanceTimeframe}
            searchQuery={searchQuery}
          />

          {refreshMessage ? (
            <p className={`table-status table-status-${refreshTone}`}>{refreshMessage}</p>
          ) : null}

          <div className="table-count">
            {copy.shared.countOf(
              visibleHoldings.length,
              holdings.length,
              copy.holdings.table.positionsUnit,
            )}
          </div>

          <HoldingsPositionTable
            canEdit={canEdit}
            copy={copy}
            deletingTransactionId={deletingTransactionId}
            expandedHoldingIds={expandedHoldingIds}
            language={language}
            locale={locale}
            onDeleteHoldingLot={handleDeleteHoldingLot}
            onEditHoldingLot={handleEditHoldingLot}
            onOpenHoldingDetail={setDetailSymbol}
            onSort={handleSort}
            onToggleHoldingLots={toggleHoldingLots}
            performanceBasis={performanceBasis}
            performanceTimeframe={performanceTimeframe}
            selectedPerformanceKey={selectedPerformanceKey}
            sort={sort}
            visibleHoldings={visibleHoldings}
            visibleSummary={visibleSummary}
            visibleSummaryCurrency={visibleSummaryCurrency}
          />
        </>
      )}
    </article>
  );
}
