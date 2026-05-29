import type { HoldingPerformanceKey, HoldingPerformanceTimeframe } from "@/server/holdings";
import type { getUiCopy } from "@/lib/ui/copy";

export type HoldingSortKey =
  | "symbol"
  | "quantity"
  | "averageCost"
  | "totalCost"
  | "lastPrice"
  | "oneDayGain"
  | "marketValue"
  | "unrealizedPnl"
  | "portfolioWeight";

export type SortDirection = "asc" | "desc";
export type HoldingFilter = "all" | "gain" | "loss" | "missing";

export type SortState = {
  key: HoldingSortKey;
  direction: SortDirection;
};

export type PerformanceBasis = "price" | "cost";

export type HoldingsSummary = {
  totalCost: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  oneDayGain: number | null;
  portfolioWeight: number | null;
};

export {
  EMPTY_PERFORMANCE,
  getHoldingPerformance,
  getValuationAverageCost,
  getValuationLastPrice,
  getValuationPerformanceAmount,
  isNativeCurrencyVisible,
} from "@/components/holdings-table/valuation";
export {
  buildVisibleHoldings,
  compareHoldings,
  getHoldingSearchText,
  getHoldingsSummary,
  getNextHoldingSortState,
  getToggledExpandedHoldingIds,
  matchesHoldingFilter,
} from "@/components/holdings-table/sorting";
export {
  getHoldingLotInstrumentOption,
  getHoldingLotTransaction,
} from "@/components/holdings-table/lot-mappers";

export const PERFORMANCE_TIMEFRAMES: HoldingPerformanceTimeframe[] = [
  "1D",
  "1W",
  "1M",
  "YTD",
  "1Y",
  "3Y",
  "5Y",
  "MAX",
];

export function getPerformanceKey({
  basis,
  timeframe,
}: {
  basis: PerformanceBasis;
  timeframe: HoldingPerformanceTimeframe;
}): HoldingPerformanceKey {
  return basis === "cost" ? `COST_${timeframe}` : timeframe;
}

export function getPricePerformanceTimeframeLabel(
  copy: ReturnType<typeof getUiCopy>,
  timeframe: HoldingPerformanceTimeframe,
) {
  return copy.holdings.table.timeframes[timeframe];
}

export function getPerformanceColumnLabel({
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
