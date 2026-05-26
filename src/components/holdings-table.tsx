"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useCallback, useMemo, useState, useTransition } from "react";
import { InstrumentLogo } from "@/components/instrument-logo";
import { ButtonLoadingContent, PendingBanner } from "@/components/loading-indicator";
import { MarketRefreshStatus, type MarketRefreshStatusRun } from "@/components/market-refresh-status";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { HoldingRow } from "@/server/holdings";

type HoldingsTableProps = {
  holdings: HoldingRow[];
  language: UiLanguage;
  canRefresh?: boolean;
};

type HoldingSortKey =
  | "symbol"
  | "quantity"
  | "averageCost"
  | "totalCost"
  | "lastPrice"
  | "oneDayGain"
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
  run?: MarketRefreshStatusRun;
  error?: {
    message?: string;
  };
};

function isNativeCurrencyVisible(holding: HoldingRow) {
  return holding.currency !== holding.valuationCurrency;
}

function getValuationAverageCost(holding: HoldingRow) {
  return holding.fxRateToValuationCurrency == null
    ? null
    : holding.averageCost * holding.fxRateToValuationCurrency;
}

function getValuationLastPrice(holding: HoldingRow) {
  return holding.lastPrice == null || holding.fxRateToValuationCurrency == null
    ? null
    : holding.lastPrice * holding.fxRateToValuationCurrency;
}

function getValuationOneDayGain(holding: HoldingRow) {
  return isNativeCurrencyVisible(holding)
    ? holding.oneDayGainInValuationCurrency
    : holding.oneDayGain;
}

function formatHoldingValuationMoney({
  emptyLabel,
  holding,
  locale,
  nativeValue,
  primaryValue,
  maximumFractionDigits = 2
}: {
  emptyLabel: string;
  holding: HoldingRow;
  locale: string;
  nativeValue: number | null;
  primaryValue: number | null;
  maximumFractionDigits?: number;
}) {
  if (primaryValue == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return (
    <>
      <span>
        {formatCurrency(primaryValue, {
          currency: holding.valuationCurrency,
          locale,
          maximumFractionDigits
        })}
      </span>
      {!isNativeCurrencyVisible(holding) || nativeValue == null ? null : (
        <span className="table-subtext">
          {formatCurrency(nativeValue, {
            currency: holding.currency,
            locale,
            maximumFractionDigits
          })}
        </span>
      )}
    </>
  );
}

function formatHoldingPercent(value: number | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatPercentRatio(value, { locale });
}

function formatSignedHoldingPercent(value: number | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  const formattedValue = formatPercentRatio(value, { locale });

  return value > 0 ? `+${formattedValue}` : formattedValue;
}

function getPnlToneClass(value: number | null) {
  if (value == null || value === 0) {
    return undefined;
  }

  return value > 0 ? "value-positive" : "value-negative";
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

function formatParentMoney(value: number | null, currency: string | null, locale: string) {
  if (value == null || currency == null) {
    return null;
  }

  return formatCurrency(value, {
    currency,
    locale,
    maximumFractionDigits: 4
  });
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

  if (key === "averageCost") {
    return isNativeCurrencyVisible(holding) ? getValuationAverageCost(holding) : holding.averageCost;
  }

  if (key === "totalCost") {
    return isNativeCurrencyVisible(holding) ? holding.totalCostInValuationCurrency : holding.totalCost;
  }

  if (key === "lastPrice") {
    return isNativeCurrencyVisible(holding) ? getValuationLastPrice(holding) : holding.lastPrice;
  }

  if (key === "oneDayGain") {
    return getValuationOneDayGain(holding);
  }

  if (key === "marketValue") {
    return isNativeCurrencyVisible(holding) ? holding.marketValueInValuationCurrency : holding.marketValue;
  }

  if (key === "unrealizedPnl") {
    return isNativeCurrencyVisible(holding) ? holding.unrealizedPnlInValuationCurrency : holding.unrealizedPnl;
  }

  return holding[key];
}

function compareHoldings(left: HoldingRow, right: HoldingRow, sort: SortState) {
  const leftValue = getHoldingSortValue(left, sort.key);
  const rightValue = getHoldingSortValue(right, sort.key);
  const comparison = (() => {
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue);
    }

    if (leftValue == null && rightValue == null) {
      return 0;
    }

    if (leftValue == null) {
      return 1;
    }

    if (rightValue == null) {
      return -1;
    }

    const numericComparison = compareNullableNumber(leftValue as number, rightValue as number);

    return sort.direction === "asc" ? numericComparison : -numericComparison;
  })();

  if (comparison !== 0) {
    return typeof leftValue === "string" && typeof rightValue === "string" && sort.direction === "desc"
      ? -comparison
      : comparison;
  }

  return left.symbol.localeCompare(right.symbol);
}

