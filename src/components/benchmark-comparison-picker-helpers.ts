import { formatCurrency } from "@/lib/format";
import { normalizeInstrumentSearchValue } from "@/lib/transactions/instrument-selection";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";

export type BenchmarkComparisonPickerItem = {
  symbol: string;
  displayName: string;
  providerSymbol: string;
  market: string;
  currency: string;
  price: number | null;
  returnPercent: number | null;
  color: string;
  selected: boolean;
};

export type InstrumentSearchResult = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
  exchangeName: string | null;
};

export type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

export type InstrumentSearchApiResponse = ApiErrorResponse & {
  results?: InstrumentSearchResult[];
};

export type BenchmarkComparisonApiResponse = ApiErrorResponse & {
  comparison?: {
    overlay: DashboardBenchmarkOverlay;
    quote: DashboardBenchmarkQuote;
  };
};

export type BenchmarkComparisonPickerLabels = {
  add: string;
  adding: string;
  aria: string;
  clear: string;
  close: string;
  dialogTitle: string;
  noMatches: string;
  remove: (symbol: string) => string;
  saved: string;
  search: string;
  searchError: string;
  searchPlaceholder: string;
  searching: string;
};

export function formatSignedPercent(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function getToneClassName(value: number | null) {
  if (value == null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

export function formatPrice({
  currency,
  locale,
  price,
}: {
  currency: string;
  locale: string;
  price: number | null;
}) {
  if (price == null) {
    return "-";
  }

  return formatCurrency(price, {
    currency,
    locale,
    maximumFractionDigits: price >= 100 ? 2 : 4,
  });
}

export function shortName(name: string) {
  return name.length <= 32 ? name : `${name.slice(0, 30)}...`;
}

export function getErrorMessage(error: ApiErrorResponse["error"], fallbackMessage: string) {
  return error?.message ?? fallbackMessage;
}

export function matchesExistingItem(
  item: BenchmarkComparisonPickerItem,
  instrument: InstrumentSearchResult,
) {
  return (
    normalizeInstrumentSearchValue(item.symbol) ===
      normalizeInstrumentSearchValue(instrument.symbol) ||
    normalizeInstrumentSearchValue(item.providerSymbol) ===
      normalizeInstrumentSearchValue(instrument.providerSymbol)
  );
}
