import "server-only";

import { asc, eq, lte } from "drizzle-orm";
import { normalizeMoney } from "@/lib/db/precision";
import { ensureFreshMarketDataCache, getMarketSettings, getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider";
import { calculatePositions, type InstrumentPosition } from "@/lib/portfolio/positions";
import { db } from "@/lib/db/runtime";
import { instruments, priceSnapshots, transactions, type Instrument, type PriceSnapshot } from "@/lib/db/schema";
import { toChronologicalPositionTransaction } from "@/server/transactions";

type HoldingJoinedRow = {
  instrument: Instrument;
  transaction: typeof transactions.$inferSelect;
  priceSnapshot: PriceSnapshot | null;
};

export type HoldingRow = {
  instrumentId: number;
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  quantity: number;
  averageCost: number;
  totalCost: number;
  realizedPnl: number;
  totalFees: number;
  lastPrice: number | null;
  lastPriceCurrency: string | null;
  lastPriceAsOf: string | null;
  lastPriceSource: string | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  portfolioWeight: number | null;
};

export type HoldingsSnapshot = {
  holdings: HoldingRow[];
  openPositionCount: number;
  closedPositionCount: number;
  openPositionCurrency: string | null;
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
  instrument,
  position,
  priceSnapshot
}: {
  instrument: Instrument;
  position: InstrumentPosition;
  priceSnapshot: PriceSnapshot | null;
}): HoldingRow {
  const matchingPriceSnapshot =
    priceSnapshot != null && priceSnapshot.currency === instrument.currency ? priceSnapshot : null;
  const lastPrice = matchingPriceSnapshot?.price ?? null;
  const marketValue =
    lastPrice == null ? null : normalizeMoney(position.quantity * lastPrice);
  const unrealizedPnl =
    marketValue == null ? null : normalizeMoney(marketValue - position.totalCost);
  const unrealizedPnlPercent =
    unrealizedPnl == null || position.totalCost <= 0
      ? null
      : unrealizedPnl / position.totalCost;

  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    market: instrument.market,
    instrumentType: instrument.instrumentType,
    currency: instrument.currency,
    quantity: position.quantity,
    averageCost: position.averageCost,
    totalCost: position.totalCost,
    realizedPnl: position.realizedPnl,
    totalFees: position.totalFees,
    lastPrice,
    lastPriceCurrency: matchingPriceSnapshot?.currency ?? null,
    lastPriceAsOf: matchingPriceSnapshot?.asOf ?? null,
    lastPriceSource: matchingPriceSnapshot?.source ?? null,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    portfolioWeight: null
  };
}

async function listHoldingRows(asOfDate: string): Promise<HoldingJoinedRow[]> {
  return db
    .select({
      instrument: instruments,
      transaction: transactions,
      priceSnapshot: priceSnapshots
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .leftJoin(priceSnapshots, eq(priceSnapshots.instrumentId, instruments.id))
    .where(lte(transactions.tradeDate, asOfDate))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id))
    .all();
}

