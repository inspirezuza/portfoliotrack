type CurrencyFormatOptions = {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type QuantityFormatOptions = {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type PercentFormatOptions = {
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

function createNumberFormatter(locale: string | undefined, options: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options);
}

export function formatCurrency(
  value: number,
  {
    currency = "THB",
    locale,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  }: CurrencyFormatOptions = {}
) {
  return createNumberFormatter(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

export function formatQuantity(
  value: number,
  { locale, minimumFractionDigits = 0, maximumFractionDigits = 6 }: QuantityFormatOptions = {}
) {
  return createNumberFormatter(locale, {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

export function formatPercent(
  value: number,
  { locale, minimumFractionDigits = 2, maximumFractionDigits = 2 }: PercentFormatOptions = {}
) {
  const normalizedValue = value / 100;

  return createNumberFormatter(locale, {
    style: "percent",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(normalizedValue);
}

export function formatPercentRatio(value: number, options?: PercentFormatOptions) {
  return createNumberFormatter(options?.locale, {
    style: "percent",
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }).format(value);
}
