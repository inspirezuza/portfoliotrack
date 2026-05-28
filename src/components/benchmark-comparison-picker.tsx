"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "@/components/loading-indicator";
import { formatCurrency } from "@/lib/format";
import { normalizeInstrumentSearchValue } from "@/lib/transactions/instrument-selection";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import styles from "./benchmark-comparison-picker.module.css";

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

type InstrumentSearchResult = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
  exchangeName: string | null;
};

type InstrumentSearchApiResponse = ApiErrorResponse & {
  results?: InstrumentSearchResult[];
};

type BenchmarkComparisonApiResponse = ApiErrorResponse & {
  comparison?: {
    overlay: DashboardBenchmarkOverlay;
    quote: DashboardBenchmarkQuote;
  };
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

type BenchmarkComparisonPickerProps = {
  items: BenchmarkComparisonPickerItem[];
  labels: {
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
  language: UiLanguage;
  onAddComparison: (comparison: {
    overlay: DashboardBenchmarkOverlay;
    quote: DashboardBenchmarkQuote;
  }) => void;
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
  return name.length <= 32 ? name : `${name.slice(0, 30)}...`;
}

function getErrorMessage(error: ApiErrorResponse["error"], fallbackMessage: string) {
  return error?.message ?? fallbackMessage;
}

function matchesExistingItem(
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InstrumentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingProviderSymbol, setAddingProviderSymbol] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const availableItems = useMemo(() => items.filter((item) => !item.selected), [items]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDialogOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDialogOpen]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!isDialogOpen || query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/instruments/search?query=${encodeURIComponent(query)}`, {
          signal: abortController.signal,
        });
        const payload = (await response.json()) as InstrumentSearchApiResponse;

        if (!response.ok) {
          throw new Error(getErrorMessage(payload.error, labels.searchError));
        }

        setSearchResults(payload.results ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSearchResults([]);
        setErrorMessage(error instanceof Error ? error.message : labels.searchError);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [isDialogOpen, labels.searchError, searchQuery]);

  function closeDialog() {
    setIsDialogOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setErrorMessage(null);
    setAddingProviderSymbol(null);
  }

  function addExistingItem(item: BenchmarkComparisonPickerItem) {
    if (!item.selected) {
      onToggle(item.symbol);
    }

    closeDialog();
  }

  async function addSearchResult(instrument: InstrumentSearchResult) {
    const existingItem = items.find((item) => matchesExistingItem(item, instrument));

    if (existingItem != null) {
      addExistingItem(existingItem);
      return;
    }

    setAddingProviderSymbol(instrument.providerSymbol);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/benchmark-comparisons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(instrument),
      });
      const payload = (await response.json()) as BenchmarkComparisonApiResponse;

      if (!response.ok || payload.comparison == null) {
        throw new Error(getErrorMessage(payload.error, labels.searchError));
      }

      onAddComparison(payload.comparison);
      closeDialog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : labels.searchError);
    } finally {
      setAddingProviderSymbol(null);
    }
  }

  const dialog = !isDialogOpen ? null : (
    <div
      className={styles.modal}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
    >
      <button
        aria-label={labels.close}
        className={styles.backdrop}
        onClick={closeDialog}
        type="button"
      />
      <div
        aria-label={labels.dialogTitle}
        aria-modal="true"
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className={styles.dialogHeader}>
          <strong>{labels.dialogTitle}</strong>
          <button aria-label={labels.close} onClick={closeDialog} type="button">
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <label className={styles.searchField}>
          <span>{labels.search}</span>
          <input
            autoComplete="off"
            autoFocus
            disabled={addingProviderSymbol != null}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            type="text"
            value={searchQuery}
          />
        </label>

        {errorMessage == null ? null : <p className={styles.error}>{errorMessage}</p>}

        <div className={styles.dialogList}>
          {searchQuery.trim().length >= 2 ? (
            isSearching ? (
              <div className={styles.empty} role="status">
                <LoadingIndicator label={labels.searching} size="sm" />
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((instrument) => {
                const existingItem = items.find((item) => matchesExistingItem(item, instrument));
                const isSelected = existingItem?.selected ?? false;
                const isAdding = addingProviderSymbol === instrument.providerSymbol;

                return (
                  <button
                    className={styles.result}
                    disabled={isSelected || addingProviderSymbol != null}
                    key={instrument.providerSymbol}
                    onClick={() => void addSearchResult(instrument)}
                    type="button"
                  >
                    <span className={styles.resultSymbol}>{instrument.symbol}</span>
                    <span className={styles.resultName}>{instrument.displayName}</span>
                    <span className={styles.resultMeta}>
                      {isAdding
                        ? labels.adding
                        : isSelected
                          ? labels.saved
                          : instrument.instrumentType}
                      {" / "}
                      {instrument.market}
                      {" / "}
                      {instrument.currency}
                      {" / "}
                      {instrument.providerSymbol}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className={styles.empty} role="status">
                {labels.noMatches}
              </div>
            )
          ) : availableItems.length > 0 ? (
            availableItems.map((item) => (
              <button
                className={styles.result}
                key={item.providerSymbol}
                onClick={() => addExistingItem(item)}
                type="button"
              >
                <span className={styles.resultSymbol}>{item.symbol}</span>
                <span className={styles.resultName}>{shortName(item.displayName)}</span>
                <span className={styles.resultMeta}>
                  {formatPrice({ currency: item.currency, locale, price: item.price })}
                  {" / "}
                  <em className={getToneClassName(item.returnPercent)}>
                    {formatSignedPercent(item.returnPercent)}
                  </em>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.empty} role="status">
              {labels.noMatches}
            </div>
          )}
        </div>
      </div>
    </div>
  );

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

      {typeof document === "undefined" || dialog == null
        ? null
        : createPortal(dialog, document.body)}
    </section>
  );
}
