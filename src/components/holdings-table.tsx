"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useMemo, useState, useTransition } from "react";
import { InstrumentLogo } from "@/components/instrument-logo";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { HoldingRow } from "@/server/holdings";

type HoldingsTableProps = {
  holdings: HoldingRow[];
  language: UiLanguage;
};

type HoldingSortKey =
  | "symbol"
  | "quantity"
  | "averageCost"
  | "totalCost"
  | "lastPrice"
  | "marketValue"
  | "unrealizedPnl"
  | "portfolioWeight";

type SortDirection = "asc" | "desc";
type HoldingFilter = "all" | "gain" | "loss" | "missing";

type SortState = {
  key: HoldingSortKey;
  direction: SortDirection;
};

type RefreshResponse = {
  quoteRefreshCount?: number;
  issues?: unknown[];
  error?: {
    message?: string;
  };
};

function formatHoldingPrice(
  value: number | null,
  currency: string,
  locale: string,
  emptyLabel: string
) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatCurrency(value, {
    currency,
    locale,
    maximumFractionDigits: 4
  });
}

function formatHoldingMoney(value: number | null, currency: string, locale: string, emptyLabel: string) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatCurrency(value, { currency, locale });
}

function formatHoldingPercent(value: number | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatPercentRatio(value, { locale });
}

function formatHoldingDateTime(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric"
  }).format(date);
}

function compareNullableNumber(left: number | null, right: number | null) {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return left - right;
}

function getHoldingSortValue(holding: HoldingRow, key: HoldingSortKey) {
  if (key === "symbol") {
    return `${holding.symbol} ${holding.displayName} ${holding.market}`;
  }

  return holding[key];
}

function compareHoldings(left: HoldingRow, right: HoldingRow, sort: SortState) {
  const leftValue = getHoldingSortValue(left, sort.key);
  const rightValue = getHoldingSortValue(right, sort.key);
  const comparison =
    typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : compareNullableNumber(leftValue as number | null, rightValue as number | null);

  if (comparison !== 0) {
    return sort.direction === "asc" ? comparison : -comparison;
  }

  return left.symbol.localeCompare(right.symbol);
}

function matchesHoldingFilter(holding: HoldingRow, filter: HoldingFilter) {
  if (filter === "gain") {
    return holding.unrealizedPnl != null && holding.unrealizedPnl > 0;
  }

  if (filter === "loss") {
    return holding.unrealizedPnl != null && holding.unrealizedPnl < 0;
  }

  if (filter === "missing") {
    return holding.marketValue == null;
  }

  return true;
}

function getHoldingSearchText(holding: HoldingRow) {
  return [
    holding.symbol,
    holding.displayName,
    holding.market,
    holding.instrumentType,
    holding.currency
  ]
    .join(" ")
    .toLowerCase();
}

function formatSummaryMoney(
  value: number | null,
  currency: string | null,
  locale: string,
  mixedLabel: string
) {
  if (value == null || currency == null) {
    return <span className="data-pending">{mixedLabel}</span>;
  }

  return formatCurrency(value, { currency, locale });
}

