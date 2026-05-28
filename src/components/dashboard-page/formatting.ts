import { formatCurrency, formatPercentRatio } from "@/lib/format";
import type { getUiCopy } from "@/lib/ui/copy";
import type { DashboardSummary } from "@/server/dashboard";

type DashboardCopy = ReturnType<typeof getUiCopy>["dashboard"];
type SharedCopy = ReturnType<typeof getUiCopy>["shared"];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DISPLAY_CURRENCY = "THB";

export function formatAgeLabel(minutes: number | null, copy: DashboardCopy) {
  if (minutes == null) {
    return copy.age.noCachedData;
  }

  if (minutes < 1) {
    return copy.age.justUpdated;
  }

  if (minutes < 60) {
    return copy.age.minutesAgo(minutes);
  }

  return copy.age.hoursAgo(Math.floor(minutes / 60));
}

function parseCacheDate(value: string) {
  return new Date(DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00+07:00` : value);
}

export function formatCacheDateParts(value: string | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return { date: emptyLabel, time: null };
  }

  const date = parseCacheDate(value);

  if (Number.isNaN(date.getTime())) {
    return { date: value, time: null };
  }

  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);

  return {
    date: dateLabel,
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(date),
  };
}

export function formatCacheDateLabel(value: string | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  const date = parseCacheDate(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);
}

export function formatDashboardMoney(
  value: number | null,
  currency: string | null,
  locale: string,
  fallback = formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale }),
) {
  if (value == null) {
    return fallback;
  }

  return formatCurrency(value, { currency: currency ?? DEFAULT_DISPLAY_CURRENCY, locale });
}

export function formatSummaryMoney(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl",
  locale: string,
  sharedCopy: SharedCopy,
) {
  const value = summary[key];

  if (value != null) {
    return formatCurrency(value, {
      currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY,
      locale,
    });
  }

  if (summary.currencyBreakdown.length > 1) {
    return sharedCopy.mixed;
  }

  if (summary.openPositionCount === 0) {
    return formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale });
  }

  return sharedCopy.pending;
}

export function formatRealizedMoney(
  summary: DashboardSummary,
  locale: string,
  sharedCopy: SharedCopy,
) {
  if (summary.totalRealizedPnl != null) {
    return formatCurrency(summary.totalRealizedPnl, {
      currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY,
      locale,
    });
  }

  return summary.realizedBreakdown.length > 1
    ? sharedCopy.mixed
    : formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale });
}

function formatSignedPercentRatio(value: number, locale: string) {
  const formattedValue = formatPercentRatio(value, { locale });

  return value > 0 ? `+${formattedValue}` : formattedValue;
}

export function formatUnrealizedPnlDetail(
  summary: DashboardSummary,
  locale: string,
  copy: DashboardCopy,
) {
  if (
    summary.totalUnrealizedPnl == null ||
    summary.totalCostBasis == null ||
    summary.totalCostBasis <= 0
  ) {
    return copy.vsCostBasis;
  }

  return `${formatSignedPercentRatio(
    summary.totalUnrealizedPnl / summary.totalCostBasis,
    locale,
  )} ${copy.vsCostBasis}`;
}

export function formatNetInvestedDetail({
  fallback,
  label,
  locale,
  netInvested,
  signed = false,
  value,
}: {
  fallback: string;
  label: string;
  locale: string;
  netInvested: number | null;
  signed?: boolean;
  value: number | null;
}) {
  if (value == null || netInvested == null || netInvested <= 0) {
    return fallback;
  }

  const ratio = value / netInvested;
  const formattedRatio = signed
    ? formatSignedPercentRatio(ratio, locale)
    : formatPercentRatio(ratio, { locale });

  return `${formattedRatio} / ${label}`;
}

export function getValueTone(value: number | null) {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}
