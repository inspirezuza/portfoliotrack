import type {
  PerformancePointInterval,
  PortfolioPerformanceSeries,
  ReturnPerformancePoint,
} from "@/lib/portfolio/performance-series";
import type { TransactionSide } from "@/lib/validation/transaction";

export type TimelineInstrument = {
  instrumentId: number;
  symbol: string;
  currency: string;
};

export type TimelineTransaction = {
  instrumentId: number;
  tradeDate: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  createdAt?: string | null;
  id?: number;
};

export type TimelineHistoricalPrice = {
  instrumentId: number;
  priceDate: string;
  close: number;
  currency: string;
};

export type TimelineIntradayPrice = {
  instrumentId: number;
  observedAt: string;
  close: number;
  currency: string;
  interval: "5m" | "15m" | "1h";
};

export type TimelinePointInterval = PerformancePointInterval;

export type PortfolioTimelinePoint = {
  date: string;
  value: number;
  interval?: TimelinePointInterval;
};

export type BenchmarkTimelinePoint = {
  date: string;
  portfolio: number;
  benchmark: number;
  interval?: TimelinePointInterval;
};

export type PortfolioBenchmarkTimelineStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "benchmark-currency-mismatch"
  | "missing-portfolio-history"
  | "missing-benchmark-history";

export type BenchmarkComparisonBasis = "same-currency" | "native-currency-return";

export type PortfolioBenchmarkTimeline = {
  status: PortfolioBenchmarkTimelineStatus;
  baselineDate: string | null;
  portfolioCurrency: string | null;
  benchmarkSymbol: string | null;
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolio: PortfolioTimelinePoint[];
  comparison: BenchmarkTimelinePoint[];
  moneyWeightedComparison: ReturnPerformancePoint[];
  absoluteComparison: ReturnPerformancePoint[];
  performanceSeries: PortfolioPerformanceSeries;
};
