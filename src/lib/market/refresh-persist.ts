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

export async function persistRefreshPayloads({
  validHistories,
  validIntradaySeries,
  validQuotes,
}: PersistRefreshPayloadsParams): Promise<{
  historicalBarCount: number;
  intradayBarCount: number;
}> {
  let historicalBarCount = 0;
  let intradayBarCount = 0;

  await db.transaction(async (tx) => {
    for (const [instrumentId, quote] of validQuotes) {
      await tx
        .insert(priceSnapshots)
        .values({
          instrumentId,
          price: quote.price,
          currency: quote.currency,
          asOf: quote.asOf,
          source: quote.source,
        })
        .onConflictDoUpdate({
          target: priceSnapshots.instrumentId,
          set: {
            price: quote.price,
            currency: quote.currency,
            asOf: quote.asOf,
            source: quote.source,
          },
        });
    }

    for (const [instrumentId, series] of validHistories) {
      for (const bar of series.bars) {
        await tx
          .insert(historicalPrices)
          .values({
            instrumentId,
            priceDate: bar.date,
            close: bar.close,
            currency: series.currency,
            source: series.source,
          })
          .onConflictDoUpdate({
            target: [historicalPrices.instrumentId, historicalPrices.priceDate],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source,
            },
          });

        historicalBarCount += 1;
      }
    }

    for (const { instrumentId, series } of validIntradaySeries.values()) {
      for (const bar of series.bars) {
        await tx
          .insert(intradayPrices)
          .values({
            instrumentId,
            interval: series.interval,
            observedAt: bar.observedAt,
            close: bar.close,
            currency: series.currency,
            source: series.source,
          })
          .onConflictDoUpdate({
            target: [
              intradayPrices.instrumentId,
              intradayPrices.interval,
              intradayPrices.observedAt,
            ],
            set: {
              close: bar.close,
              currency: series.currency,
              source: series.source,
            },
          });

        intradayBarCount += 1;
      }
    }
  });

  return { historicalBarCount, intradayBarCount };
}
