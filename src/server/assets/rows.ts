import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import {
  historicalPrices,
  instruments,
  intradayPrices,
  priceSnapshots,
  transactions,
  type HistoricalPrice,
  type Instrument,
  type IntradayPrice,
  type PriceSnapshot,
} from "@/lib/db/schema";

export function quoteMatchesInstrumentCurrency(
  snapshot: PriceSnapshot | null,
  instrument: Instrument,
): snapshot is PriceSnapshot {
  return snapshot != null && snapshot.currency === instrument.currency;
}

export function filterMatchingHistoryRows(rows: HistoricalPrice[], instrument: Instrument) {
  return rows
    .filter((row) => row.currency === instrument.currency)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

export function filterMatchingIntradayRows(rows: IntradayPrice[], instrument: Instrument) {
  return rows
    .filter((row) => row.currency === instrument.currency)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

export async function getAssetRows(symbol: string, portfolioIds: number[]) {
  const [instrument] = await db.select().from(instruments).where(eq(instruments.symbol, symbol));

  if (instrument == null) {
    return null;
  }

  const [transactionRows, snapshot, historyRows, intradayRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(
        and(
          portfolioIds.length === 1
            ? eq(transactions.portfolioId, portfolioIds[0])
            : inArray(transactions.portfolioId, portfolioIds),
          eq(transactions.instrumentId, instrument.id),
        ),
      )
      .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)),
    db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.instrumentId, instrument.id))
      .then((rows) => rows[0] ?? null),
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrument.id)),
    db.select().from(intradayPrices).where(eq(intradayPrices.instrumentId, instrument.id)),
  ]);

  return {
    instrument,
    transactionRows,
    snapshot,
    historyRows,
    intradayRows,
  };
}

export async function getAssetMarketRows(instrumentId: number) {
  const [snapshot, historyRows, intradayRows] = await Promise.all([
    db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.instrumentId, instrumentId))
      .then((rows) => rows[0] ?? null),
    db.select().from(historicalPrices).where(eq(historicalPrices.instrumentId, instrumentId)),
    db.select().from(intradayPrices).where(eq(intradayPrices.instrumentId, instrumentId)),
  ]);

  return {
    historyRows,
    intradayRows,
    snapshot,
  };
}
