import type {
  TimelineHistoricalPrice,
  TimelineIntradayPrice,
  TimelinePointInterval,
} from "@/lib/portfolio/timeline";

export type PriceState = {
  rows: Array<{
    priceAt: string;
    close: number;
  }>;
  index: number;
  lastClose: number | null;
  latestPriceAt: string | null;
};

export type TimelinePricePoint = {
  instrumentId: number;
  priceAt: string;
  close: number;
  currency: string;
  interval: TimelinePointInterval;
};

export function toDayStartTimestamp(value: string) {
  return `${value}T00:00:00.000Z`;
}

export function toTradeDay(value: string) {
  return value.slice(0, 10);
}

export function buildPriceStates(
  rows: Array<{
    instrumentId: number;
    priceAt: string;
    close: number;
  }>,
) {
  const rowsByInstrument = new Map<number, Array<{ priceAt: string; close: number }>>();

  for (const row of rows) {
    const instrumentRows = rowsByInstrument.get(row.instrumentId) ?? [];
    instrumentRows.push({
      priceAt: row.priceAt,
      close: row.close,
    });
    rowsByInstrument.set(row.instrumentId, instrumentRows);
  }

  return new Map(
    Array.from(rowsByInstrument.entries()).map(([instrumentId, instrumentRows]) => {
      const sortedRows = [...instrumentRows].sort((left, right) =>
        left.priceAt.localeCompare(right.priceAt),
      );

      return [
        instrumentId,
        {
          rows: sortedRows,
          index: 0,
          lastClose: null,
          latestPriceAt: sortedRows[sortedRows.length - 1]?.priceAt ?? null,
        } satisfies PriceState,
      ];
    }),
  );
}

export function advancePriceState(priceState: PriceState | undefined, priceAt: string) {
  if (priceState == null) {
    return null;
  }

  while (
    priceState.index < priceState.rows.length &&
    priceState.rows[priceState.index].priceAt <= priceAt
  ) {
    priceState.lastClose = priceState.rows[priceState.index].close;
    priceState.index += 1;
  }

  return priceState.lastClose;
}

export function toDailyPricePoints(rows: TimelineHistoricalPrice[]): TimelinePricePoint[] {
  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    priceAt: toDayStartTimestamp(row.priceDate),
    close: row.close,
    currency: row.currency,
    interval: "1d",
  }));
}

export function toIntradayPricePoints(rows: TimelineIntradayPrice[]): TimelinePricePoint[] {
  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    priceAt: row.observedAt,
    close: row.close,
    currency: row.currency,
    interval: row.interval,
  }));
}

export function getTimelineAnchors(
  pricePoints: Array<{
    priceAt: string;
    interval: TimelinePointInterval;
  }>,
) {
  const anchorsByPriceAt = new Map<string, TimelinePointInterval>();

  for (const point of pricePoints) {
    anchorsByPriceAt.set(point.priceAt, point.interval);
  }

  return Array.from(anchorsByPriceAt, ([priceAt, interval]) => ({
    priceAt,
    interval,
  })).sort((left, right) => left.priceAt.localeCompare(right.priceAt));
}
