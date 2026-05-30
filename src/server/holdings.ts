import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  ensureFreshMarketDataCache,
  getMarketSettings,
  getPriceAgeMinutes,
  isMarketDataStale,
} from "@/lib/market/provider";
import { calculatePositions } from "@/lib/portfolio/positions";
import { db } from "@/lib/db/runtime";
import {
  historicalPrices,
  instruments,
  portfolios,
  priceSnapshots,
  transactions,
  type HistoricalPrice,
  type Instrument,
  type PriceSnapshot,
} from "@/lib/db/schema";
import { toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";
import {
  getFxRateToValuationCurrency,
  getUnderlyingFxRateToInstrumentCurrency,
} from "@/server/holdings-performance";
import { buildCurrencyBreakdown, buildRealizedBreakdown } from "@/server/holdings/breakdowns";
import type { HoldingLotTransaction } from "@/server/holdings/lots";
import { buildHoldingRow, compareHoldingRows } from "@/server/holdings/rows";
import { buildHoldingsSnapshotTotals } from "@/server/holdings/totals";
import type {
  HoldingJoinedRow,
  HoldingsSnapshot,
  HoldingsSnapshotSource,
} from "@/server/holdings/types";

export type {
  CurrencyBreakdown,
  HoldingCostBasisPerformanceKey,
  HoldingJoinedRow,
  HoldingLot,
  HoldingPerformance,
  HoldingPerformanceKey,
  HoldingPerformanceTimeframe,
  HoldingRow,
  HoldingsSnapshot,
  HoldingsSnapshotSource,
  RealizedBreakdown,
} from "@/server/holdings/types";

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parsePortfolioScope({
  portfolioId,
  portfolioIds,
}: {
  portfolioId?: number;
  portfolioIds?: number[];
}) {
  if (portfolioIds != null) {
    return portfolioIds.map(parsePortfolioId);
  }

  return [parsePortfolioId(portfolioId)];
}

async function listHoldingRows(
  asOfDate: string,
  portfolioIds: number[],
): Promise<HoldingJoinedRow[]> {
  const portfolioFilter =
    portfolioIds.length === 1
      ? eq(transactions.portfolioId, portfolioIds[0])
      : inArray(transactions.portfolioId, portfolioIds);

  // priceSnapshots is deliberately NOT joined here: it has one row per
  // instrument, so a join would duplicate the same snapshot across every
  // transaction row of a holding. The full snapshot set is loaded once in
  // loadHoldingsSnapshotSource (it's also needed there for FX lookups) and the
  // per-instrument snapshot is resolved from that map instead.
  return db
    .select({
      instrument: instruments,
      portfolio: {
        name: portfolios.name,
      },
      transaction: transactions,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .where(and(portfolioFilter, lte(transactions.tradeDate, asOfDate)))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));
}

export async function getHoldingsSnapshot({
  portfolioId: portfolioIdInput,
  portfolioIds: portfolioIdsInput,
  ensureFresh = false,
}: {
  portfolioId?: number;
  portfolioIds?: number[];
  ensureFresh?: boolean;
}): Promise<HoldingsSnapshot> {
  const portfolioIds = parsePortfolioScope({
    portfolioId: portfolioIdInput,
    portfolioIds: portfolioIdsInput,
  });

  if (ensureFresh) {
    await Promise.all(
      portfolioIds.map((portfolioId) =>
        ensureFreshMarketDataCache({ portfolioId, includeBenchmark: true }),
      ),
    );
  }

  return buildHoldingsSnapshotFromSource(await loadHoldingsSnapshotSource({ portfolioIds }));
}

export async function loadHoldingsSnapshotSource({
  portfolioIds,
}: {
  portfolioIds: number[];
}): Promise<HoldingsSnapshotSource> {
  const asOfDate = getCurrentLocalIsoDate();
  const [rows, marketSettings, instrumentRows, snapshotRows] = await Promise.all([
    listHoldingRows(asOfDate, portfolioIds),
    getMarketSettings(),
    db.select().from(instruments),
    db.select().from(priceSnapshots),
  ]);

  const groupedInstrumentIds = Array.from(new Set(rows.map((row) => row.instrument.id)));
  const historicalPriceRows =
    groupedInstrumentIds.length === 0
      ? []
      : await db
          .select()
          .from(historicalPrices)
          .where(inArray(historicalPrices.instrumentId, groupedInstrumentIds));

  return {
    asOfDate,
    historicalPriceRows,
    instrumentRows,
    marketSettings,
    portfolioIds,
    rows,
    snapshotRows,
  };
}

export function buildHoldingsSnapshotFromSource({
  historicalPriceRows,
  instrumentRows,
  marketSettings,
  portfolioIds,
  rows,
  snapshotRows,
}: HoldingsSnapshotSource): HoldingsSnapshot {
  const valuationCurrency = marketSettings.baseCurrency;
  const instrumentById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const fxSnapshotsByProviderSymbol = new Map<string, PriceSnapshot>();
  const snapshotByInstrumentId = new Map<number, PriceSnapshot>();

  for (const snapshot of snapshotRows) {
    snapshotByInstrumentId.set(snapshot.instrumentId, snapshot);
    const instrument = instrumentById.get(snapshot.instrumentId);

    if (instrument != null) {
      fxSnapshotsByProviderSymbol.set(instrument.providerSymbol, snapshot);
    }
  }

  if (rows.length === 0) {
    return {
      holdings: [],
      openPositionCount: 0,
      closedPositionCount: 0,
      openPositionCurrency: null,
      valuationCurrency,
      totalCostBasis: 0,
      totalRealizedPnl: 0,
      totalFees: 0,
      totalMarketValue: 0,
      totalUnrealizedPnl: 0,
      pricedPositionCount: 0,
      missingPricePositionCount: 0,
      latestPriceAsOf: null,
      marketRefreshMinutes: marketSettings.marketRefreshMinutes,
      priceAgeMinutes: null,
      isPriceDataStale: false,
      awaitingPriceSymbols: [],
      currencyBreakdown: [],
      realizedBreakdown: [],
    };
  }

  const groupedInstruments = new Map<
    number,
    { instrument: Instrument; priceSnapshot: PriceSnapshot | null }
  >();

  for (const row of rows) {
    if (!groupedInstruments.has(row.instrument.id)) {
      groupedInstruments.set(row.instrument.id, {
        instrument: applyKnownDrMetadata(row.instrument),
        priceSnapshot: snapshotByInstrumentId.get(row.instrument.id) ?? null,
      });
    }
  }

  const positions = calculatePositions(
    rows.map((row) => toChronologicalPositionTransaction(row.transaction)),
  );
  const transactionsByInstrumentId = new Map<number, HoldingLotTransaction[]>();

  for (const row of rows) {
    const instrumentTransactions =
      transactionsByInstrumentId.get(row.transaction.instrumentId) ?? [];
    instrumentTransactions.push({
      ...toChronologicalPositionTransaction(row.transaction),
      broker: row.transaction.broker,
      notes: row.transaction.notes,
      portfolioId: row.transaction.portfolioId,
      portfolioName: portfolioIds.length > 1 ? row.portfolio.name : null,
      updatedAt: row.transaction.updatedAt,
    });
    transactionsByInstrumentId.set(row.transaction.instrumentId, instrumentTransactions);
  }

  const historicalPricesByInstrumentId = new Map<number, HistoricalPrice[]>();

  for (const row of historicalPriceRows) {
    const instrumentRows = historicalPricesByInstrumentId.get(row.instrumentId) ?? [];
    instrumentRows.push(row);
    historicalPricesByInstrumentId.set(row.instrumentId, instrumentRows);
  }

  const openHoldings = Array.from(positions.values())
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const instrumentState = groupedInstruments.get(position.instrumentId);

      if (!instrumentState) {
        throw new Error(`Missing instrument metadata for instrument ${position.instrumentId}.`);
      }

      return buildHoldingRow({
        fxRateToValuationCurrency: getFxRateToValuationCurrency({
          currency: instrumentState.instrument.currency,
          fxSnapshotsByProviderSymbol,
          valuationCurrency,
        }),
        historicalPriceRows: historicalPricesByInstrumentId.get(position.instrumentId) ?? [],
        instrument: instrumentState.instrument,
        underlyingFxRateToInstrumentCurrency: getUnderlyingFxRateToInstrumentCurrency({
          fxSnapshotsByProviderSymbol,
          instrument: instrumentState.instrument,
        }),
        parentPriceSnapshot:
          instrumentState.instrument.underlyingProviderSymbol == null
            ? null
            : (fxSnapshotsByProviderSymbol.get(
                instrumentState.instrument.underlyingProviderSymbol,
              ) ?? null),
        position,
        positionTransactions: transactionsByInstrumentId.get(position.instrumentId) ?? [],
        priceSnapshot: instrumentState.priceSnapshot,
        valuationCurrency,
      });
    })
    .sort(compareHoldingRows);

  const pricedHoldings = openHoldings.filter((holding) => holding.marketValue != null);
  const latestPriceAsOf =
    openHoldings
      .map((holding) => holding.lastPriceAsOf)
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const missingPricePositionCount = openHoldings.filter(
    (holding) => holding.marketValue == null,
  ).length;
  const priceAgeMinutes = getPriceAgeMinutes(latestPriceAsOf);
  const isPriceDataStale = isMarketDataStale(latestPriceAsOf, marketSettings.marketRefreshMinutes);

  const holdings = openHoldings.map((holding) => ({
    ...holding,
    portfolioWeight: null,
  }));

  const currencyBreakdown = buildCurrencyBreakdown(holdings);
  const realizedBreakdown = buildRealizedBreakdown({
    instrumentCurrencyById: new Map(
      Array.from(groupedInstruments, ([instrumentId, { instrument }]) => [
        instrumentId,
        instrument.currency,
      ]),
    ),
    positions: positions.values(),
  });
  const {
    holdingsWithWeights,
    openPositionCurrency,
    totalCostBasis,
    totalFees,
    totalMarketValue,
    totalRealizedPnl,
    totalUnrealizedPnl,
  } = buildHoldingsSnapshotTotals({
    currencyBreakdown,
    fxSnapshotsByProviderSymbol,
    holdings,
    positionCount: positions.size,
    realizedBreakdown,
    valuationCurrency,
  });

  return {
    holdings: holdingsWithWeights,
    openPositionCount: holdingsWithWeights.length,
    closedPositionCount: Array.from(positions.values()).filter(
      (position) => position.quantity === 0,
    ).length,
    openPositionCurrency,
    valuationCurrency,
    totalCostBasis,
    totalRealizedPnl,
    totalFees,
    totalMarketValue,
    totalUnrealizedPnl,
    pricedPositionCount: pricedHoldings.length,
    missingPricePositionCount,
    latestPriceAsOf,
    marketRefreshMinutes: marketSettings.marketRefreshMinutes,
    priceAgeMinutes,
    isPriceDataStale,
    awaitingPriceSymbols: holdingsWithWeights
      .filter((holding) => holding.marketValue == null)
      .map((holding) => holding.symbol),
    currencyBreakdown,
    realizedBreakdown,
  };
}

export async function getHoldings({ portfolioId }: { portfolioId: number }) {
  const snapshot = await getHoldingsSnapshot({ portfolioId });
  return snapshot.holdings;
}
