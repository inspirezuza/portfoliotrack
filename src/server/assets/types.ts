import type { AssetPricePoint } from "@/server/assets/history";

export type AssetDetail = {
  instrument: {
    id: number;
    symbol: string;
    displayName: string;
    market: string;
    instrumentType: string;
    currency: string;
    providerSymbol: string;
    providerHistoryUrl: string;
    underlyingSymbol: string | null;
    underlyingDisplayName: string | null;
    underlyingCurrency: string | null;
    underlyingProviderSymbol: string | null;
    drRatio: number | null;
    fxProviderSymbol: string | null;
    isActive: boolean;
  };
  position: {
    quantity: number;
    averageCost: number | null;
    totalCost: number | null;
    realizedPnl: number;
    totalFees: number;
    marketValue: number | null;
    unrealizedPnl: number | null;
    hasOpenPosition: boolean;
    tradeCount: number;
    firstTradeDate: string | null;
    lastTradeDate: string | null;
  };
  transactions: Array<{
    id: number;
    tradeDate: string;
    side: "BUY" | "SELL";
    quantity: number;
    price: number;
    fee: number;
    notes: string | null;
  }>;
  marketData: {
    lastPrice: number | null;
    lastPriceAsOf: string | null;
    lastPriceSource: string | null;
    priceAgeMinutes: number | null;
    isPriceDataStale: boolean;
    marketRefreshMinutes: number;
    latestHistoryDate: string | null;
    firstHistoryDate: string | null;
    historySource: string | null;
    historyStatus: "full" | "partial" | "unavailable";
    historyUnavailableReason: string | null;
    requestedHistoryStartDate: string | null;
    priceHistory: AssetPricePoint[];
  };
  dr: {
    underlyingSymbol: string | null;
    underlyingDisplayName: string | null;
    underlyingCurrency: string | null;
    underlyingProviderSymbol: string | null;
    drRatio: number | null;
    fxProviderSymbol: string | null;
    parentMarketPrice: number | null;
    parentMarketPriceAsOf: string | null;
    parentMarketPriceSource: string | null;
    fxRate: number | null;
    fxRateAsOf: string | null;
    fxRateSource: string | null;
    impliedParentPrice: number | null;
    averageImpliedParentCost: number | null;
    premiumDiscount: number | null;
    analyticsIssue: string | null;
  } | null;
};
