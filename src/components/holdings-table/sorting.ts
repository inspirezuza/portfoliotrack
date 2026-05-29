import type { HoldingPerformanceKey, HoldingRow } from "@/server/holdings";
import {
  getHoldingPerformance,
  getValuationAverageCost,
  getValuationLastPrice,
  getValuationPerformanceAmount,
  isNativeCurrencyVisible,
} from "@/components/holdings-table/valuation";
import type {
  HoldingFilter,
  HoldingSortKey,
  HoldingsSummary,
  SortState,
} from "@/components/holdings-table/table-helpers";

export function getNextHoldingSortState(
  currentSort: SortState,
  sortKey: HoldingSortKey,
): SortState {
  return currentSort.key === sortKey
    ? {
        key: sortKey,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      }
    : {
        key: sortKey,
        direction: sortKey === "symbol" ? "asc" : "desc",
      };
}

export function getToggledExpandedHoldingIds(currentIds: Set<number>, instrumentId: number) {
  const nextIds = new Set(currentIds);

  if (nextIds.has(instrumentId)) {
    nextIds.delete(instrumentId);
  } else {
    nextIds.add(instrumentId);
  }

  return nextIds;
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

function getHoldingSortValue(
  holding: HoldingRow,
  key: HoldingSortKey,
  performanceKey: HoldingPerformanceKey,
) {
  if (key === "symbol") {
    return `${holding.symbol} ${holding.displayName} ${holding.market}`;
  }

  if (key === "averageCost") {
    return isNativeCurrencyVisible(holding)
      ? getValuationAverageCost(holding)
      : holding.averageCost;
  }

  if (key === "totalCost") {
    return isNativeCurrencyVisible(holding)
      ? holding.totalCostInValuationCurrency
      : holding.totalCost;
  }

  if (key === "lastPrice") {
    return isNativeCurrencyVisible(holding) ? getValuationLastPrice(holding) : holding.lastPrice;
  }

  if (key === "oneDayGain") {
    return getValuationPerformanceAmount(holding, performanceKey);
  }

  if (key === "marketValue") {
    return isNativeCurrencyVisible(holding)
      ? holding.marketValueInValuationCurrency
      : holding.marketValue;
  }

  if (key === "unrealizedPnl") {
    return isNativeCurrencyVisible(holding)
      ? holding.unrealizedPnlInValuationCurrency
      : holding.unrealizedPnl;
  }

  return holding[key];
}

export function compareHoldings(
  left: HoldingRow,
  right: HoldingRow,
  sort: SortState,
  performanceKey: HoldingPerformanceKey,
) {
  const leftValue = getHoldingSortValue(left, sort.key, performanceKey);
  const rightValue = getHoldingSortValue(right, sort.key, performanceKey);
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
    return typeof leftValue === "string" &&
      typeof rightValue === "string" &&
      sort.direction === "desc"
      ? -comparison
      : comparison;
  }

  return left.symbol.localeCompare(right.symbol);
}

export function matchesHoldingFilter(holding: HoldingRow, filter: HoldingFilter) {
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

export function getHoldingSearchText(holding: HoldingRow) {
  return [
    holding.symbol,
    holding.displayName,
    holding.market,
    holding.instrumentType,
    holding.currency,
  ]
    .join(" ")
    .toLowerCase();
}

export function buildVisibleHoldings({
  filter,
  holdings,
  performanceKey,
  searchQuery,
  sort,
}: {
  filter: HoldingFilter;
  holdings: HoldingRow[];
  performanceKey: HoldingPerformanceKey;
  searchQuery: string;
  sort: SortState;
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return holdings
    .filter((holding) => matchesHoldingFilter(holding, filter))
    .filter((holding) =>
      normalizedQuery.length === 0 ? true : getHoldingSearchText(holding).includes(normalizedQuery),
    )
    .sort((left, right) => compareHoldings(left, right, sort, performanceKey));
}

export function getHoldingsSummary(
  holdings: HoldingRow[],
  performanceKey: HoldingPerformanceKey,
): HoldingsSummary {
  return holdings.reduce<HoldingsSummary>(
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
        summary.oneDayGain == null ||
        getHoldingPerformance(holding, performanceKey).amountInValuationCurrency == null
          ? null
          : summary.oneDayGain +
            (getHoldingPerformance(holding, performanceKey).amountInValuationCurrency ?? 0),
      portfolioWeight:
        summary.portfolioWeight == null || holding.portfolioWeight == null
          ? null
          : summary.portfolioWeight + holding.portfolioWeight,
    }),
    {
      totalCost: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      oneDayGain: 0,
      portfolioWeight: 0,
    },
  );
}
