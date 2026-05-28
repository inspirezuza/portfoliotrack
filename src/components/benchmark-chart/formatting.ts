import { formatCurrency, formatPercentRatio } from "@/lib/format";
import { isIntradayDate, parseChartDate } from "@/lib/charts/time-axis";
import { getUiCopy } from "@/lib/ui/copy";
import type {
  BenchmarkComparisonBasis,
  PortfolioBenchmarkTimelineStatus,
} from "@/lib/portfolio/timeline";
import type { ChartPoint, PerformanceMode, ReturnBasis } from "@/components/benchmark-chart/types";

export type BenchmarkPerformanceSummaryStatus =
  | "ready"
  | "no-transactions"
  | "mixed-currency"
  | "missing-market-value"
  | "no-positive-net-invested";

export function formatChartDate(value: string, locale: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(parseChartDate(value));
}

function formatIndexedReturn(value: number, locale: string) {
  return formatPercentRatio(value / 100, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

export function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatPercentagePoint(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

export function formatPerformanceMoney(
  value: number | null,
  currency: string | null,
  locale: string,
) {
  if (value == null || currency == null) {
    return "-";
  }

  return formatCurrency(value, { currency, locale });
}

export function formatAbsoluteReturn(value: number | null, locale: string) {
  if (value == null) {
    return "-";
  }

  return formatPercentRatio(value, {
    locale,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

export function formatModeValue(value: number, mode: PerformanceMode, locale: string) {
  if (mode === "INDEXED") {
    return formatIndexedReturn(value, locale);
  }

  return mode === "GAP" ? formatPercentagePoint(value) : formatSignedPercent(value);
}

export function getBasisLabel({
  benchmarkCurrency,
  comparisonBasis,
  portfolioCurrency,
  copy,
}: {
  benchmarkCurrency: string | null;
  comparisonBasis: BenchmarkComparisonBasis | null;
  portfolioCurrency: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
}) {
  if (comparisonBasis === "same-currency") {
    return portfolioCurrency == null
      ? copy.basis.sameCurrencyFallback
      : copy.basis.sameCurrency(portfolioCurrency);
  }

  if (comparisonBasis === "native-currency-return") {
    return benchmarkCurrency == null
      ? copy.basis.nativeCurrencyFallback
      : copy.basis.nativeCurrency(benchmarkCurrency);
  }

  return copy.basis.performanceReturn;
}

export function getAbsoluteSummaryMessage({
  copy,
  status,
}: {
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  status: BenchmarkPerformanceSummaryStatus;
}) {
  switch (status) {
    case "mixed-currency":
      return copy.absoluteSummary.unavailable.mixedCurrency;
    case "missing-market-value":
      return copy.absoluteSummary.unavailable.missingMarketValue;
    case "no-positive-net-invested":
      return copy.absoluteSummary.unavailable.noPositiveNetInvested;
    case "no-transactions":
      return copy.absoluteSummary.unavailable.noTransactions;
    default:
      return null;
  }
}

export function getValueClassName(value: number | null) {
  if (value == null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

export function getSeriesChangeValue(
  point: ChartPoint,
  key: "portfolio" | "benchmark",
  mode: PerformanceMode,
) {
  if (mode === "GAP") {
    return key === "portfolio" ? point.gap : 0;
  }

  if (mode === "DRAWDOWN") {
    return key === "portfolio" ? point.portfolioDrawdown : point.benchmarkDrawdown;
  }

  return key === "portfolio" ? point.portfolioReturn : point.benchmarkReturn;
}

export function formatSeriesPointValue(value: number, mode: PerformanceMode, locale: string) {
  return formatModeValue(value, mode, locale);
}

export function getUnavailableMessage({
  benchmarkSymbol,
  copy,
  portfolioCurrency,
  returnBasis,
  status,
}: {
  benchmarkSymbol: string | null;
  copy: ReturnType<typeof getUiCopy>["charts"]["benchmark"];
  portfolioCurrency: string | null;
  returnBasis: ReturnBasis;
  status: PortfolioBenchmarkTimelineStatus;
}) {
  if (status === "ready" && returnBasis === "ABSOLUTE") {
    return copy.unavailable.missingAbsoluteReturn;
  }

  switch (status) {
    case "no-transactions":
      return copy.unavailable.noTransactions;
    case "mixed-currency":
      return copy.unavailable.mixedCurrency;
    case "missing-portfolio-history":
      return copy.unavailable.missingPortfolioHistory;
    case "benchmark-currency-mismatch":
      return benchmarkSymbol == null || portfolioCurrency == null
        ? copy.unavailable.currencyMismatchFallback
        : copy.unavailable.currencyMismatch(benchmarkSymbol, portfolioCurrency);
    case "missing-benchmark-history":
      return benchmarkSymbol == null
        ? copy.unavailable.missingBenchmarkFallback
        : copy.unavailable.missingBenchmarkHistory(benchmarkSymbol);
    default:
      return copy.unavailable.default;
  }
}
