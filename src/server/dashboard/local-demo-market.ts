import { normalizeMoney } from "@/lib/db/precision";

export type LocalDemoOverlayPoint = {
  date: string;
  value: number;
  interval: "1d";
};

export type LocalDemoMonthlyReturn = {
  symbol: string;
  month: string;
  returnPercent: number | null;
  portfolioReturnPercent: number | null;
  excessReturnPercent: number | null;
};

const LOCAL_DEMO_MONTHS = [
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
] as const;

const LOCAL_DEMO_PORTFOLIO_RETURNS = [
  3.4, -2.1, 4.8, 1.6, -5.7, 2.2, -1.8, 7.9, -3.8, 6.1, 2.4, 3.7,
];

const LOCAL_DEMO_BENCHMARK_RETURNS: Record<string, number[]> = {
  SPYM: [2.6, 1.4, 3.2, -0.8, -2.0, 2.8, 1.1, 4.3, -1.2, 3.5, 1.8, 2.9],
  QQQ: [4.1, 2.8, 5.4, -1.5, -3.6, 3.9, 1.7, 6.2, -2.8, 5.9, 2.1, 4.6],
  TDEX: [1.2, -0.7, 0.9, 1.6, -1.4, 0.8, 1.9, 2.1, -0.4, 1.2, 0.7, 1.5],
  NVDA: [8.5, -4.4, 9.8, 6.0, -8.1, 7.2, 3.3, 13.8, -6.5, 11.4, 4.7, 9.1],
  GOOGL: [3.0, 1.6, 4.2, -1.1, -2.9, 3.4, 2.5, 5.6, -2.2, 4.8, 1.9, 3.5],
};

const LOCAL_DEMO_QUOTES: Record<string, { price: number; dailyChange: number; asOf: string }> = {
  SPYM: { price: 86.96, dailyChange: 0.34, asOf: "2026-05-26T20:00:00.000Z" },
  QQQ: { price: 609.11, dailyChange: 8.7, asOf: "2026-05-26T20:00:00.000Z" },
  TDEX: { price: 12.4, dailyChange: 0.08, asOf: "2026-05-26T10:00:00.000Z" },
  NVDA: { price: 214.77, dailyChange: 3.64, asOf: "2026-05-26T20:00:00.000Z" },
  GOOGL: { price: 189.43, dailyChange: 1.16, asOf: "2026-05-26T20:00:00.000Z" },
};

export function shouldUseLocalDemoMarketData(monthCount: number) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK !== "false" &&
    monthCount < 3
  );
}

export function getLocalDemoQuote(symbol: string) {
  return LOCAL_DEMO_QUOTES[symbol] ?? null;
}

export function buildLocalDemoOverlayPoints(symbol: string): LocalDemoOverlayPoint[] {
  const benchmarkReturns =
    LOCAL_DEMO_BENCHMARK_RETURNS[symbol] ?? LOCAL_DEMO_BENCHMARK_RETURNS.SPYM;
  let value = 100;

  return LOCAL_DEMO_MONTHS.map((month, index) => {
    value = normalizeMoney(value * (1 + (benchmarkReturns[index] ?? 0) / 100));

    return {
      date: `${month}-01`,
      interval: "1d",
      value,
    };
  });
}

export function buildLocalDemoMonthlyReturns({
  portfolioMonthlyReturns,
  symbol,
}: {
  portfolioMonthlyReturns: Map<string, number | null>;
  symbol: string;
}): LocalDemoMonthlyReturn[] {
  const benchmarkReturns =
    LOCAL_DEMO_BENCHMARK_RETURNS[symbol] ?? LOCAL_DEMO_BENCHMARK_RETURNS.SPYM;

  return LOCAL_DEMO_MONTHS.map((month, index) => {
    const benchmarkReturn = benchmarkReturns[index] ?? null;
    const portfolioReturn =
      LOCAL_DEMO_PORTFOLIO_RETURNS[index] ?? portfolioMonthlyReturns.get(month) ?? null;

    return {
      symbol,
      month: String(month),
      returnPercent: benchmarkReturn,
      portfolioReturnPercent: portfolioReturn,
      excessReturnPercent:
        benchmarkReturn == null || portfolioReturn == null
          ? null
          : portfolioReturn - benchmarkReturn,
    };
  });
}
