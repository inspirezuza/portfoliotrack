import type {
  HoldingLot,
  HoldingPerformance,
  HoldingPerformanceKey,
  HoldingPerformanceTimeframe,
  HoldingRow,
} from "@/server/holdings";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import type { TransactionBroker } from "@/lib/validation/transaction";

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

export function getPerformanceKey({
  basis,
  timeframe,
}: {
  basis: PerformanceBasis;
  timeframe: HoldingPerformanceTimeframe;
}): HoldingPerformanceKey {
  return basis === "cost" ? `COST_${timeframe}` : timeframe;
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

export function getHoldingLotInstrumentOption(holding: HoldingRow): TransactionInstrumentOption {
  return {
    id: holding.instrumentId,
    symbol: holding.symbol,
    displayName: holding.displayName,
    market: holding.market,
    instrumentType: holding.instrumentType,
    currency: holding.currency,
    providerSymbol: holding.providerSymbol,
    isActive: true,
    currentQuantity: holding.quantity,
    label: `${holding.symbol} - ${holding.displayName} - ${holding.market} - ${holding.currency}`,
  };
}

export function getHoldingLotTransaction(
  holding: HoldingRow,
  lot: HoldingLot,
): TransactionListItem {
  const grossAmount = lot.originalQuantity * lot.price;
  const netAmount = lot.side === "BUY" ? grossAmount + lot.fee : grossAmount - lot.fee;

  return {
    id: lot.transactionId,
    portfolioId: lot.portfolioId,
    instrumentId: lot.instrumentId,
    tradeDate: lot.tradeDate,
    side: lot.side,
    broker: lot.broker as TransactionBroker,
    quantity: lot.originalQuantity,
    price: lot.price,
    fee: lot.fee,
    notes: lot.notes,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    portfolioName: lot.portfolioName,
    instrument: {
      id: holding.instrumentId,
      symbol: holding.symbol,
      displayName: holding.displayName,
      market: holding.market,
      instrumentType: holding.instrumentType,
      currency: holding.currency,
      providerSymbol: holding.providerSymbol,
      underlyingProviderSymbol: holding.underlyingProviderSymbol,
    },
    grossAmount,
    netAmount,
    signedQuantity: lot.side === "BUY" ? lot.originalQuantity : -lot.originalQuantity,
  };
}
