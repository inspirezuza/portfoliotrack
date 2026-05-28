"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import { InstrumentLogo } from "@/components/instrument-logo";
import { ButtonLoadingContent, PendingBanner } from "@/components/loading-indicator";
import {
  MarketRefreshStatus,
  type MarketRefreshStatusRun,
} from "@/components/market-refresh-status";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import { TransactionEditModal } from "@/components/transaction-edit-modal";
import {
  formatHoldingDateTime,
  formatHoldingPercent,
  formatHoldingValuationMoney,
  formatParentMoney,
  formatSignedHoldingPercent,
  formatSummaryMoney,
  formatValuationMoneyText,
  getPnlToneClass,
  isNativeCurrencyVisible,
} from "@/components/holdings-table/display-helpers";
import { HoldingLotsPanel } from "@/components/holdings-table/holding-lots-panel";
import {
  buildVisibleHoldings,
  getHoldingsSummary,
  getHoldingLotInstrumentOption,
  getHoldingLotTransaction,
  getHoldingPerformance,
  getPerformanceKey,
  getValuationAverageCost,
  getValuationLastPrice,
  PERFORMANCE_TIMEFRAMES,
  type HoldingFilter,
  type HoldingSortKey,
  type PerformanceBasis,
  type SortState,
} from "@/components/holdings-table/table-helpers";
import { formatQuantity } from "@/lib/format";
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

function getPricePerformanceTimeframeLabel(
  copy: ReturnType<typeof getUiCopy>,
  timeframe: HoldingPerformanceTimeframe,
) {
  return copy.holdings.table.timeframes[timeframe];
}

function getPerformanceColumnLabel({
  basis,
  copy,
  timeframe,
}: {
  basis: PerformanceBasis;
  copy: ReturnType<typeof getUiCopy>;
  timeframe: HoldingPerformanceTimeframe;
}) {
  const timeframeLabel = getPricePerformanceTimeframeLabel(copy, timeframe);

  return basis === "cost"
    ? copy.holdings.table.columns.performance(
        `${copy.holdings.table.performanceBasis.cost} ${timeframeLabel}`,
      )
    : copy.holdings.table.columns.performance(timeframeLabel);
}

function shouldIgnoreHoldingRowToggle(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;

  return target instanceof HTMLElement
    ? target.closest("a, button, input, select, textarea, [data-row-toggle-ignore]") != null
    : false;
}

function getDeleteErrorMessage(error: ApiErrorResponse["error"], fallback: string) {
  return error?.message ?? fallback;
}