export async function getHoldingsSnapshot({
  ensureFresh = true
}: {
  ensureFresh?: boolean;
} = {}): Promise<HoldingsSnapshot> {
  if (ensureFresh) {
    await ensureFreshMarketDataCache({ includeBenchmark: true });
  }

  const asOfDate = getCurrentLocalIsoDate();
  const [rows, marketSettings] = await Promise.all([
    listHoldingRows(asOfDate),
    getMarketSettings()
  ]);

  if (rows.length === 0) {
    return {
      holdings: [],
      openPositionCount: 0,
      closedPositionCount: 0,
      openPositionCurrency: null,
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
      realizedBreakdown: []
    };
  }

  const groupedInstruments = new Map<number, { instrument: Instrument; priceSnapshot: PriceSnapshot | null }>();

  for (const row of rows) {
    if (!groupedInstruments.has(row.instrument.id)) {
      groupedInstruments.set(row.instrument.id, {
        instrument: row.instrument,
        priceSnapshot: row.priceSnapshot
      });
    }
  }

  const positions = calculatePositions(rows.map((row) => toChronologicalPositionTransaction(row.transaction)));
  const openHoldings = Array.from(positions.values())
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const instrumentState = groupedInstruments.get(position.instrumentId);

      if (!instrumentState) {
        throw new Error(`Missing instrument metadata for instrument ${position.instrumentId}.`);
      }

      return buildHoldingRow({
        instrument: instrumentState.instrument,
        position,
        priceSnapshot: instrumentState.priceSnapshot
      });
    })
    .sort(compareHoldingRows);

  const pricedHoldings = openHoldings.filter((holding) => holding.marketValue != null);
  const latestPriceAsOf = openHoldings
    .map((holding) => holding.lastPriceAsOf)
    .filter((value): value is string => value != null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const missingPricePositionCount = openHoldings.filter((holding) => holding.marketValue == null).length;
  const priceAgeMinutes = getPriceAgeMinutes(latestPriceAsOf);
  const isPriceDataStale = isMarketDataStale(
    latestPriceAsOf,
    marketSettings.marketRefreshMinutes
  );

  const holdings = openHoldings.map((holding) => ({
    ...holding,
    portfolioWeight: null
  }));

  const currencyBreakdownMap = new Map<string, CurrencyBreakdown>();

  for (const holding of holdings) {
    const entry = currencyBreakdownMap.get(holding.currency) ?? {
      currency: holding.currency,
      openPositionCount: 0,
      pricedPositionCount: 0,
      missingPricePositionCount: 0,
      totalCostBasis: 0,
      totalRealizedPnl: 0,
      totalFees: 0,
      totalMarketValue: 0,
      totalUnrealizedPnl: 0,
      awaitingPriceSymbols: []
    };

    entry.openPositionCount += 1;
    entry.totalCostBasis = normalizeMoney(entry.totalCostBasis + holding.totalCost);

    if (holding.marketValue == null) {
      entry.missingPricePositionCount += 1;
      entry.totalMarketValue = null;
      entry.totalUnrealizedPnl = null;
      entry.awaitingPriceSymbols.push(holding.symbol);
    } else {
      entry.pricedPositionCount += 1;
      entry.totalMarketValue =
        entry.totalMarketValue == null
          ? null
          : normalizeMoney(entry.totalMarketValue + holding.marketValue);
      entry.totalUnrealizedPnl =
        entry.totalUnrealizedPnl == null
          ? null
          : normalizeMoney(entry.totalUnrealizedPnl + (holding.unrealizedPnl ?? 0));
    }

    currencyBreakdownMap.set(holding.currency, entry);
  }

  const realizedBreakdownMap = new Map<string, RealizedBreakdown>();

  for (const position of positions.values()) {
    const instrumentState = groupedInstruments.get(position.instrumentId);

    if (!instrumentState) {
      continue;
    }

    const currency = instrumentState.instrument.currency;
    const entry = realizedBreakdownMap.get(currency) ?? {
      currency,
      totalRealizedPnl: 0,
      totalFees: 0
    };

    entry.totalRealizedPnl = normalizeMoney(entry.totalRealizedPnl + position.realizedPnl);
    entry.totalFees = normalizeMoney(entry.totalFees + position.totalFees);
    realizedBreakdownMap.set(currency, entry);
  }

  const currencyBreakdown = Array.from(currencyBreakdownMap.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency)
  );
  const realizedBreakdown = Array.from(realizedBreakdownMap.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency)
  );
  const openPositionCurrency = currencyBreakdown.length === 1 ? currencyBreakdown[0].currency : null;
  const singleCurrencyBreakdown = openPositionCurrency == null ? null : currencyBreakdown[0];
  const totalMarketValue =
    singleCurrencyBreakdown == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown.totalMarketValue;
  const totalUnrealizedPnl =
    singleCurrencyBreakdown == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown.totalUnrealizedPnl;
  const totalCostBasis =
    singleCurrencyBreakdown == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown.totalCostBasis;
  const totalRealizedPnl =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalRealizedPnl
      : positions.size === 0
        ? 0
        : null;
  const totalFees =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalFees
      : positions.size === 0
        ? 0
        : null;
  const holdingsWithWeights = holdings.map((holding) => ({
    ...holding,
    portfolioWeight:
      singleCurrencyBreakdown != null &&
      totalMarketValue != null &&
      totalMarketValue > 0 &&
      holding.marketValue != null
        ? holding.marketValue / totalMarketValue
        : null
  }));

  return {
    holdings: holdingsWithWeights,
    openPositionCount: holdingsWithWeights.length,
    closedPositionCount: Array.from(positions.values()).filter((position) => position.quantity === 0).length,
    openPositionCurrency,
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
    realizedBreakdown
  };
}

export async function getHoldings() {
  const snapshot = await getHoldingsSnapshot();
  return snapshot.holdings;
}
