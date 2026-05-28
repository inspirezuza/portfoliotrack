import { isIntradayDate, parseChartDate } from "@/lib/charts/time-axis";
import { formatCurrency } from "@/lib/format";

export function formatChartDate(value: string) {
  const hasTime = isIntradayDate(value);

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(parseChartDate(value));
}

export function formatPrice(value: number, currency: string) {
  return formatCurrency(value, {
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  });
}

export function formatAxisPrice(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

export function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
