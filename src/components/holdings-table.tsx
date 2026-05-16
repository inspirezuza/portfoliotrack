"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useMemo, useState, useTransition } from "react";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import type { HoldingRow } from "@/server/holdings";

type HoldingsTableProps = {
  holdings: HoldingRow[];
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

const filterOptions: Array<{ value: HoldingFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "gain", label: "Gain" },
  { value: "loss", label: "Loss" },
  { value: "missing", label: "Missing price" }
];

function formatHoldingPrice(value: number | null, currency: string) {
  if (value == null) {
    return <span className="data-pending">No price yet</span>;
  }

  return formatCurrency(value, {
    currency,
    maximumFractionDigits: 4
  });
}

function formatHoldingMoney(value: number | null, currency: string, emptyLabel = "Waiting") {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatCurrency(value, { currency });
}

function formatHoldingPercent(value: number | null, emptyLabel = "Waiting") {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatPercentRatio(value);
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

function formatSummaryMoney(value: number | null, currency: string | null) {
  if (value == null || currency == null) {
    return <span className="data-pending">Mixed</span>;
  }

  return formatCurrency(value, { currency });
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: HoldingSortKey;
  sort: SortState;
  onSort: (key: HoldingSortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  const nextDirection = isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <th scope="col" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="table-sort-button"
        data-sort-state={isActive ? sort.direction : "none"}
        onClick={() => onSort(sortKey)}
        aria-label={`Sort ${label} ${nextDirection}`}
      >
        <span className="table-sort-label">{label}</span>
        <span className="table-sort-icon" aria-hidden="true" />
      </button>
    </th>
  );
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isRefreshRequestPending, setIsRefreshRequestPending] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "marketValue", direction: "desc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshTone, setRefreshTone] = useState<"success" | "warning">("success");

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
        throw new Error(payload.error?.message ?? "Market data refresh failed.");
      }

      const issueCount = payload.issues?.length ?? 0;
      setRefreshTone(issueCount > 0 ? "warning" : "success");
      setRefreshMessage(
        issueCount > 0
          ? `Updated prices with ${issueCount} symbols still needing review.`
          : `Updated ${payload.quoteRefreshCount ?? 0} prices.`
      );

      startRefreshTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setRefreshTone("warning");
      setRefreshMessage(
        error instanceof Error ? error.message : "Market data refresh failed."
      );
    } finally {
      setIsRefreshRequestPending(false);
    }
  }

  const isRefreshBusy = isRefreshRequestPending || isRefreshing;

  return (
    <article className="surface-card holdings-table-card">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">Holdings</p>
          <h2 className="section-title">Current positions</h2>
        </div>
        <button
          type="button"
          className="secondary-button table-refresh-button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshBusy}
        >
          {isRefreshBusy ? "Refreshing..." : "Refresh prices"}
        </button>
      </div>

      {holdings.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No open positions yet. Add a buy transaction and holdings will appear here.</p>
        </div>
      ) : (
        <>
          <div className="table-toolbar" aria-label="Holdings table tools">
            <label className="table-search">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Symbol, name, market"
              />
            </label>
            <div className="table-filter-group" aria-label="Holdings filters">
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
            Showing {visibleHoldings.length} of {holdings.length} positions
          </div>

          <div className="transaction-table-wrap">
            <table className="transaction-table holdings-table">
              <thead>
                <tr>
                  <SortableHeader label="Symbol" sortKey="symbol" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Quantity" sortKey="quantity" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Average cost" sortKey="averageCost" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Total cost" sortKey="totalCost" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Last price" sortKey="lastPrice" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Market value" sortKey="marketValue" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Unrealized P&L" sortKey="unrealizedPnl" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Weight" sortKey="portfolioWeight" sort={sort} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {visibleHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty-cell">
                      No positions match the current filters.
                    </td>
                  </tr>
                ) : (
                  visibleHoldings.map((holding) => (
                    <tr key={holding.instrumentId}>
                      <td>
                        <div className="instrument-cell">
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
                      </td>
                  <td className="table-number">{formatQuantity(holding.quantity)}</td>
                  <td className="table-number">
                    {formatCurrency(holding.averageCost, {
                      currency: holding.currency,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td className="table-number">{formatCurrency(holding.totalCost, { currency: holding.currency })}</td>
                  <td className="table-number">
                    <div className="holdings-value-stack">
                      <span>{formatHoldingPrice(holding.lastPrice, holding.currency)}</span>
                      {holding.lastPriceAsOf ? (
                            <span className="table-subtext">as of {holding.lastPriceAsOf}</span>
                          ) : null}
                    </div>
                  </td>
                  <td className="table-number">{formatHoldingMoney(holding.marketValue, holding.currency)}</td>
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
                            {formatHoldingMoney(holding.unrealizedPnl, holding.currency)}
                          </span>
                          <span className="table-subtext">
                            {formatHoldingPercent(holding.unrealizedPnlPercent)}
                          </span>
                    </div>
                  </td>
                  <td className="table-number">
                    <div className="holdings-weight-cell">
                      <span>{formatHoldingPercent(holding.portfolioWeight, "No data")}</span>
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
                    <th scope="row">Shown total</th>
                    <td className="table-number">{visibleHoldings.length} positions</td>
                    <td />
                    <td className="table-number">{formatSummaryMoney(visibleSummary.totalCost, visibleCurrency)}</td>
                    <td />
                    <td className="table-number">{formatSummaryMoney(visibleSummary.marketValue, visibleCurrency)}</td>
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
                        {formatSummaryMoney(visibleSummary.unrealizedPnl, visibleCurrency)}
                      </span>
                    </td>
                    <td className="table-number">{formatHoldingPercent(visibleSummary.portfolioWeight, "No data")}</td>
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
