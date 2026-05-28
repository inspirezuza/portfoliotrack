import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import type { HistoricalPrice, Instrument, PriceSnapshot } from "@/lib/db/schema";
import {
  sortTransactionsChronologically,
  type PositionTransaction,
} from "@/lib/portfolio/positions";
import type {
  HoldingPerformance,
  HoldingPerformanceKey,
  HoldingPerformanceTimeframe,
} from "@/server/holdings";

export function getFxProviderSymbol(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}${toCurrency}=X`;
}

export function getFxRateToValuationCurrency({
  currency,
  fxSnapshotsByProviderSymbol,
  valuationCurrency,
}: {
  currency: string;
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  valuationCurrency: string;
}) {
  if (currency === valuationCurrency) {
    return 1;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(
    getFxProviderSymbol(currency, valuationCurrency),
  );

  return snapshot != null && snapshot.currency === valuationCurrency ? snapshot.price : null;
}

export function getUnderlyingFxRateToInstrumentCurrency({
  fxSnapshotsByProviderSymbol,
  instrument,
}: {
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  instrument: Instrument;
}) {
  if (instrument.underlyingCurrency == null) {
    return null;
  }

  if (instrument.underlyingCurrency === instrument.currency) {
    return 1;
  }

  if (instrument.fxProviderSymbol == null) {
    return null;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(instrument.fxProviderSymbol);

  return snapshot != null && snapshot.currency === instrument.currency && snapshot.price > 0
    ? snapshot.price
    : null;
}

export function getPreviousClose({
  historicalRows,
  priceSnapshot,
}: {
  historicalRows: HistoricalPrice[];
  priceSnapshot: PriceSnapshot | null;
}) {
  if (priceSnapshot == null) {
    return null;
  }

  const asOfDate = priceSnapshot.asOf.slice(0, 10);
  let previousClose: number | null = null;
  let previousDate: string | null = null;

  for (const row of historicalRows) {
    if (
      row.currency === priceSnapshot.currency &&
      row.priceDate < asOfDate &&
      (previousDate == null || row.priceDate > previousDate)
    ) {
      previousDate = row.priceDate;
      previousClose = row.close;
    }
  }

  return previousClose;
}

export function calculateOneDayGain({
  lastPrice,
  previousClose,
  quantity,
}: {
  lastPrice: number | null;
  previousClose: number | null;
  quantity: number;
}) {
  if (lastPrice == null || previousClose == null || previousClose <= 0) {
    return {
      oneDayGain: null,
      oneDayGainPercent: null,
    };
  }

  return {
    oneDayGain: normalizeMoney((lastPrice - previousClose) * quantity),
    oneDayGainPercent: (lastPrice - previousClose) / previousClose,
  };
}

function getEmptyHoldingPerformance(): HoldingPerformance {
  return {
    amount: null,
    percent: null,
    amountInValuationCurrency: null,
  };
}

function getIsoDateParts(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return { year, month, day };
}

function formatUtcIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftIsoMonth(
  { day, month, year }: { day: number; month: number; year: number },
  monthDelta: number,
) {
  const shiftedMonthIndex = month - 1 + monthDelta;
  const shiftedYear = year + Math.floor(shiftedMonthIndex / 12);
  const shiftedMonth = (((shiftedMonthIndex % 12) + 12) % 12) + 1;
  const shiftedDay = Math.min(day, getDaysInMonth(shiftedYear, shiftedMonth));

  return [
    shiftedYear,
    String(shiftedMonth).padStart(2, "0"),
    String(shiftedDay).padStart(2, "0"),
  ].join("-");
}

function getTimeframeStartDate(
  timeframe: Exclude<HoldingPerformanceTimeframe, "1D" | "MAX">,
  latestDate: string,
) {
  const parts = getIsoDateParts(latestDate);

  if (parts == null) {
    return null;
  }

  if (timeframe === "YTD") {
    return `${parts.year}-01-01`;
  }

  if (timeframe === "1W") {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    date.setUTCDate(date.getUTCDate() - 7);

    return formatUtcIsoDate(date);
  }

  if (timeframe === "1M") {
    return shiftIsoMonth(parts, -1);
  }

  if (timeframe === "1Y") {
    return shiftIsoMonth(parts, -12);
  }

  if (timeframe === "3Y") {
    return shiftIsoMonth(parts, -36);
  }

  if (timeframe === "5Y") {
    return shiftIsoMonth(parts, -60);
  }

  return null;
}

function getHistoricalCloseAtOrBefore({
  currency,
  historicalRows,
  startDate,
}: {
  currency: string;
  historicalRows: HistoricalPrice[];
  startDate: string;
}) {
  let close: number | null = null;
  let latestDate: string | null = null;

  for (const row of historicalRows) {
    if (
      row.currency === currency &&
      row.priceDate <= startDate &&
      (latestDate == null || row.priceDate > latestDate)
    ) {
      latestDate = row.priceDate;
      close = row.close;
    }
  }

  return close;
}

function getEarliestHistoricalClose({
  currency,
  historicalRows,
}: {
  currency: string;
  historicalRows: HistoricalPrice[];
}) {
  let close: number | null = null;
  let earliestDate: string | null = null;

  for (const row of historicalRows) {
    if (row.currency === currency && (earliestDate == null || row.priceDate < earliestDate)) {
      earliestDate = row.priceDate;
      close = row.close;
    }
  }

  return close;
}

function calculatePeriodPerformance({
  fxRateToValuationCurrency,
  historicalRows,
  lastPrice,
  latestDate,
  priceCurrency,
  quantity,
  timeframe,
}: {
  fxRateToValuationCurrency: number | null;
  historicalRows: HistoricalPrice[];
  lastPrice: number | null;
  latestDate: string | null;
  priceCurrency: string | null;
  quantity: number;
  timeframe: Exclude<HoldingPerformanceTimeframe, "1D">;
}) {
  if (lastPrice == null || latestDate == null || priceCurrency == null) {
    return getEmptyHoldingPerformance();
  }

  const startPrice =
    timeframe === "MAX"
      ? getEarliestHistoricalClose({
          currency: priceCurrency,
          historicalRows,
        })
      : (() => {
          const startDate = getTimeframeStartDate(timeframe, latestDate);

          return startDate == null
            ? null
            : getHistoricalCloseAtOrBefore({
                currency: priceCurrency,
                historicalRows,
                startDate,
              });
        })();

  if (startPrice == null || startPrice <= 0) {
    return getEmptyHoldingPerformance();
  }

  const amount = normalizeMoney((lastPrice - startPrice) * quantity);

  return {
    amount,
    percent: (lastPrice - startPrice) / startPrice,
    amountInValuationCurrency:
      fxRateToValuationCurrency == null ? null : normalizeMoney(amount * fxRateToValuationCurrency),
  };
}

function getCostBasisStartDate(timeframe: HoldingPerformanceTimeframe, latestDate: string | null) {
  if (timeframe === "MAX") {
    return null;
  }

  if (latestDate == null) {
    return undefined;
  }

  return timeframe === "1D" ? latestDate : getTimeframeStartDate(timeframe, latestDate);
}

function calculateCostBasisPerformance({
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

export function buildHoldingPerformance({
  fxRateToValuationCurrency,
  historicalRows,
  lastPrice,
  oneDayGain,
  oneDayGainPercent,
  priceSnapshot,
  quantity,
  transactions,
}: {
  fxRateToValuationCurrency: number | null;
  historicalRows: HistoricalPrice[];
  lastPrice: number | null;
  oneDayGain: number | null;
  oneDayGainPercent: number | null;
  priceSnapshot: PriceSnapshot | null;
  quantity: number;
  transactions: PositionTransaction[];
}): Record<HoldingPerformanceKey, HoldingPerformance> {
  const oneDayAmountInValuationCurrency =
    oneDayGain == null || fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(oneDayGain * fxRateToValuationCurrency);
  const latestDate = priceSnapshot?.asOf.slice(0, 10) ?? null;
  const priceCurrency = priceSnapshot?.currency ?? null;

  return {
    "1D": {
      amount: oneDayGain,
      percent: oneDayGainPercent,
      amountInValuationCurrency: oneDayAmountInValuationCurrency,
    },
    "1W": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1W",
    }),
    "1M": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1M",
    }),
    YTD: calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "YTD",
    }),
    "1Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1Y",
    }),
    "3Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "3Y",
    }),
    "5Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "5Y",
    }),
    MAX: calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "MAX",
    }),
    COST_1D: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1D",
      transactions,
    }),
    COST_1W: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1W",
      transactions,
    }),
    COST_1M: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1M",
      transactions,
    }),
    COST_YTD: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "YTD",
      transactions,
    }),
    COST_1Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1Y",
      transactions,
    }),
    COST_3Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "3Y",
      transactions,
    }),
    COST_5Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "5Y",
      transactions,
    }),
    COST_MAX: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "MAX",
      transactions,
    }),
  };
}
