import { normalizeMoney } from "@/lib/db/precision";
import type { CurrencyBreakdown, RealizedBreakdown } from "@/server/holdings";

export type CurrencyBreakdownHolding = {
  currency: string;
  marketValue: number | null;
  realizedPnl: number;
  symbol: string;
  totalCost: number;
  totalFees: number;
  unrealizedPnl: number | null;
};

export type RealizedBreakdownPosition = {
  instrumentId: number;
  realizedPnl: number;
  totalFees: number;
};

export function buildCurrencyBreakdown(holdings: CurrencyBreakdownHolding[]): CurrencyBreakdown[] {
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
      awaitingPriceSymbols: [],
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

  return Array.from(currencyBreakdownMap.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}

export function buildRealizedBreakdown({
  instrumentCurrencyById,
  positions,
}: {
  instrumentCurrencyById: Map<number, string>;
  positions: Iterable<RealizedBreakdownPosition>;
}): RealizedBreakdown[] {
  const realizedBreakdownMap = new Map<string, RealizedBreakdown>();

  for (const position of positions) {
    const currency = instrumentCurrencyById.get(position.instrumentId);

    if (currency == null) {
      continue;
    }

    const entry = realizedBreakdownMap.get(currency) ?? {
      currency,
      totalRealizedPnl: 0,
      totalFees: 0,
    };

    entry.totalRealizedPnl = normalizeMoney(entry.totalRealizedPnl + position.realizedPnl);
    entry.totalFees = normalizeMoney(entry.totalFees + position.totalFees);
    realizedBreakdownMap.set(currency, entry);
  }

  return Array.from(realizedBreakdownMap.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}
