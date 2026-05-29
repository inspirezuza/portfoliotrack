import { formatCurrency } from "@/lib/format";
import type {
  PortfolioBenchmarkTimelineStatus,
  PortfolioTimelinePoint,
} from "@/lib/portfolio/timeline";
import {
  attachTimeAxis,
  getUtcDateTime,
  isDailyPoint,
  isIntradayDate,
  isIntradayPoint,
  parseChartDate,
  type TimeAxisPoint,
} from "@/lib/charts/time-axis";
import type { getUiCopy } from "@/lib/ui/copy";

export type TimeframeKey = "1D" | "5D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL";

export type ChartPoint = PortfolioTimelinePoint &
  TimeAxisPoint & {
    changeFromRangeStart: number | null;
  };

export type SelectionRange = {
  startDate: string;
  endDate: string;
};

export const TIMEFRAME_OPTIONS: TimeframeKey[] = [
  "1D",
  "5D",
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "3Y",
  "5Y",
  "ALL",
];

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

export function formatChartValue(value: number, currency: string | null, locale: string) {
  if (currency == null) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return formatCurrency(value, {
    currency,
    locale,
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

export function formatAxisValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

export function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getUnavailableMessage(
  status: PortfolioBenchmarkTimelineStatus,
  copy: ReturnType<typeof getUiCopy>["charts"]["portfolio"],
) {
  switch (status) {
    case "no-transactions":
      return copy.unavailable.noTransactions;
    case "mixed-currency":
      return copy.unavailable.mixedCurrency;
    case "missing-portfolio-history":
      return copy.unavailable.missingPortfolioHistory;
    default:
      return copy.unavailable.default;
  }
}

export function getTimeframeStartDate(key: TimeframeKey, latestDate: string) {
  const latest = parseChartDate(latestDate);

  if (key === "ALL") {
    return null;
  }

  if (key === "YTD") {
    return `${latest.getUTCFullYear()}-01-01T00:00:00.000Z`;
  }

  const daysByKey: Record<Exclude<TimeframeKey, "ALL" | "YTD">, number> = {
    "1D": 1,
    "5D": 5,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
    "3Y": 1095,
    "5Y": 1825,
  };
  latest.setUTCDate(latest.getUTCDate() - daysByKey[key]);

  return latest.toISOString();
}

function isShortTimeframe(timeframe: TimeframeKey) {
  return timeframe === "1D" || timeframe === "5D" || timeframe === "1W" || timeframe === "1M";
}

function getPreferredIntradayInterval(timeframe: TimeframeKey) {
  if (timeframe === "1D") {
    return "5m";
  }

  if (timeframe === "5D" || timeframe === "1W" || timeframe === "1M") {
    return "1h";
  }

  return null;
}

export function getVisibleSeries(series: PortfolioTimelinePoint[], timeframe: TimeframeKey) {
  const latestPoint = series[series.length - 1];

  if (latestPoint == null) {
    return [];
  }

  const startDate = getTimeframeStartDate(timeframe, latestPoint.date);
  const startTime = startDate == null ? null : getUtcDateTime(startDate);
  const filteredSeries =
    startTime == null ? series : series.filter((point) => getUtcDateTime(point.date) >= startTime);

  if (isShortTimeframe(timeframe)) {
    const preferredInterval = getPreferredIntradayInterval(timeframe);
    const preferredIntradaySeries = filteredSeries.filter(
      (point) => preferredInterval != null && point.interval === preferredInterval,
    );

    if (preferredIntradaySeries.length >= 2) {
      return preferredIntradaySeries;
    }

    const intradaySeries = filteredSeries.filter(isIntradayPoint);

    if (intradaySeries.length >= 2) {
      return intradaySeries;
    }
  } else {
    const dailySeries = filteredSeries.filter(isDailyPoint);

    if (dailySeries.length >= 2) {
      return dailySeries;
    }
  }

  return filteredSeries.length > 0 ? filteredSeries : [latestPoint];
}

export function calculatePercentChange(startValue: number, endValue: number) {
  if (startValue === 0) {
    return null;
  }

  return ((endValue - startValue) / startValue) * 100;
}

export function buildPortfolioChartData(visibleSeries: PortfolioTimelinePoint[]): ChartPoint[] {
  const firstValue = visibleSeries[0]?.value ?? null;

  return attachTimeAxis(visibleSeries).map((point) => ({
    ...point,
    changeFromRangeStart:
      firstValue == null ? null : calculatePercentChange(firstValue, point.value),
  }));
}

export function getRangeStats(chartData: ChartPoint[]) {
  if (chartData.length === 0) {
    return null;
  }

  const firstPoint = chartData[0];
  const latestPoint = chartData[chartData.length - 1];
  const highPoint = chartData.reduce((highest, point) =>
    point.value > highest.value ? point : highest,
  );
  const lowPoint = chartData.reduce((lowest, point) =>
    point.value < lowest.value ? point : lowest,
  );
  const percentChange = calculatePercentChange(firstPoint.value, latestPoint.value);

  return {
    latestPoint,
    highPoint,
    lowPoint,
    percentChange,
  };
}

export function getPaddedDomain(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return undefined;
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const spread = max - min;
  const padding = spread === 0 ? Math.max(Math.abs(max) * 0.05, 1) : spread * 0.12;

  return [Math.max(0, min - padding), max + padding] satisfies [number, number];
}

export function getSelectionPoints(data: ChartPoint[], selection: SelectionRange | null) {
  if (selection == null) {
    return null;
  }

  const startTime = getUtcDateTime(selection.startDate);
  const endTime = getUtcDateTime(selection.endDate);
  const minTime = Math.min(startTime, endTime);
  const maxTime = Math.max(startTime, endTime);
  const startPoint = data.find((point) => getUtcDateTime(point.date) === minTime) ?? null;
  const endPoint = data.find((point) => getUtcDateTime(point.date) === maxTime) ?? null;

  if (startPoint == null || endPoint == null) {
    return null;
  }

  return {
    startPoint,
    endPoint,
  };
}

export function hasSelectionSpan(points: ReturnType<typeof getSelectionPoints>) {
  return points != null && points.startPoint.date !== points.endPoint.date;
}
