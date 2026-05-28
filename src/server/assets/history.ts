import type { HistoricalPrice, IntradayPrice } from "@/lib/db/schema";
import type { MarketIntradayInterval } from "@/lib/market/types";

export type AssetPricePoint = {
  date: string;
  close: number;
  interval?: "1d" | MarketIntradayInterval;
};

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function subtractUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() - days);
  return nextDate;
}

export function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getAssetHistoryStartDate(firstTradeDate: string | null, now = new Date()) {
  if (firstTradeDate != null) {
    return firstTradeDate;
  }

  return toIsoDate(subtractUtcDays(now, 365));
}

export function getAssetIntradayStartAt(now: Date, lookbackDays: number) {
  return subtractUtcDays(now, lookbackDays).toISOString();
}

export function getProviderHistoryUrl(providerSymbol: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(providerSymbol)}/history`;
}

export function combineAssetPriceHistory({
  historyRows,
  intradayRows,
}: {
  historyRows: HistoricalPrice[];
  intradayRows: IntradayPrice[];
}) {
  const pointsByKey = new Map<string, AssetPricePoint>();

  for (const row of historyRows) {
    pointsByKey.set(`1d:${row.priceDate}`, {
      date: row.priceDate,
      close: row.close,
      interval: "1d",
    });
  }

  for (const row of intradayRows) {
    pointsByKey.set(`${row.interval}:${row.observedAt}`, {
      date: row.observedAt,
      close: row.close,
      interval: row.interval as MarketIntradayInterval,
    });
  }

  return Array.from(pointsByKey.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export function getAssetHistoryStatus({
  requestedHistoryStartDate,
  firstHistoryDate,
  historyCount,
}: {
  requestedHistoryStartDate: string | null;
  firstHistoryDate: string | null;
  historyCount: number;
}) {
  if (historyCount === 0) {
    return "unavailable";
  }

  if (
    requestedHistoryStartDate != null &&
    firstHistoryDate != null &&
    firstHistoryDate > requestedHistoryStartDate
  ) {
    return "partial";
  }

  return "full";
}
