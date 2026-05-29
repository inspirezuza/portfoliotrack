import { formatCurrency, formatPercentRatio } from "@/lib/format";

export function formatPriceAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "No price age data";
  }

  if (minutes < 1) {
    return "Just updated";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}

export function formatOptionalMoney(value: number | null, currency: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  return formatCurrency(value, { currency });
}

export function formatOptionalPercent(value: number | null) {
  if (value == null) {
    return "Not available";
  }

  return formatPercentRatio(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
