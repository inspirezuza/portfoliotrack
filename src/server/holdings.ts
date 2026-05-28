import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { normalizeMoney, normalizePrice } from "@/lib/db/precision";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  ensureFreshMarketDataCache,
  getMarketSettings,
  getPriceAgeMinutes,
  isMarketDataStale,
} from "@/lib/market/provider";
import { calculatePositions, type InstrumentPosition } from "@/lib/portfolio/positions";
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
  buildHoldingPerformance,
  calculateOneDayGain,
  getFxRateToValuationCurrency,
  getPreviousClose,
  getUnderlyingFxRateToInstrumentCurrency,
} from "@/server/holdings-performance";
import { buildCurrencyBreakdown, buildRealizedBreakdown } from "@/server/holdings/breakdowns";
import { buildOpenHoldingLots, type HoldingLotTransaction } from "@/server/holdings/lots";
import { buildHoldingsSnapshotTotals } from "@/server/holdings/totals";

export type HoldingJoinedRow = {
  instrument: Instrument;
  portfolio: Pick<typeof portfolios.$inferSelect, "name">;
  transaction: typeof transactions.$inferSelect;
  priceSnapshot: PriceSnapshot | null;
};

export type HoldingsSnapshotSource = {
  asOfDate: string;
  historicalPriceRows: HistoricalPrice[];
  instrumentRows: Instrument[];
  marketSettings: Awaited<ReturnType<typeof getMarketSettings>>;
  portfolioIds: number[];
  rows: HoldingJoinedRow[];
  snapshotRows: PriceSnapshot[];
};

export type HoldingLot = {
  transactionId: number;
  instrumentId: number;
  portfolioId: number;
  portfolioName: string | null;
  tradeDate: string;
  side: "BUY" | "SELL";
  broker: string;
  originalQuantity: number;
  remainingQuantity: number;
  price: number;
  fee: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  costBasis: number;
  costBasisInValuationCurrency: number | null;
  marketValue: number | null;
  marketValueInValuationCurrency: number | null;
  totalGain: number | null;
  totalGainInValuationCurrency: number | null;
  totalGainPercent: number | null;
};

export type HoldingRow = {
  instrumentId: number;
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
  underlyingSymbol: string | null;
  underlyingProviderSymbol: string | null;
  underlyingCurrency: string | null;
  drRatio: number | null;
  quantity: number;
  averageCost: number;
  totalCost: number;
  realizedPnl: number;
  totalFees: number;
  lastPrice: number | null;
  lastPriceCurrency: string | null;
  lastPriceAsOf: string | null;
  lastPriceSource: string | null;
  oneDayGain: number | null;
  oneDayGainPercent: number | null;
  oneDayGainInValuationCurrency: number | null;
  performance: Record<HoldingPerformanceKey, HoldingPerformance>;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  valuationCurrency: string;
  fxRateToValuationCurrency: number | null;
  totalCostInValuationCurrency: number | null;
  marketValueInValuationCurrency: number | null;
  unrealizedPnlInValuationCurrency: number | null;
  parentAverageCost: number | null;
  parentLastPrice: number | null;
  parentLastPriceAsOf: string | null;
  portfolioWeight: number | null;
  lots: HoldingLot[];
};

export type HoldingPerformanceTimeframe = "1D" | "1W" | "1M" | "YTD" | "1Y" | "3Y" | "5Y" | "MAX";

export type HoldingCostBasisPerformanceKey = `COST_${HoldingPerformanceTimeframe}`;

export type HoldingPerformanceKey = HoldingPerformanceTimeframe | HoldingCostBasisPerformanceKey;

export type HoldingPerformance = {
  amount: number | null;
  percent: number | null;
  amountInValuationCurrency: number | null;
};

export type HoldingsSnapshot = {
  holdings: HoldingRow[];
  openPositionCount: number;
  closedPositionCount: number;
  openPositionCurrency: string | null;
  valuationCurrency: string;
  totalCostBasis: number | null;
  totalRealizedPnl: number | null;
  totalFees: number | null;
  totalMarketValue: number | null;
  totalUnrealizedPnl: number | null;
  pricedPositionCount: number;
  missingPricePositionCount: number;
  latestPriceAsOf: string | null;
  marketRefreshMinutes: number;
  priceAgeMinutes: number | null;
  isPriceDataStale: boolean;
  awaitingPriceSymbols: string[];
  currencyBreakdown: CurrencyBreakdown[];
  realizedBreakdown: RealizedBreakdown[];
};

export type CurrencyBreakdown = {
  currency: string;
  openPositionCount: number;
  pricedPositionCount: number;
  missingPricePositionCount: number;
  totalCostBasis: number;
  totalRealizedPnl: number;
  totalFees: number;
  totalMarketValue: number | null;
  totalUnrealizedPnl: number | null;
  awaitingPriceSymbols: string[];
};

export type RealizedBreakdown = {
  currency: string;
  totalRealizedPnl: number;
  totalFees: number;
};

