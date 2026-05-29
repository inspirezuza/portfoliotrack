"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { BenchmarkComparisonPickerDialog } from "@/components/benchmark-comparison-picker-dialog";
import {
  formatPrice,
  formatSignedPercent,
  getToneClassName,
  shortName,
  type BenchmarkComparisonPickerItem,
  type BenchmarkComparisonPickerLabels,
} from "@/components/benchmark-comparison-picker-helpers";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import styles from "./benchmark-comparison-picker.module.css";

export type { BenchmarkComparisonPickerItem } from "@/components/benchmark-comparison-picker-helpers";

type BenchmarkComparisonPickerProps = {
  items: BenchmarkComparisonPickerItem[];
  labels: BenchmarkComparisonPickerLabels;
  language: UiLanguage;
  onAddComparison: (comparison: {
    overlay: DashboardBenchmarkOverlay;
    quote: DashboardBenchmarkQuote;
  }) => void;
  onClear: () => void;
  onToggle: (symbol: string) => void;
  selectedSymbols: string[];
};

export function BenchmarkComparisonPicker({
  items,
  labels,
  language,
  onAddComparison,
  onClear,
  onToggle,
  selectedSymbols,
}: BenchmarkComparisonPickerProps) {
  const locale = getUiLocale(language);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <section className={styles.section} aria-label={labels.aria}>
      <div className={styles.toolbar}>
        <button className={styles.addButton} onClick={() => setIsDialogOpen(true)} type="button">
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

      {items.length > 0 ? (
        <div className={styles.cardStrip}>
          {items.map((item) => (
            <button
              aria-pressed={item.selected}
              className={styles.card}
              key={item.providerSymbol}
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
      ) : null}

      {typeof document === "undefined" || !isDialogOpen
        ? null
        : createPortal(
            <BenchmarkComparisonPickerDialog
              items={items}
              labels={labels}
              locale={locale}
              onAddComparison={onAddComparison}
              onClose={() => setIsDialogOpen(false)}
              onToggle={onToggle}
            />,
            document.body,
          )}
    </section>
  );
}
