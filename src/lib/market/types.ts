export type MarketQuoteSnapshot = {
  providerSymbol: string;
  price: number;
  currency: string;
  asOf: string;
  source: string;
};

export type MarketHistoricalBar = {
  date: string;
  close: number;
};

export type MarketHistoricalSeries = {
  providerSymbol: string;
  currency: string;
  source: string;
  bars: MarketHistoricalBar[];
};

export type MarketHistoryRequest = {
  startDate: string;
  endDate?: string;
};

export interface MarketDataProvider {
  readonly source: string;
  getLatestQuotes(providerSymbols: string[]): Promise<MarketQuoteSnapshot[]>;
  getHistoricalPrices(
    providerSymbol: string,
    request: MarketHistoryRequest
  ): Promise<MarketHistoricalSeries | null>;
}
