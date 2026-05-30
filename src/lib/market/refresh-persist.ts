import { sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime-core";
import { historicalPrices, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import type {
  MarketHistoricalSeries,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";

type PersistRefreshPayloadsParams = {
  validHistories: Map<number, MarketHistoricalSeries>;
  validIntradaySeries: Map<string, { instrumentId: number; series: MarketIntradaySeries }>;
  validQuotes: Map<number, MarketQuoteSnapshot>;
};

// Postgres caps a statement at 65535 bind parameters. Each row below binds at
// most 6 columns, so 1000 rows/statement stays comfortably under the limit
// while collapsing thousands of per-bar round-trips into a handful.
const BULK_INSERT_CHUNK_SIZE = 1000;

function* chunk<T>(items: T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

export async function persistRefreshPayloads({
  validHistories,
  validIntradaySeries,
  validQuotes,
}: PersistRefreshPayloadsParams): Promise<{
  historicalBarCount: number;
  intradayBarCount: number;
}> {
  const snapshotValues = Array.from(validQuotes, ([instrumentId, quote]) => ({
    instrumentId,
    price: quote.price,
    currency: quote.currency,
    asOf: quote.asOf,
    source: quote.source,
  }));

  const historicalValues = Array.from(validHistories).flatMap(([instrumentId, series]) =>
    series.bars.map((bar) => ({
      instrumentId,
      priceDate: bar.date,
      close: bar.close,
      currency: series.currency,
      source: series.source,
    })),
  );

  const intradayValues = Array.from(validIntradaySeries.values()).flatMap(
    ({ instrumentId, series }) =>
      series.bars.map((bar) => ({
        instrumentId,
        interval: series.interval,
        observedAt: bar.observedAt,
        close: bar.close,
        currency: series.currency,
        source: series.source,
      })),
  );

  await db.transaction(async (tx) => {
    for (const batch of chunk(snapshotValues, BULK_INSERT_CHUNK_SIZE)) {
      await tx
        .insert(priceSnapshots)
        .values(batch)
        .onConflictDoUpdate({
          target: priceSnapshots.instrumentId,
          set: {
            price: sql`excluded.price`,
            currency: sql`excluded.currency`,
            asOf: sql`excluded.as_of`,
            source: sql`excluded.source`,
          },
        });
    }

    for (const batch of chunk(historicalValues, BULK_INSERT_CHUNK_SIZE)) {
      await tx
        .insert(historicalPrices)
        .values(batch)
        .onConflictDoUpdate({
          target: [historicalPrices.instrumentId, historicalPrices.priceDate],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
          },
        });
    }

    for (const batch of chunk(intradayValues, BULK_INSERT_CHUNK_SIZE)) {
      await tx
        .insert(intradayPrices)
        .values(batch)
        .onConflictDoUpdate({
          target: [intradayPrices.instrumentId, intradayPrices.interval, intradayPrices.observedAt],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
          },
        });
    }
  });

  return {
    historicalBarCount: historicalValues.length,
    intradayBarCount: intradayValues.length,
  };
}
