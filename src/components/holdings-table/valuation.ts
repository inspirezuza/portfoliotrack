import type { HoldingPerformance, HoldingPerformanceKey, HoldingRow } from "@/server/holdings";

export const EMPTY_PERFORMANCE: HoldingPerformance = {
  amount: null,
  percent: null,
  amountInValuationCurrency: null,
};

export function isNativeCurrencyVisible(holding: HoldingRow) {
  return holding.currency !== holding.valuationCurrency;
}

export function getValuationAverageCost(holding: HoldingRow) {
  return holding.fxRateToValuationCurrency == null
    ? null
    : holding.averageCost * holding.fxRateToValuationCurrency;
}

export function getValuationLastPrice(holding: HoldingRow) {
  return holding.lastPrice == null || holding.fxRateToValuationCurrency == null
    ? null
    : holding.lastPrice * holding.fxRateToValuationCurrency;
}

export function getHoldingPerformance(holding: HoldingRow, performanceKey: HoldingPerformanceKey) {
  return holding.performance?.[performanceKey] ?? EMPTY_PERFORMANCE;
}

export function getValuationPerformanceAmount(
  holding: HoldingRow,
  performanceKey: HoldingPerformanceKey,
) {
  const performance = getHoldingPerformance(holding, performanceKey);

  return isNativeCurrencyVisible(holding)
    ? performance.amountInValuationCurrency
    : performance.amount;
}
