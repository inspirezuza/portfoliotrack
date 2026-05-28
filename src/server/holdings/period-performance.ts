import { normalizeMoney } from "@/lib/db/precision";
import type { HistoricalPrice } from "@/lib/db/schema";
import type { HoldingPerformance, HoldingPerformanceTimeframe } from "@/server/holdings";

export function getEmptyHoldingPerformance(): HoldingPerformance {
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

export function getHoldingPerformanceTimeframeStartDate(
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

export function calculatePeriodPerformance({
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
          const startDate = getHoldingPerformanceTimeframeStartDate(timeframe, latestDate);

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
