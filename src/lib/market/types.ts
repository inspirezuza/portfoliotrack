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

export type MarketIntradayInterval = "5m" | "15m" | "1h";

export type MarketIntradayBar = {
  observedAt: string;
  close: number;
};

export type MarketIntradaySeries = {
  providerSymbol: string;
  currency: string;
  source: string;
  interval: MarketIntradayInterval;
  bars: MarketIntradayBar[];
};

export type MarketHistoryRequest = {
  startDate: string;
  endDate?: string;
};

export type MarketIntradayRequest = {
  startAt: string;
  endAt?: string;
  interval: MarketIntradayInterval;
};

export interface MarketDataProvider {
  readonly source: string;
  getLatestQuotes(providerSymbols: string[]): Promise<MarketQuoteSnapshot[]>;
  getHistoricalPrices(
    providerSymbol: string,
    request: MarketHistoryRequest
  ): Promise<MarketHistoricalSeries | null>;
  getIntradayPrices(
    providerSymbol: string,
    request: MarketIntradayRequest
  ): Promise<MarketIntradaySeries | null>;
}