function SortableHeader({
  align = "left",
  label,
  language,
  onSort,
  sort,
  sortKey
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

export function HoldingsTable({ holdings, language }: HoldingsTableProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isRefreshRequestPending, setIsRefreshRequestPending] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "marketValue", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshTone, setRefreshTone] = useState<"success" | "warning">("success");
  const filterOptions: Array<{ value: HoldingFilter; label: string }> = [
    { value: "all", label: copy.holdings.table.filter.all },
    { value: "gain", label: copy.holdings.table.filter.gain },
    { value: "loss", label: copy.holdings.table.filter.loss },
    { value: "missing", label: copy.holdings.table.filter.missing }
  ];

  const visibleHoldings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return holdings
      .filter((holding) => matchesHoldingFilter(holding, filter))
      .filter((holding) =>
        normalizedQuery.length === 0 ? true : getHoldingSearchText(holding).includes(normalizedQuery)
      )
      .sort((left, right) => compareHoldings(left, right, sort));
  }, [filter, holdings, searchQuery, sort]);

  const visibleCurrency = useMemo(() => {
    const currencies = new Set(visibleHoldings.map((holding) => holding.currency));

    return currencies.size === 1 ? visibleHoldings[0]?.currency ?? null : null;
  }, [visibleHoldings]);

  const visibleSummary = useMemo(
    () =>
      visibleHoldings.reduce(
        (summary, holding) => ({
          totalCost: summary.totalCost + holding.totalCost,
          marketValue:
            summary.marketValue == null || holding.marketValue == null
              ? null
              : summary.marketValue + holding.marketValue,
          unrealizedPnl:
            summary.unrealizedPnl == null || holding.unrealizedPnl == null
              ? null
              : summary.unrealizedPnl + holding.unrealizedPnl,
          portfolioWeight:
            summary.portfolioWeight == null || holding.portfolioWeight == null
              ? null
              : summary.portfolioWeight + holding.portfolioWeight
        }),
        {
          totalCost: 0,
          marketValue: 0 as number | null,
          unrealizedPnl: 0 as number | null,
          portfolioWeight: 0 as number | null
        }
      ),
    [visibleHoldings]
  );

  function handleSort(sortKey: HoldingSortKey) {
    setSort((currentSort) =>
      currentSort.key === sortKey
        ? {
            key: sortKey,
            direction: currentSort.direction === "asc" ? "desc" : "asc"
          }
        : {
            key: sortKey,
            direction: sortKey === "symbol" ? "asc" : "desc"
          }
    );
  }

  async function handleRefresh() {
    setRefreshMessage(null);
    setIsRefreshRequestPending(true);

    try {
      const response = await fetch("/api/market-data/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.holdings.table.refreshFailed);
      }

      const issueCount = payload.issues?.length ?? 0;
      setRefreshTone(issueCount > 0 ? "warning" : "success");
      setRefreshMessage(
        issueCount > 0
          ? copy.holdings.table.updatedWithIssues(issueCount)
          : copy.holdings.table.updatedPrices(payload.quoteRefreshCount ?? 0)
      );

      startRefreshTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setRefreshTone("warning");
      setRefreshMessage(error instanceof Error ? error.message : copy.holdings.table.refreshFailed);
    } finally {
      setIsRefreshRequestPending(false);
    }
  }

  const isRefreshBusy = isRefreshRequestPending || isRefreshing;

  return (
    <article className="surface-card holdings-table-card">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">{copy.holdings.table.eyebrow}</p>
          <h2 className="section-title">{copy.holdings.table.title}</h2>
        </div>
        <button
          type="button"
          className="secondary-button table-refresh-button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshBusy}
        >
          {isRefreshBusy ? copy.holdings.table.refreshing : copy.holdings.table.refreshPrices}
        </button>
      </div>

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

          {refreshMessage ? (
            <p className={`table-status table-status-${refreshTone}`}>{refreshMessage}</p>
          ) : null}

          <div className="table-count">
            {copy.shared.countOf(
              visibleHoldings.length,
              holdings.length,
              copy.holdings.table.positionsUnit
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
                <col className="holdings-col-weight" />
              </colgroup>
              <thead>
                <tr>
                  <SortableHeader label={copy.holdings.table.columns.symbol} language={language} sortKey="symbol" sort={sort} onSort={handleSort} />
                  <SortableHeader label={copy.holdings.table.columns.quantity} language={language} sortKey="quantity" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.averageCost} language={language} sortKey="averageCost" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.totalCost} language={language} sortKey="totalCost" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.lastPrice} language={language} sortKey="lastPrice" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.marketValue} language={language} sortKey="marketValue" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.unrealizedPnl} language={language} sortKey="unrealizedPnl" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.weight} language={language} sortKey="portfolioWeight" sort={sort} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {visibleHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty-cell">
                      {copy.holdings.table.noMatches}
                    </td>
                  </tr>
                ) : (
                  visibleHoldings.map((holding) => (
                    <tr key={holding.instrumentId}>
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
                      <td className="table-number">{formatQuantity(holding.quantity, { locale })}</td>
                      <td className="table-number">
                        {formatCurrency(holding.averageCost, {
                          currency: holding.currency,
                          locale,
                          maximumFractionDigits: 4
                        })}
                      </td>
                      <td className="table-number">
                        {formatCurrency(holding.totalCost, { currency: holding.currency, locale })}
                      </td>
                      <td className="table-number">
                        <div className="holdings-value-stack">
                          <span>
                            {formatHoldingPrice(
                              holding.lastPrice,
                              holding.currency,
                              locale,
                              copy.holdings.table.noPriceYet
                            )}
                          </span>
                          {holding.lastPriceAsOf ? (
                            <span className="table-subtext">
                              {copy.holdings.table.asOf(
                                formatHoldingDateTime(holding.lastPriceAsOf, locale)
                              )}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="table-number">
                        {formatHoldingMoney(
                          holding.marketValue,
                          holding.currency,
                          locale,
                          copy.shared.waiting
                        )}
                      </td>
                      <td className="table-number">
                        <div className="holdings-value-stack">
                          <span
                            className={
                              holding.unrealizedPnl == null
                                ? undefined
                                : holding.unrealizedPnl > 0
                                  ? "value-positive"
                                  : holding.unrealizedPnl < 0
                                    ? "value-negative"
                                    : undefined
                            }
                          >
                            {formatHoldingMoney(
                              holding.unrealizedPnl,
                              holding.currency,
                              locale,
                              copy.shared.waiting
                            )}
                          </span>
                          <span className="table-subtext">
                            {formatHoldingPercent(
                              holding.unrealizedPnlPercent,
                              locale,
                              copy.shared.waiting
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
                              copy.holdings.table.noData
                            )}
                          </span>
                          {holding.portfolioWeight == null ? null : (
                            <span
                              className="holdings-weight-bar"
                              style={{ "--weight": `${Math.min(100, holding.portfolioWeight * 100)}%` } as CSSProperties}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
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
                        visibleCurrency,
                        locale,
                        copy.shared.mixed
                      )}
                    </td>
                    <td />
                    <td className="table-number">
                      {formatSummaryMoney(
                        visibleSummary.marketValue,
                        visibleCurrency,
                        locale,
                        copy.shared.mixed
                      )}
                    </td>
                    <td className="table-number">
                      <span
                        className={
                          visibleSummary.unrealizedPnl == null
                            ? undefined
                            : visibleSummary.unrealizedPnl > 0
                              ? "value-positive"
                              : visibleSummary.unrealizedPnl < 0
                                ? "value-negative"
                                : undefined
                        }
                      >
                        {formatSummaryMoney(
                          visibleSummary.unrealizedPnl,
                          visibleCurrency,
                          locale,
                          copy.shared.mixed
                        )}
                      </span>
                    </td>
                    <td className="table-number">
                      {formatHoldingPercent(
                        visibleSummary.portfolioWeight,
                        locale,
                        copy.holdings.table.noData
                      )}
                    </td>
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
