import type { getMarketSettings } from "@/lib/market/provider";
import type {
  portfolios,
  transactions,
  HistoricalPrice,
  Instrument,
  PriceSnapshot,
} from "@/lib/db/schema";

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
