import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";
import { normalizeMoney, normalizePrice } from "@/lib/db/precision";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { ensureFreshMarketDataCache, getMarketSettings, getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider";
import { calculatePositions, type InstrumentPosition } from "@/lib/portfolio/positions";
import { db } from "@/lib/db/runtime";
import { instruments, priceSnapshots, transactions, type Instrument, type PriceSnapshot } from "@/lib/db/schema";
import { toChronologicalPositionTransaction } from "@/server/transactions";
import { parsePortfolioId } from "@/server/portfolios";

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

function getFxProviderSymbol(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}${toCurrency}=X`;
}

function getFxRateToValuationCurrency({
  currency,
  fxSnapshotsByProviderSymbol,
  valuationCurrency
}: {
  currency: string;
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  valuationCurrency: string;
}) {
  if (currency === valuationCurrency) {
    return 1;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(getFxProviderSymbol(currency, valuationCurrency));

  return snapshot != null && snapshot.currency === valuationCurrency ? snapshot.price : null;
}

function getUnderlyingFxRateToInstrumentCurrency({
  fxSnapshotsByProviderSymbol,
  instrument
}: {
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  instrument: Instrument;
}) {
  if (instrument.underlyingCurrency == null) {
    return null;
  }

  if (instrument.underlyingCurrency === instrument.currency) {
    return 1;
  }

  if (instrument.fxProviderSymbol == null) {
    return null;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(instrument.fxProviderSymbol);

  return snapshot != null && snapshot.currency === instrument.currency && snapshot.price > 0
    ? snapshot.price
    : null;
}

function buildHoldingRow({
  fxRateToValuationCurrency,
  instrument,
  underlyingFxRateToInstrumentCurrency,
  parentPriceSnapshot,
  position,
  priceSnapshot,
  valuationCurrency
}: {
  fxRateToValuationCurrency: number | null;
  instrument: Instrument;
  underlyingFxRateToInstrumentCurrency: number | null;
  parentPriceSnapshot: PriceSnapshot | null;
  position: InstrumentPosition;
  priceSnapshot: PriceSnapshot | null;
  valuationCurrency: string;
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
  const totalCostInValuationCurrency =
    fxRateToValuationCurrency == null ? null : normalizeMoney(position.totalCost * fxRateToValuationCurrency);
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
      ? normalizePrice((position.averageCost * instrument.drRatio) / underlyingFxRateToInstrumentCurrency)
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
    portfolioWeight: null
  };
}

async function listHoldingRows(asOfDate: string, portfolioId: number): Promise<HoldingJoinedRow[]> {
  return db
    .select({
      instrument: instruments,
      transaction: transactions,
      priceSnapshot: priceSnapshots
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .leftJoin(priceSnapshots, eq(priceSnapshots.instrumentId, instruments.id))
    .where(and(eq(transactions.portfolioId, portfolioId), lte(transactions.tradeDate, asOfDate)))
    .orderBy(asc(transactions.tradeDate), asc(transactions.createdAt), asc(transactions.id));
}

export async function getHoldingsSnapshot({
  portfolioId: portfolioIdInput,
  ensureFresh = false
}: {
  portfolioId: number;
  ensureFresh?: boolean;
}): Promise<HoldingsSnapshot> {
  const portfolioId = parsePortfolioId(portfolioIdInput);

  if (ensureFresh) {
    await ensureFreshMarketDataCache({ portfolioId, includeBenchmark: true });
  }

  const asOfDate = getCurrentLocalIsoDate();
  const [rows, marketSettings, instrumentRows, snapshotRows] = await Promise.all([
    listHoldingRows(asOfDate, portfolioId),
    getMarketSettings(),
    db.select().from(instruments),
    db.select().from(priceSnapshots)
  ]);
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
      realizedBreakdown: []
    };
  }

  const groupedInstruments = new Map<number, { instrument: Instrument; priceSnapshot: PriceSnapshot | null }>();

  for (const row of rows) {
    if (!groupedInstruments.has(row.instrument.id)) {
      groupedInstruments.set(row.instrument.id, {
        instrument: applyKnownDrMetadata(row.instrument),
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
        fxRateToValuationCurrency: getFxRateToValuationCurrency({
          currency: instrumentState.instrument.currency,
          fxSnapshotsByProviderSymbol,
          valuationCurrency
        }),
        instrument: instrumentState.instrument,
        underlyingFxRateToInstrumentCurrency: getUnderlyingFxRateToInstrumentCurrency({
          fxSnapshotsByProviderSymbol,
          instrument: instrumentState.instrument
        }),
        parentPriceSnapshot:
          instrumentState.instrument.underlyingProviderSymbol == null
            ? null
            : fxSnapshotsByProviderSymbol.get(instrumentState.instrument.underlyingProviderSymbol) ?? null,
        position,
        priceSnapshot: instrumentState.priceSnapshot,
        valuationCurrency
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
  const canUseValuationTotals = holdings.every((holding) =>
    holding.totalCostInValuationCurrency != null &&
    (holding.marketValue == null || holding.marketValueInValuationCurrency != null)
  );
  const totalCostBasisInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals
        ? normalizeMoney(
            holdings.reduce((total, holding) => total + (holding.totalCostInValuationCurrency ?? 0), 0)
          )
        : null;
  const totalMarketValueInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals && holdings.every((holding) => holding.marketValueInValuationCurrency != null)
        ? normalizeMoney(
            holdings.reduce((total, holding) => total + (holding.marketValueInValuationCurrency ?? 0), 0)
          )
        : null;
  const totalUnrealizedPnlInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals && holdings.every((holding) => holding.unrealizedPnlInValuationCurrency != null)
        ? normalizeMoney(
            holdings.reduce((total, holding) => total + (holding.unrealizedPnlInValuationCurrency ?? 0), 0)
          )
        : null;
  const totalMarketValue =
    singleCurrencyBreakdown == null && totalMarketValueInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown?.totalMarketValue ?? totalMarketValueInValuationCurrency;
  const totalUnrealizedPnl =
    singleCurrencyBreakdown == null && totalUnrealizedPnlInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown?.totalUnrealizedPnl ?? totalUnrealizedPnlInValuationCurrency;
  const totalCostBasis =
    singleCurrencyBreakdown == null && totalCostBasisInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : singleCurrencyBreakdown?.totalCostBasis ?? totalCostBasisInValuationCurrency;
  const totalRealizedPnl =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalRealizedPnl
      : positions.size === 0
        ? 0
        : realizedBreakdown.every((entry) =>
            getFxRateToValuationCurrency({
              currency: entry.currency,
              fxSnapshotsByProviderSymbol,
              valuationCurrency
            }) != null
          )
          ? normalizeMoney(
              realizedBreakdown.reduce((total, entry) => {
                const rate = getFxRateToValuationCurrency({
                  currency: entry.currency,
                  fxSnapshotsByProviderSymbol,
                  valuationCurrency
                }) ?? 0;

                return total + entry.totalRealizedPnl * rate;
              }, 0)
            )
          : null;
  const totalFees =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalFees
      : positions.size === 0
        ? 0
        : realizedBreakdown.every((entry) =>
            getFxRateToValuationCurrency({
              currency: entry.currency,
              fxSnapshotsByProviderSymbol,
              valuationCurrency
            }) != null
          )
          ? normalizeMoney(
              realizedBreakdown.reduce((total, entry) => {
                const rate = getFxRateToValuationCurrency({
                  currency: entry.currency,
                  fxSnapshotsByProviderSymbol,
                  valuationCurrency
                }) ?? 0;

                return total + entry.totalFees * rate;
              }, 0)
            )
          : null;
  const holdingsWithWeights = holdings.map((holding) => ({
    ...holding,
    portfolioWeight:
      totalMarketValue != null &&
      totalMarketValue > 0 &&
      (singleCurrencyBreakdown != null ? holding.marketValue != null : holding.marketValueInValuationCurrency != null)
        ? (singleCurrencyBreakdown != null ? holding.marketValue ?? 0 : holding.marketValueInValuationCurrency ?? 0) / totalMarketValue
        : null
  }));

  return {
    holdings: holdingsWithWeights,
    openPositionCount: holdingsWithWeights.length,
    closedPositionCount: Array.from(positions.values()).filter((position) => position.quantity === 0).length,
    openPositionCurrency: openPositionCurrency ?? (totalCostBasis == null ? null : valuationCurrency),
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
    realizedBreakdown
  };
}

export async function getHoldings({ portfolioId }: { portfolioId: number }) {
  const snapshot = await getHoldingsSnapshot({ portfolioId });
  return snapshot.holdings;
}
