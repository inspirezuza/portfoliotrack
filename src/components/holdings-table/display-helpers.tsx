import { formatCurrency, formatPercentRatio } from "@/lib/format";
import type { HoldingRow } from "@/server/holdings";

export function isNativeCurrencyVisible(holding: HoldingRow) {
  return holding.currency !== holding.valuationCurrency;
}

export function formatHoldingValuationMoney({
  emptyLabel,
  holding,
  locale,
  nativeValue,
  primaryValue,
  maximumFractionDigits = 2,
}: {
  emptyLabel: string;
  holding: HoldingRow;
  locale: string;
  nativeValue: number | null;
  primaryValue: number | null;
  maximumFractionDigits?: number;
}) {
  if (primaryValue == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return (
    <>
      <span>
        {formatCurrency(primaryValue, {
          currency: holding.valuationCurrency,
          locale,
          maximumFractionDigits,
        })}
      </span>
      {!isNativeCurrencyVisible(holding) || nativeValue == null ? null : (
        <span className="table-subtext">
          {formatCurrency(nativeValue, {
            currency: holding.currency,
            locale,
            maximumFractionDigits,
          })}
        </span>
      )}
    </>
  );
}

export function formatHoldingPercent(value: number | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatPercentRatio(value, { locale });
}

export function formatValuationMoneyText({
  currency,
  locale,
  value,
}: {
  currency: string;
  locale: string;
  value: number | null;
}) {
  if (value == null) {
    return null;
  }

  return formatCurrency(value, {
    currency,
    locale,
    maximumFractionDigits: 2,
  });
}

export function formatSignedHoldingPercent(
  value: number | null,
  locale: string,
  emptyLabel: string,
) {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  const formattedValue = formatPercentRatio(value, { locale });

  return value > 0 ? `+${formattedValue}` : formattedValue;
}

export function getPnlToneClass(value: number | null) {
  if (value == null || value === 0) {
    return undefined;
  }

  return value > 0 ? "value-positive" : "value-negative";
}

export function formatBroker(value: string) {
  return value === "WEBULL" ? "Webull" : "Dime";
}

export function formatHoldingDateTime(value: string, locale: string) {
  const date = new Date(value);

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

export function formatParentMoney(value: number | null, currency: string | null, locale: string) {
  if (value == null || currency == null) {
    return null;
  }

  return formatCurrency(value, {
    currency,
    locale,
    maximumFractionDigits: 4,
  });
}

export function formatHoldingLotMoney({
  emptyLabel,
  holding,
  locale,
  nativeValue,
  valuationValue,
}: {
  emptyLabel: string;
  holding: HoldingRow;
  locale: string;
  nativeValue: number | null;
  valuationValue: number | null;
}) {
  return formatHoldingValuationMoney({
    emptyLabel,
    holding,
    locale,
    nativeValue,
    primaryValue: isNativeCurrencyVisible(holding) ? valuationValue : nativeValue,
  });
}

export function formatSummaryMoney(
  value: number | null,
  currency: string | null,
  locale: string,
  mixedLabel: string,
) {
  if (value == null || currency == null) {
    return <span className="data-pending">{mixedLabel}</span>;
  }

  return formatCurrency(value, { currency, locale });
}