function matchesHoldingFilter(holding: HoldingRow, filter: HoldingFilter) {
  const unrealizedPnl = isNativeCurrencyVisible(holding)
    ? holding.unrealizedPnlInValuationCurrency
    : holding.unrealizedPnl;

  if (filter === "gain") {
    return unrealizedPnl != null && unrealizedPnl > 0;
  }

  if (filter === "loss") {
    return unrealizedPnl != null && unrealizedPnl < 0;
  }

  if (filter === "missing") {
    return isNativeCurrencyVisible(holding)
      ? holding.marketValueInValuationCurrency == null
      : holding.marketValue == null;
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

export function HoldingsTable({
  holdings,
  language,
  canRefresh = false
}: HoldingsTableProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isRefreshRequestPending, setIsRefreshRequestPending] = useState(false);
  const [activeRefreshRunId, setActiveRefreshRunId] = useState<number | null>(null);
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
  const visibleSummaryCurrency = visibleHoldings[0]?.valuationCurrency ?? null;

  const visibleSummary = useMemo(
    () =>
      visibleHoldings.reduce(
        (summary, holding) => ({
          totalCost:
            summary.totalCost == null || holding.totalCostInValuationCurrency == null
              ? null
              : summary.totalCost + holding.totalCostInValuationCurrency,
          marketValue:
            summary.marketValue == null || holding.marketValueInValuationCurrency == null
              ? null
              : summary.marketValue + holding.marketValueInValuationCurrency,
          unrealizedPnl:
            summary.unrealizedPnl == null || holding.unrealizedPnlInValuationCurrency == null
              ? null
              : summary.unrealizedPnl + holding.unrealizedPnlInValuationCurrency,
          oneDayGain:
            summary.oneDayGain == null || holding.oneDayGainInValuationCurrency == null
              ? null
              : summary.oneDayGain + holding.oneDayGainInValuationCurrency,
          portfolioWeight:
            summary.portfolioWeight == null || holding.portfolioWeight == null
              ? null
              : summary.portfolioWeight + holding.portfolioWeight
        }),
        {
          totalCost: 0 as number | null,
          marketValue: 0 as number | null,
          unrealizedPnl: 0 as number | null,
          oneDayGain: 0 as number | null,
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

  const handleRefreshSettled = useCallback(
    (run: MarketRefreshStatusRun) => {
      setActiveRefreshRunId(null);

      if (run.status === "success") {
        setRefreshTone(run.issueCount > 0 ? "warning" : "success");
        setRefreshMessage(
          run.issueCount > 0
            ? copy.holdings.table.updatedWithIssues(run.issueCount)
            : copy.holdings.table.updatedPrices(run.quoteRefreshCount)
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
    [copy.holdings.table, router]
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

  return (
    <article className="surface-card holdings-table-card" aria-busy={isRefreshBusy}>
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

      {activeRefreshRunId != null ? (
        <MarketRefreshStatus
          language={language}
          onSettled={handleRefreshSettled}
          runId={activeRefreshRunId}
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
                <col className="holdings-col-pnl" />
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
                  <SortableHeader label={copy.holdings.table.columns.oneDayGain} language={language} sortKey="oneDayGain" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.marketValue} language={language} sortKey="marketValue" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.unrealizedPnl} language={language} sortKey="unrealizedPnl" sort={sort} onSort={handleSort} align="right" />
                  <SortableHeader label={copy.holdings.table.columns.weight} language={language} sortKey="portfolioWeight" sort={sort} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {visibleHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-empty-cell">
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
                        <div className="holdings-value-stack">
                          {formatHoldingValuationMoney({
                            emptyLabel: copy.shared.waiting,
                            holding,
                            locale,
                            maximumFractionDigits: 4,
                            nativeValue: holding.averageCost,
                            primaryValue: isNativeCurrencyVisible(holding)
                              ? getValuationAverageCost(holding)
                              : holding.averageCost
                          })}
                          {formatParentMoney(
                            holding.parentAverageCost,
                            holding.underlyingCurrency,
                            locale
                          ) == null ? null : (
                            <span className="table-subtext dr-parent-metric">
                              {holding.underlyingSymbol ?? "Parent"} avg{" "}
                              {formatParentMoney(
                                holding.parentAverageCost,
                                holding.underlyingCurrency,
                                locale
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-number">
                        <div className="holdings-value-stack">
                          <div className={getPnlToneClass(holding.oneDayGainInValuationCurrency)}>
                            {formatHoldingValuationMoney({
                              emptyLabel: copy.shared.waiting,
                              holding,
                              locale,
                              nativeValue: holding.oneDayGain,
                              primaryValue: holding.oneDayGainInValuationCurrency
                            })}
                          </div>
                          <span className={`holdings-pnl-percent ${getPnlToneClass(holding.oneDayGainPercent) ?? ""}`.trim()}>
                            {formatSignedHoldingPercent(
                              holding.oneDayGainPercent,
                              locale,
                              copy.shared.waiting
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="table-number">
                        <div className="holdings-value-stack">
                          {formatHoldingValuationMoney({
                            emptyLabel: copy.shared.waiting,
                            holding,
                            locale,
                            nativeValue: holding.totalCost,
                            primaryValue: holding.totalCostInValuationCurrency
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
                              : holding.lastPrice
                          })}
                          {holding.lastPriceAsOf ? (
                            <span className="table-subtext">
                              {copy.holdings.table.asOf(
                                formatHoldingDateTime(holding.lastPriceAsOf, locale)
                              )}
                            </span>
                          ) : null}
                          {formatParentMoney(
                            holding.parentLastPrice,
                            holding.underlyingCurrency,
                            locale
                          ) == null ? null : (
                            <span className="table-subtext dr-parent-metric">
                              {holding.underlyingSymbol ?? "Parent"} last{" "}
                              {formatParentMoney(
                                holding.parentLastPrice,
                                holding.underlyingCurrency,
                                locale
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
                            primaryValue: holding.marketValueInValuationCurrency
                          })}
                        </div>
                      </td>
                      <td className="table-number">
                        <div className="holdings-value-stack">
                          <div className={getPnlToneClass(holding.unrealizedPnlInValuationCurrency)}>
                            {formatHoldingValuationMoney({
                              emptyLabel: copy.shared.waiting,
                              holding,
                              locale,
                              nativeValue: holding.unrealizedPnl,
                              primaryValue: holding.unrealizedPnlInValuationCurrency
                            })}
                          </div>
                          <span className={`holdings-pnl-percent ${getPnlToneClass(holding.unrealizedPnlPercent) ?? ""}`.trim()}>
                            {formatSignedHoldingPercent(
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
                      <span
                        className={getPnlToneClass(visibleSummary.oneDayGain)}
                      >
                        {formatSummaryMoney(
                          visibleSummary.oneDayGain,
                          visibleSummaryCurrency,
                          locale,
                          copy.shared.mixed
                        )}
                      </span>
                    </td>
                    <td className="table-number">
                      {formatSummaryMoney(
                        visibleSummary.totalCost,
                        visibleSummaryCurrency,
                        locale,
                        copy.shared.mixed
                      )}
                    </td>
                    <td />
                    <td className="table-number">
                      {formatSummaryMoney(
                        visibleSummary.marketValue,
                        visibleSummaryCurrency,
                        locale,
                        copy.shared.mixed
                      )}
                    </td>
                    <td className="table-number">
                      <span
                        className={getPnlToneClass(visibleSummary.unrealizedPnl)}
                      >
                        {formatSummaryMoney(
                          visibleSummary.unrealizedPnl,
                          visibleSummaryCurrency,
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
