import type { DashboardBenchmarkMonthlyReturn, DashboardBenchmarkQuote } from "@/server/dashboard";

export type HistoricalMode = "GAP" | "RETURN";
export type BenchmarkTimeframe = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

export type ChartPoint = {
  month: string;
  label: string;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  portfolioReturn: number | null;
};

export type BenchmarkComparison = {
  benchmarkReturn: number | null;
  displayName: string;
  gap: number | null;
  periodLabel: string | null;
  portfolioReturn: number | null;
  quote: DashboardBenchmarkQuote;
};

export const TIMEFRAME_OPTIONS: Array<{ key: BenchmarkTimeframe; label: string }> = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" },
];

export function formatSignedPercent(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatSignedPercentagePoint(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

export function formatMonthLabel(month: string, locale: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
    year: "2-digit",
  }).format(date);
}

export function getLatestMonth(monthlyReturns: DashboardBenchmarkMonthlyReturn[]) {
  return (
    monthlyReturns
      .map((entry) => entry.month)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}

export function getTimeframeStartMonth(timeframe: BenchmarkTimeframe, latestMonth: string | null) {
  if (latestMonth == null || timeframe === "ALL") {
    return null;
  }

  const latestDate = new Date(`${latestMonth}-01T00:00:00.000Z`);

  if (Number.isNaN(latestDate.getTime())) {
    return null;
  }

  if (timeframe === "YTD") {
    return `${latestMonth.slice(0, 4)}-01`;
  }

  const months = timeframe === "1M" ? 1 : timeframe === "3M" ? 3 : timeframe === "6M" ? 6 : 12;
  const startDate = new Date(latestDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - months + 1);

  return startDate.toISOString().slice(0, 7);
}

export function filterMonthlyReturnsByTimeframe<T extends { month: string }>({
  entries,
  latestMonth,
  timeframe,
}: {
  entries: T[];
  latestMonth: string | null;
  timeframe: BenchmarkTimeframe;
}) {
  const startMonth = getTimeframeStartMonth(timeframe, latestMonth);

  return entries.filter((entry) => startMonth == null || entry.month >= startMonth);
}

export function compoundReturn(values: Array<number | null>) {
  const usableValues = values.filter((value): value is number => value != null);

  if (usableValues.length === 0) {
    return null;
  }

  return (usableValues.reduce((total, value) => total * (1 + value / 100), 1) - 1) * 100;
}

export function formatPeriodLabel({
  entries,
  locale,
  timeframe,
}: {
  entries: Array<{ month: string }>;
  locale: string;
  timeframe: BenchmarkTimeframe;
}) {
  if (entries.length === 0) {
    return null;
  }

  const orderedMonths = entries
    .map((entry) => entry.month)
    .sort((left, right) => left.localeCompare(right));
  const firstMonth = orderedMonths[0];
  const lastMonth = orderedMonths[orderedMonths.length - 1];

  if (timeframe !== "ALL") {
    return `${TIMEFRAME_OPTIONS.find((option) => option.key === timeframe)?.label ?? timeframe} - ${formatMonthLabel(lastMonth, locale)}`;
  }

  return firstMonth === lastMonth
    ? formatMonthLabel(lastMonth, locale)
    : `${formatMonthLabel(firstMonth, locale)}-${formatMonthLabel(lastMonth, locale)}`;
}

export function getBenchmarkLabel(symbol: string) {
  return symbol === "SPYM" ? "S&P 500" : symbol;
}

export function buildBenchmarkComparisons({
  latestMonth,
  locale,
  monthlyReturns,
  quotes,
  timeframe,
}: {
  latestMonth: string | null;
  locale: string;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  quotes: DashboardBenchmarkQuote[];
  timeframe: BenchmarkTimeframe;
}): BenchmarkComparison[] {
  return quotes.map((quote) => {
    const timeframeReturns = filterMonthlyReturnsByTimeframe({
      entries: monthlyReturns.filter((entry) => entry.symbol === quote.symbol),
      latestMonth,
      timeframe,
    }).sort((left, right) => left.month.localeCompare(right.month));
    const portfolioReturn = compoundReturn(
      timeframeReturns.map((entry) => entry.portfolioReturnPercent),
    );
    const benchmarkReturn = compoundReturn(timeframeReturns.map((entry) => entry.returnPercent));

    return {
      benchmarkReturn,
      displayName: getBenchmarkLabel(quote.symbol),
      gap:
        portfolioReturn == null || benchmarkReturn == null
          ? null
          : portfolioReturn - benchmarkReturn,
      periodLabel: formatPeriodLabel({ entries: timeframeReturns, locale, timeframe }),
      portfolioReturn,
      quote,
    };
  });
}

export function buildBenchmarkChartData({
  latestMonth,
  locale,
  monthlyReturns,
  selectedSymbol,
  timeframe,
}: {
  latestMonth: string | null;
  locale: string;
  monthlyReturns: DashboardBenchmarkMonthlyReturn[];
  selectedSymbol: string;
  timeframe: BenchmarkTimeframe;
}): ChartPoint[] {
  return filterMonthlyReturnsByTimeframe({
    entries: monthlyReturns.filter((entry) => entry.symbol === selectedSymbol),
    latestMonth,
    timeframe,
  })
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((entry) => ({
      month: entry.month,
      label: formatMonthLabel(entry.month, locale),
      benchmarkReturn: entry.returnPercent,
      excessReturn: entry.excessReturnPercent,
      portfolioReturn: entry.portfolioReturnPercent,
    }));
}

export function hasBenchmarkQuoteData(comparisons: BenchmarkComparison[]) {
  return comparisons.some((comparison) => comparison.gap != null);
}

export function hasBenchmarkChartData({
  chartData,
  mode,
}: {
  chartData: ChartPoint[];
  mode: HistoricalMode;
}) {
  return chartData.some((point) =>
    mode === "GAP"
      ? point.excessReturn != null
      : point.portfolioReturn != null || point.benchmarkReturn != null,
  );
}