function SortableHeader({
  align = "left",
  label,
  language,
  onSort,
  sort,
  sortKey,
}: {
  align?: "left" | "right";
  label: string;
  language: UiLanguage;
  onSort: (key: HoldingSortKey) => void;
  sort: SortState;
  sortKey: HoldingSortKey;
}) {
  const copy = getUiCopy(language).shared;
  const isActive = sort.key === sortKey;
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
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshTone, setRefreshTone] = useState<"success" | "warning">("success");
  const filterOptions: Array<{ value: HoldingFilter; label: string }> = [
    { value: "all", label: copy.holdings.table.filter.all },
    { value: "gain", label: copy.holdings.table.filter.gain },
    { value: "loss", label: copy.holdings.table.filter.loss },
    { value: "missing", label: copy.holdings.table.filter.missing },
  ];
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
    setSort((currentSort) =>
      currentSort.key === sortKey
        ? {
            key: sortKey,
            direction: currentSort.direction === "asc" ? "desc" : "asc",
          }
        : {
            key: sortKey,
            direction: sortKey === "symbol" ? "asc" : "desc",
          },
    );
  }

  function toggleHoldingLots(instrumentId: number) {
    setExpandedHoldingIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(instrumentId)) {
        nextIds.delete(instrumentId);
      } else {
        nextIds.add(instrumentId);
      }

      return nextIds;
    });
  }

  function handleHoldingRowClick(event: MouseEvent<HTMLTableRowElement>, instrumentId: number) {
    if (shouldIgnoreHoldingRowToggle(event)) {
      return;
    }

    toggleHoldingLots(instrumentId);
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
          <div className="table-toolbar" aria-label={copy.holdings.table.toolsLabel}>
            <label className="table-search">
              <span>{copy.shared.search}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={copy.holdings.table.searchPlaceholder}
              />
            </label>
            <div className="table-toolbar-controls holdings-performance-controls">
              <div className="holdings-performance-cluster">
                <div
                  className="table-filter-group holdings-basis-group"
                  aria-label={copy.holdings.table.performanceBasisLabel}
                >
                  <button
                    type="button"
                    className="table-filter-button holdings-basis-button"
                    aria-pressed={performanceBasis === "price"}
                    onClick={() => setPerformanceBasis("price")}
                  >
                    {copy.holdings.table.performanceBasis.price}
                  </button>
                  <button
                    type="button"
                    className="table-filter-button holdings-basis-button"
                    aria-pressed={performanceBasis === "cost"}
                    onClick={() => setPerformanceBasis("cost")}
                  >
                    {copy.holdings.table.performanceBasis.cost}
                  </button>
                </div>
                <div
                  className="table-filter-group holdings-timeframe-group"
                  aria-label={copy.holdings.table.performanceTimeframesLabel}
                >
                  {PERFORMANCE_TIMEFRAMES.map((timeframe) => (
                    <button
                      key={timeframe}
                      type="button"
                      className="table-filter-button holdings-timeframe-button"
                      aria-pressed={performanceTimeframe === timeframe}
                      onClick={() => setPerformanceTimeframe(timeframe)}
                    >
                      {getPricePerformanceTimeframeLabel(copy, timeframe)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-filter-group" aria-label={copy.holdings.table.filtersLabel}>
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="table-filter-button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

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

          <div className="transaction-table-wrap">
            <table className="transaction-table holdings-table">
              <colgroup>
                <col className="holdings-col-symbol" />
                <col className="holdings-col-quantity" />
                <col className="holdings-col-average" />
                <col className="holdings-col-total" />
                <col className="holdings-col-price" />
                <col className="holdings-col-market" />
                <col className="holdings-col-pnl" />
                <col className="holdings-col-pnl" />
                <col className="holdings-col-weight" />
                <col className="holdings-col-expand" />
              </colgroup>
              <thead>
                <tr>
                  <SortableHeader
                    label={copy.holdings.table.columns.symbol}
                    language={language}
                    sortKey="symbol"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.quantity}
                    language={language}
                    sortKey="quantity"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.averageCost}
                    language={language}
                    sortKey="averageCost"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.totalCost}
                    language={language}
                    sortKey="totalCost"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.lastPrice}
                    language={language}
                    sortKey="lastPrice"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.marketValue}
                    language={language}
                    sortKey="marketValue"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={getPerformanceColumnLabel({
                      basis: performanceBasis,
                      copy,
                      timeframe: performanceTimeframe,
                    })}
                    language={language}
                    sortKey="oneDayGain"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.unrealizedPnl}
                    language={language}
                    sortKey="unrealizedPnl"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label={copy.holdings.table.columns.weight}
                    language={language}
                    sortKey="portfolioWeight"
                    sort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <th scope="col" className="holdings-expand-heading">
                    <span className="sr-only">{copy.holdings.table.lots.expandColumn}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="table-empty-cell">
                      {copy.holdings.table.noMatches}
                    </td>
                  </tr>
                ) : (
                  visibleHoldings.map((holding) => {
                    const selectedPerformance = getHoldingPerformance(
                      holding,
                      selectedPerformanceKey,
                    );
                    const isExpanded = expandedHoldingIds.has(holding.instrumentId);
                    const lotsId = `holding-lots-${holding.instrumentId}`;

                    return (
                      <Fragment key={holding.instrumentId}>
                        <tr
                          data-clickable="true"
                          data-expanded={isExpanded}
                          onClick={(event) => handleHoldingRowClick(event, holding.instrumentId)}
                        >
                          <td>
                            <div className="instrument-cell instrument-cell-with-logo">
                              <InstrumentLogo
                                symbol={holding.symbol}
                                displayName={holding.displayName}
                                instrumentType={holding.instrumentType}
                                providerSymbol={holding.providerSymbol}
                                underlyingProviderSymbol={holding.underlyingProviderSymbol}
                              />
                              <div className="instrument-cell-copy">
                                <strong>
                                  <Link
                                    href={`/assets/${encodeURIComponent(holding.symbol)}`}
                                    className="route-link"
                                  >
                                    {holding.symbol}
                                  </Link>
                                </strong>
                                <span>
                                  {holding.displayName} - {holding.market}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="table-number">
                            {formatQuantity(holding.quantity, { locale })}
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              {formatHoldingValuationMoney({
                                emptyLabel: copy.shared.waiting,
                                holding,
                                locale,
                                maximumFractionDigits: 4,
                                nativeValue: holding.averageCost,
                                primaryValue: isNativeCurrencyVisible(holding)
                                  ? getValuationAverageCost(holding)
                                  : holding.averageCost,
                              })}
                              {formatParentMoney(
                                holding.parentAverageCost,
                                holding.underlyingCurrency,
                                locale,
                              ) == null ? null : (
                                <span className="table-subtext dr-parent-metric">
                                  {holding.underlyingSymbol ?? "Parent"} avg{" "}
                                  {formatParentMoney(
                                    holding.parentAverageCost,
                                    holding.underlyingCurrency,
                                    locale,
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              {formatHoldingValuationMoney({
                                emptyLabel: copy.shared.waiting,
                                holding,
                                locale,
                                nativeValue: holding.totalCost,
                                primaryValue: holding.totalCostInValuationCurrency,
                              })}
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              {formatHoldingValuationMoney({
                                emptyLabel: copy.holdings.table.noPriceYet,
                                holding,
                                locale,
                                maximumFractionDigits: 4,
                                nativeValue: holding.lastPrice,
                                primaryValue: isNativeCurrencyVisible(holding)
                                  ? getValuationLastPrice(holding)
                                  : holding.lastPrice,
                              })}
                              {holding.lastPriceAsOf ? (
                                <span className="table-subtext">
                                  {copy.holdings.table.asOf(
                                    formatHoldingDateTime(holding.lastPriceAsOf, locale),
                                  )}
                                </span>
                              ) : null}
                              {formatParentMoney(
                                holding.parentLastPrice,
                                holding.underlyingCurrency,
                                locale,
                              ) == null ? null : (
                                <span className="table-subtext dr-parent-metric">
                                  {holding.underlyingSymbol ?? "Parent"} last{" "}
                                  {formatParentMoney(
                                    holding.parentLastPrice,
                                    holding.underlyingCurrency,
                                    locale,
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              {formatHoldingValuationMoney({
                                emptyLabel: copy.shared.waiting,
                                holding,
                                locale,
                                nativeValue: holding.marketValue,
                                primaryValue: holding.marketValueInValuationCurrency,
                              })}
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              <span
                                className={`holdings-pnl-percent ${getPnlToneClass(selectedPerformance.percent) ?? ""}`.trim()}
                              >
                                {formatSignedHoldingPercent(
                                  selectedPerformance.percent,
                                  locale,
                                  copy.shared.waiting,
                                )}
                              </span>
                              <span
                                className={`table-subtext ${getPnlToneClass(selectedPerformance.amountInValuationCurrency) ?? ""}`.trim()}
                              >
                                {formatValuationMoneyText({
                                  currency: holding.valuationCurrency,
                                  locale,
                                  value: selectedPerformance.amountInValuationCurrency,
                                }) ?? copy.shared.waiting}
                              </span>
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-value-stack">
                              <div
                                className={getPnlToneClass(
                                  holding.unrealizedPnlInValuationCurrency,
                                )}
                              >
                                {formatHoldingValuationMoney({
                                  emptyLabel: copy.shared.waiting,
                                  holding,
                                  locale,
                                  nativeValue: holding.unrealizedPnl,
                                  primaryValue: holding.unrealizedPnlInValuationCurrency,
                                })}
                              </div>
                              <span
                                className={`holdings-pnl-percent ${getPnlToneClass(holding.unrealizedPnlPercent) ?? ""}`.trim()}
                              >
                                {formatSignedHoldingPercent(
                                  holding.unrealizedPnlPercent,
                                  locale,
                                  copy.shared.waiting,
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="table-number">
                            <div className="holdings-weight-cell">
                              <span>
                                {formatHoldingPercent(
                                  holding.portfolioWeight,
                                  locale,
                                  copy.holdings.table.noData,
                                )}
                              </span>
                              {holding.portfolioWeight == null ? null : (
                                <span
                                  className="holdings-weight-bar"
                                  style={
                                    {
                                      "--weight": `${Math.min(100, holding.portfolioWeight * 100)}%`,
                                    } as CSSProperties
                                  }
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          </td>
                          <td className="holdings-expand-cell">
                            <button
                              type="button"
                              className="holdings-expand-button"
                              aria-controls={lotsId}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? copy.holdings.table.lots.collapse(holding.symbol)
                                  : copy.holdings.table.lots.expand(holding.symbol)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleHoldingLots(holding.instrumentId);
                              }}
                            >
                              <span aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="holdings-lot-row">
                            <td colSpan={10}>
                              <HoldingLotsPanel
                                holding={holding}
                                id={lotsId}
                                language={language}
                                canEdit={canEdit}
                                deletingTransactionId={deletingTransactionId}
                                lots={holding.lots}
                                onDelete={handleDeleteHoldingLot}
                                onEdit={handleEditHoldingLot}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              {visibleHoldings.length > 0 ? (
                <tfoot>
                  <tr>
                    <th scope="row">{copy.holdings.table.shownTotal}</th>
                    <td className="table-number">
                      {copy.shared.positionCount(visibleHoldings.length)}
                    </td>
                    <td />
                    <td className="table-number">
                      {formatSummaryMoney(
                        visibleSummary.totalCost,
                        visibleSummaryCurrency,
                        locale,
                        copy.shared.mixed,
                      )}
                    </td>
                    <td />
                    <td className="table-number">
                      {formatSummaryMoney(
                        visibleSummary.marketValue,
                        visibleSummaryCurrency,
                        locale,
                        copy.shared.mixed,
                      )}
                    </td>
                    <td className="table-number">
                      <span className={getPnlToneClass(visibleSummary.oneDayGain)}>
                        {formatSummaryMoney(
                          visibleSummary.oneDayGain,
                          visibleSummaryCurrency,
                          locale,
                          copy.shared.mixed,
                        )}
                      </span>
                    </td>
                    <td className="table-number">
                      <span className={getPnlToneClass(visibleSummary.unrealizedPnl)}>
                        {formatSummaryMoney(
                          visibleSummary.unrealizedPnl,
                          visibleSummaryCurrency,
                          locale,
                          copy.shared.mixed,
                        )}
                      </span>
                    </td>
                    <td className="table-number">
                      {formatHoldingPercent(
                        visibleSummary.portfolioWeight,
                        locale,
                        copy.holdings.table.noData,
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}
    </article>
  );
}
