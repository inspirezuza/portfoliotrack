import { normalizeMoney } from "@/lib/db/precision";
import type { PriceSnapshot } from "@/lib/db/schema";
import { getFxRateToValuationCurrency } from "@/server/holdings-performance";
import type { CurrencyBreakdown, HoldingRow, RealizedBreakdown } from "@/server/holdings";

export type HoldingsSnapshotTotals = {
  holdingsWithWeights: HoldingRow[];
  openPositionCurrency: string | null;
  totalCostBasis: number | null;
  totalRealizedPnl: number | null;
  totalFees: number | null;
  totalMarketValue: number | null;
  totalUnrealizedPnl: number | null;
};

function canConvertAllRealizedBreakdowns({
  fxSnapshotsByProviderSymbol,
  realizedBreakdown,
  valuationCurrency,
}: {
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  realizedBreakdown: RealizedBreakdown[];
  valuationCurrency: string;
}) {
  return realizedBreakdown.every(
    (entry) =>
      getFxRateToValuationCurrency({
        currency: entry.currency,
        fxSnapshotsByProviderSymbol,
        valuationCurrency,
      }) != null,
  );
}

function convertRealizedBreakdownTotal({
  fxSnapshotsByProviderSymbol,
  realizedBreakdown,
  selectValue,
  valuationCurrency,
}: {
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  realizedBreakdown: RealizedBreakdown[];
  selectValue: (entry: RealizedBreakdown) => number;
  valuationCurrency: string;
}) {
  return normalizeMoney(
    realizedBreakdown.reduce((total, entry) => {
      const rate =
        getFxRateToValuationCurrency({
          currency: entry.currency,
          fxSnapshotsByProviderSymbol,
          valuationCurrency,
        }) ?? 0;

      return total + selectValue(entry) * rate;
    }, 0),
  );
}

export function buildHoldingsSnapshotTotals({
  currencyBreakdown,
  fxSnapshotsByProviderSymbol,
  holdings,
  positionCount,
  realizedBreakdown,
  valuationCurrency,
}: {
  currencyBreakdown: CurrencyBreakdown[];
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  holdings: HoldingRow[];
  positionCount: number;
  realizedBreakdown: RealizedBreakdown[];
  valuationCurrency: string;
}): HoldingsSnapshotTotals {
  const openPositionCurrency =
    currencyBreakdown.length === 1 ? currencyBreakdown[0].currency : null;
  const singleCurrencyBreakdown = openPositionCurrency == null ? null : currencyBreakdown[0];
  const canUseValuationTotals = holdings.every(
    (holding) =>
      holding.totalCostInValuationCurrency != null &&
      (holding.marketValue == null || holding.marketValueInValuationCurrency != null),
  );
  const totalCostBasisInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals
        ? normalizeMoney(
            holdings.reduce(
              (total, holding) => total + (holding.totalCostInValuationCurrency ?? 0),
              0,
            ),
          )
        : null;
  const totalMarketValueInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals &&
          holdings.every((holding) => holding.marketValueInValuationCurrency != null)
        ? normalizeMoney(
            holdings.reduce(
              (total, holding) => total + (holding.marketValueInValuationCurrency ?? 0),
              0,
            ),
          )
        : null;
  const totalUnrealizedPnlInValuationCurrency =
    holdings.length === 0
      ? 0
      : canUseValuationTotals &&
          holdings.every((holding) => holding.unrealizedPnlInValuationCurrency != null)
        ? normalizeMoney(
            holdings.reduce(
              (total, holding) => total + (holding.unrealizedPnlInValuationCurrency ?? 0),
              0,
            ),
          )
        : null;
  const totalMarketValue =
    singleCurrencyBreakdown == null && totalMarketValueInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : (singleCurrencyBreakdown?.totalMarketValue ?? totalMarketValueInValuationCurrency);
  const totalUnrealizedPnl =
    singleCurrencyBreakdown == null && totalUnrealizedPnlInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : (singleCurrencyBreakdown?.totalUnrealizedPnl ?? totalUnrealizedPnlInValuationCurrency);
  const totalCostBasis =
    singleCurrencyBreakdown == null && totalCostBasisInValuationCurrency == null
      ? holdings.length === 0
        ? 0
        : null
      : (singleCurrencyBreakdown?.totalCostBasis ?? totalCostBasisInValuationCurrency);
  const canConvertRealizedBreakdowns = canConvertAllRealizedBreakdowns({
    fxSnapshotsByProviderSymbol,
    realizedBreakdown,
    valuationCurrency,
  });
  const totalRealizedPnl =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalRealizedPnl
      : positionCount === 0
        ? 0
        : canConvertRealizedBreakdowns
          ? convertRealizedBreakdownTotal({
              fxSnapshotsByProviderSymbol,
              realizedBreakdown,
              selectValue: (entry) => entry.totalRealizedPnl,
              valuationCurrency,
            })
          : null;
  const totalFees =
    realizedBreakdown.length === 1
      ? realizedBreakdown[0].totalFees
      : positionCount === 0
        ? 0
        : canConvertRealizedBreakdowns
          ? convertRealizedBreakdownTotal({
              fxSnapshotsByProviderSymbol,
              realizedBreakdown,
              selectValue: (entry) => entry.totalFees,
              valuationCurrency,
            })
          : null;
  const holdingsWithWeights = holdings.map((holding) => ({
    ...holding,
    portfolioWeight:
      totalMarketValue != null &&
      totalMarketValue > 0 &&
      (singleCurrencyBreakdown != null
        ? holding.marketValue != null
        : holding.marketValueInValuationCurrency != null)
        ? (singleCurrencyBreakdown != null
            ? (holding.marketValue ?? 0)
            : (holding.marketValueInValuationCurrency ?? 0)) / totalMarketValue
        : null,
  }));

  return {
    holdingsWithWeights,
    openPositionCurrency:
      openPositionCurrency ?? (totalCostBasis == null ? null : valuationCurrency),
    totalCostBasis,
    totalRealizedPnl,
    totalFees,
    totalMarketValue,
    totalUnrealizedPnl,
  };
}
