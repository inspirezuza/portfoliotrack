import { normalizeMoney, normalizePrice } from "@/lib/db/precision";
import type { HistoricalPrice, Instrument, PriceSnapshot } from "@/lib/db/schema";
import type { InstrumentPosition } from "@/lib/portfolio/positions";
import {
  buildHoldingPerformance,
  calculateOneDayGain,
  getPreviousClose,
} from "@/server/holdings-performance";
import type { HoldingRow } from "@/server/holdings";
import { buildOpenHoldingLots, type HoldingLotTransaction } from "@/server/holdings/lots";

export function compareHoldingRows(left: HoldingRow, right: HoldingRow) {
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

export function buildHoldingRow({
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