function compareHoldingRows(left: HoldingRow, right: HoldingRow) {
  const currencyComparison = left.currency.localeCompare(right.currency);

  if (currencyComparison !== 0) {
    return currencyComparison;
  }

  if (left.symbol !== right.symbol) {
    return left.symbol.localeCompare(right.symbol);
  }

  if (left.marketValue != null && right.marketValue == null) {
    return -1;
  }

  if (left.marketValue == null && right.marketValue != null) {
    return 1;
  }

  return left.displayName.localeCompare(right.displayName);
}

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildHoldingRow({
  fxRateToValuationCurrency,
  historicalPriceRows,
  instrument,
  underlyingFxRateToInstrumentCurrency,
  parentPriceSnapshot,
  position,
  priceSnapshot,
  positionTransactions,
  valuationCurrency,
}: {
  fxRateToValuationCurrency: number | null;
  historicalPriceRows: HistoricalPrice[];
  instrument: Instrument;
  underlyingFxRateToInstrumentCurrency: number | null;
  parentPriceSnapshot: PriceSnapshot | null;
  position: InstrumentPosition;
  priceSnapshot: PriceSnapshot | null;
  positionTransactions: HoldingLotTransaction[];
  valuationCurrency: string;
}): HoldingRow {
  const matchingPriceSnapshot =
    priceSnapshot != null && priceSnapshot.currency === instrument.currency ? priceSnapshot : null;
  const lastPrice = matchingPriceSnapshot?.price ?? null;
  const previousClose = getPreviousClose({
    historicalRows: historicalPriceRows,
    priceSnapshot: matchingPriceSnapshot,
  });
  const { oneDayGain, oneDayGainPercent } = calculateOneDayGain({
    lastPrice,
    previousClose,
    quantity: position.quantity,
  });
  const oneDayGainInValuationCurrency =
    oneDayGain == null || fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(oneDayGain * fxRateToValuationCurrency);
  const marketValue = lastPrice == null ? null : normalizeMoney(position.quantity * lastPrice);
  const unrealizedPnl =
    marketValue == null ? null : normalizeMoney(marketValue - position.totalCost);
  const unrealizedPnlPercent =
    unrealizedPnl == null || position.totalCost <= 0 ? null : unrealizedPnl / position.totalCost;
  const totalCostInValuationCurrency =
    fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(position.totalCost * fxRateToValuationCurrency);
  const marketValueInValuationCurrency =
    marketValue == null || fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(marketValue * fxRateToValuationCurrency);
  const unrealizedPnlInValuationCurrency =
    unrealizedPnl == null || fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(unrealizedPnl * fxRateToValuationCurrency);
  const matchingParentSnapshot =
    parentPriceSnapshot != null && parentPriceSnapshot.currency === instrument.underlyingCurrency
      ? parentPriceSnapshot
      : null;
  const parentAverageCost =
    position.averageCost > 0 &&
    instrument.drRatio != null &&
    instrument.drRatio > 0 &&
    instrument.underlyingCurrency != null &&
    underlyingFxRateToInstrumentCurrency != null
      ? normalizePrice(
          (position.averageCost * instrument.drRatio) / underlyingFxRateToInstrumentCurrency,
        )
      : null;

  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    market: instrument.market,
    instrumentType: instrument.instrumentType,
    currency: instrument.currency,
    providerSymbol: instrument.providerSymbol,
    underlyingSymbol: instrument.underlyingSymbol,
    underlyingProviderSymbol: instrument.underlyingProviderSymbol,
    underlyingCurrency: instrument.underlyingCurrency,
    drRatio: instrument.drRatio,
    quantity: position.quantity,
    averageCost: position.averageCost,
    totalCost: position.totalCost,
    realizedPnl: position.realizedPnl,
    totalFees: position.totalFees,
    lastPrice,
    lastPriceCurrency: matchingPriceSnapshot?.currency ?? null,
    lastPriceAsOf: matchingPriceSnapshot?.asOf ?? null,
    lastPriceSource: matchingPriceSnapshot?.source ?? null,
    oneDayGain,
    oneDayGainPercent,
    oneDayGainInValuationCurrency,
    performance: buildHoldingPerformance({
      fxRateToValuationCurrency,
      historicalRows: historicalPriceRows,
      lastPrice,
      oneDayGain,
      oneDayGainPercent,
      priceSnapshot: matchingPriceSnapshot,
      quantity: position.quantity,
      transactions: positionTransactions,
    }),
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    valuationCurrency,
    fxRateToValuationCurrency,
    totalCostInValuationCurrency,
    marketValueInValuationCurrency,
    unrealizedPnlInValuationCurrency,
    parentAverageCost,
    parentLastPrice: matchingParentSnapshot?.price ?? null,
    parentLastPriceAsOf: matchingParentSnapshot?.asOf ?? null,
    portfolioWeight: null,
    lots: buildOpenHoldingLots({
      fxRateToValuationCurrency,
      lastPrice,
      transactions: positionTransactions,
    }),
  };
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

  return db
    .select({
      instrument: instruments,
      portfolio: {
        name: portfolios.name,
      },
      transaction: transactions,
      priceSnapshot: priceSnapshots,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .leftJoin(priceSnapshots, eq(priceSnapshots.instrumentId, instruments.id))
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

  for (const snapshot of snapshotRows) {
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
        priceSnapshot: row.priceSnapshot,
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
