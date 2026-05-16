type CurrencyFormatOptions = {
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type QuantityFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type PercentFormatOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

function createNumberFormatter(locale: string | undefined, options: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options);
}

export function formatCurrency(
  value: number,
  { currency = "THB", minimumFractionDigits = 2, maximumFractionDigits = 2 }: CurrencyFormatOptions = {}
) {
  return createNumberFormatter(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

export function formatQuantity(
  value: number,
  { minimumFractionDigits = 0, maximumFractionDigits = 6 }: QuantityFormatOptions = {}
) {
  return createNumberFormatter(undefined, {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

export function formatPercent(
  value: number,
  { minimumFractionDigits = 2, maximumFractionDigits = 2 }: PercentFormatOptions = {}
) {
  const normalizedValue = value / 100;

  return createNumberFormatter(undefined, {
    style: "percent",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(normalizedValue);
}

export function formatPercentRatio(value: number, options?: PercentFormatOptions) {
  return createNumberFormatter(undefined, {
    style: "percent",
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }).format(value);
}
