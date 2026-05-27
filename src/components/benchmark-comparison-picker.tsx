"use client";

import { formatCurrency } from "@/lib/format";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import styles from "./benchmark-comparison-picker.module.css";

export type BenchmarkComparisonPickerItem = {
  symbol: string;
  displayName: string;
  market: string;
  currency: string;
  price: number | null;
  returnPercent: number | null;
  color: string;
  selected: boolean;
};

type BenchmarkComparisonPickerProps = {
  items: BenchmarkComparisonPickerItem[];
  labels: {
    add: string;
    aria: string;
    clear: string;
    remove: (symbol: string) => string;
  };
  language: UiLanguage;
  onClear: () => void;
  onToggle: (symbol: string) => void;
  selectedSymbols: string[];
};

function formatSignedPercent(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getToneClassName(value: number | null) {
  if (value == null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

function formatPrice({
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

function shortName(name: string) {
  return name.length <= 22 ? name : `${name.slice(0, 20)}...`;
}

export function BenchmarkComparisonPicker({
  items,
  labels,
  language,
  onClear,
  onToggle,
  selectedSymbols,
}: BenchmarkComparisonPickerProps) {
  const locale = getUiLocale(language);
  const selectedItems = items.filter((item) => item.selected);
  const hasSelections = selectedItems.length > 0;

  return (
    <section className={styles.section} aria-label={labels.aria}>
      {hasSelections ? (
        <div className={styles.selectedList}>
          {selectedItems.map((item) => (
            <div className={styles.selectedRow} key={item.symbol}>
              <span
                className={styles.marker}
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <strong>{item.symbol}</strong>
              <span>{formatPrice({ currency: item.currency, locale, price: item.price })}</span>
              <em className={getToneClassName(item.returnPercent)}>
                {formatSignedPercent(item.returnPercent)}
              </em>
              <button
                aria-label={labels.remove(item.symbol)}
                onClick={() => onToggle(item.symbol)}
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <button className={styles.addButton} type="button" disabled>
          {labels.add}
        </button>
        <button
          className={styles.clearButton}
          disabled={selectedSymbols.length === 0}
          onClick={onClear}
          type="button"
        >
          {labels.clear}
        </button>
      </div>

      <div className={styles.cardStrip}>
        {items.map((item) => (
          <button
            aria-pressed={item.selected}
            className={styles.card}
            key={item.symbol}
            onClick={() => onToggle(item.symbol)}
            type="button"
          >
            <span className={styles.cardTitle}>{shortName(item.displayName)}</span>
            <strong>{formatPrice({ currency: item.currency, locale, price: item.price })}</strong>
            <span className={styles.cardMeta}>
              <span>{item.symbol}</span>
              <em className={getToneClassName(item.returnPercent)}>
                {formatSignedPercent(item.returnPercent)}
              </em>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
