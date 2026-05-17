import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { historicalPrices, instruments, intradayPrices, priceSnapshots, transactions } from "@/lib/db/schema";
import {
  ensureFreshMarketDataCache,
  getMarketSettings,
  getPriceAgeMinutes,
  isMarketDataStale
} from "@/lib/market/provider";
import {
  buildPortfolioBenchmarkTimeline,
  type TimelineIntradayPrice,
  type PortfolioBenchmarkTimeline
} from "@/lib/portfolio/timeline";
import {
  getHoldingsSnapshot,
  type CurrencyBreakdown,
  type HoldingsSnapshot,
  type RealizedBreakdown
} from "@/server/holdings";

export type DashboardSummary = {
  openPositionCount: number;
  openPositionCurrency: string | null;
  totalCostBasis: number | null;
  totalMarketValue: number | null;
  totalUnrealizedPnl: number | null;
  totalRealizedPnl: number | null;
  pricedPositionCount: number;
  missingPricePositionCount: number;
  latestPriceAsOf: string | null;
  awaitingPriceSymbols: string[];
  currencyBreakdown: CurrencyBreakdown[];
  realizedBreakdown: RealizedBreakdown[];
};

export type DashboardSnapshot = {
  summary: DashboardSummary;
  holdingsSnapshot: HoldingsSnapshot;
  marketData: {
    benchmarkSymbol: string | null;
    marketRefreshMinutes: number;
    latestMarketDataAsOf: string | null;
    priceAgeMinutes: number | null;
    isPriceDataStale: boolean;
  };
  timeline: PortfolioBenchmarkTimeline;
};

function isTimelineIntradayInterval(value: string): value is TimelineIntradayPrice["interval"] {
  return value === "5m" || value === "15m" || value === "1h";
}

export async function getDashboardSnapshot({
  ensureFresh = true
}: {
  ensureFresh?: boolean;
} = {}): Promise<DashboardSnapshot> {
  if (ensureFresh) {
    await ensureFreshMarketDataCache({ includeBenchmark: true });
  }

  const [holdingsSnapshot, marketSettings, transactionRows, instrumentRows, historicalPriceRows, intradayPriceRows] =
    await Promise.all([
      getHoldingsSnapshot({ ensureFresh: false }),
      getMarketSettings(),
      db
        .select({
          instrumentId: transactions.instrumentId,
          tradeDate: transactions.tradeDate,
          side: transactions.side,
          quantity: transactions.quantity,
          price: transactions.price,
          fee: transactions.fee,
          createdAt: transactions.createdAt,
          id: transactions.id
        })
        .from(transactions)
        .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id)),
      db.select().from(instruments),
      db.select().from(historicalPrices),
      db.select().from(intradayPrices)
    ]);
  const benchmarkInstrument =
    marketSettings.benchmarkSymbol == null
      ? null
      : instrumentRows.find((instrument) => instrument.symbol === marketSettings.benchmarkSymbol) ?? null;
  const [benchmarkSnapshot] =
    benchmarkInstrument == null
      ? [null]
      : await db
          .select({
            asOf: priceSnapshots.asOf
          })
          .from(priceSnapshots)
          .where(eq(priceSnapshots.instrumentId, benchmarkInstrument.id));
  const latestMarketDataAsOf =
    [holdingsSnapshot.latestPriceAsOf, benchmarkSnapshot?.asOf ?? null]
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const timeline = buildPortfolioBenchmarkTimeline({
    instruments: instrumentRows.map((instrument) => ({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      currency: instrument.currency
    })),
    transactions: transactionRows.map((row) => ({
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      side: row.side as "BUY" | "SELL",
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      createdAt: row.createdAt,
      id: row.id
    })),
    historicalPrices: historicalPriceRows.map((row) => ({
      instrumentId: row.instrumentId,
      priceDate: row.priceDate,
      close: row.close,
      currency: row.currency
    })),
    intradayPrices: intradayPriceRows
      .filter((row): row is typeof row & { interval: TimelineIntradayPrice["interval"] } =>
        isTimelineIntradayInterval(row.interval)
      )
      .map((row) => ({
        instrumentId: row.instrumentId,
        observedAt: row.observedAt,
        close: row.close,
        currency: row.currency,
        interval: row.interval
      })),
    benchmarkInstrumentId: benchmarkInstrument?.id ?? null,
    benchmarkSymbol: marketSettings.benchmarkSymbol
  });

  return {
    summary: {
      openPositionCount: holdingsSnapshot.openPositionCount,
      openPositionCurrency: holdingsSnapshot.openPositionCurrency,
      totalCostBasis: holdingsSnapshot.totalCostBasis,
      totalMarketValue: holdingsSnapshot.totalMarketValue,
      totalUnrealizedPnl: holdingsSnapshot.totalUnrealizedPnl,
      totalRealizedPnl: holdingsSnapshot.totalRealizedPnl,
      pricedPositionCount: holdingsSnapshot.pricedPositionCount,
      missingPricePositionCount: holdingsSnapshot.missingPricePositionCount,
      latestPriceAsOf: holdingsSnapshot.latestPriceAsOf,
      awaitingPriceSymbols: holdingsSnapshot.awaitingPriceSymbols,
      currencyBreakdown: holdingsSnapshot.currencyBreakdown,
      realizedBreakdown: holdingsSnapshot.realizedBreakdown
    },
    holdingsSnapshot,
    marketData: {
      benchmarkSymbol: marketSettings.benchmarkSymbol,
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      latestMarketDataAsOf,
      priceAgeMinutes: getPriceAgeMinutes(latestMarketDataAsOf),
      isPriceDataStale: isMarketDataStale(
        latestMarketDataAsOf,
        marketSettings.marketRefreshMinutes
      )
    },
    timeline
  };
}

export async function getDashboardSummary() {
  const snapshot = await getDashboardSnapshot();
  return snapshot.summary;
}
