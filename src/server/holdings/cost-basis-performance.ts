import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import {
  sortTransactionsChronologically,
  type PositionTransaction,
} from "@/lib/portfolio/positions";
import type { HoldingPerformance, HoldingPerformanceTimeframe } from "@/server/holdings";
import {
  getEmptyHoldingPerformance,
  getHoldingPerformanceTimeframeStartDate,
} from "@/server/holdings/period-performance";

function getCostBasisStartDate(timeframe: HoldingPerformanceTimeframe, latestDate: string | null) {
  if (timeframe === "MAX") {
    return null;
  }

  if (latestDate == null) {
    return undefined;
  }

  return timeframe === "1D"
    ? latestDate
    : getHoldingPerformanceTimeframeStartDate(timeframe, latestDate);
}

export function calculateCostBasisPerformance({
  fxRateToValuationCurrency,
  lastPrice,
  latestDate,
  timeframe,
  transactions,
}: {
  fxRateToValuationCurrency: number | null;
  lastPrice: number | null;
  latestDate: string | null;
  timeframe: HoldingPerformanceTimeframe;
  transactions: PositionTransaction[];
}): HoldingPerformance {
  if (lastPrice == null) {
    return getEmptyHoldingPerformance();
  }

  const startDate = getCostBasisStartDate(timeframe, latestDate);

  if (startDate === undefined) {
    return getEmptyHoldingPerformance();
  }

  let totalQuantity = 0;
  let totalCost = 0;
  let scopedQuantity = 0;
  let scopedCost = 0;

  for (const transaction of sortTransactionsChronologically(transactions)) {
    const quantity = normalizeQuantity(transaction.quantity);
    const grossAmount = normalizeMoney(quantity * transaction.price);
    const transactionCost = normalizeMoney(grossAmount + transaction.fee);

    if (transaction.side === "BUY") {
      totalQuantity = normalizeQuantity(totalQuantity + quantity);
      totalCost = normalizeMoney(totalCost + transactionCost);

      if (startDate == null || transaction.tradeDate >= startDate) {
        scopedQuantity = normalizeQuantity(scopedQuantity + quantity);
        scopedCost = normalizeMoney(scopedCost + transactionCost);
      }

      continue;
    }

    if (totalQuantity <= 0) {
      continue;
    }

    const soldQuantity = Math.min(quantity, totalQuantity);
    const totalAverageCost = normalizePrice(totalCost / totalQuantity);
    const totalRemovedCost = normalizeMoney(totalAverageCost * soldQuantity);

    if (scopedQuantity > 0) {
      const scopedShare = Math.min(1, scopedQuantity / totalQuantity);
      const scopedSoldQuantity = normalizeQuantity(
        Math.min(scopedQuantity, soldQuantity * scopedShare),
      );
      const scopedAverageCost = normalizePrice(scopedCost / scopedQuantity);
      const scopedRemovedCost = normalizeMoney(scopedAverageCost * scopedSoldQuantity);

      scopedQuantity = normalizeQuantity(scopedQuantity - scopedSoldQuantity);
      scopedCost = normalizeMoney(scopedCost - scopedRemovedCost);

      if (scopedQuantity <= 0) {
        scopedQuantity = 0;
        scopedCost = 0;
      }
    }

    totalQuantity = normalizeQuantity(totalQuantity - soldQuantity);
    totalCost = normalizeMoney(totalCost - totalRemovedCost);

    if (totalQuantity <= 0) {
      totalQuantity = 0;
      totalCost = 0;
      scopedQuantity = 0;
      scopedCost = 0;
    }
  }

  if (scopedQuantity <= 0 || scopedCost <= 0) {
    return getEmptyHoldingPerformance();
  }

  const marketValue = normalizeMoney(scopedQuantity * lastPrice);
  const amount = normalizeMoney(marketValue - scopedCost);

  return {
    amount,
    percent: amount / scopedCost,
    amountInValuationCurrency:
      fxRateToValuationCurrency == null ? null : normalizeMoney(amount * fxRateToValuationCurrency),
  };
}
