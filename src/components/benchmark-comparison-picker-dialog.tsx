"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import {
  formatPrice,
  formatSignedPercent,
  getErrorMessage,
  getToneClassName,
  matchesExistingItem,
  shortName,
  type BenchmarkComparisonPickerItem,
  type BenchmarkComparisonPickerLabels,
  type BenchmarkComparisonApiResponse,
  type InstrumentSearchApiResponse,
  type InstrumentSearchResult,
} from "@/components/benchmark-comparison-picker-helpers";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "@/server/dashboard";
import styles from "./benchmark-comparison-picker.module.css";

type BenchmarkComparisonPickerDialogProps = {
  items: BenchmarkComparisonPickerItem[];
  labels: BenchmarkComparisonPickerLabels;
  locale: string;
  onAddComparison: (comparison: {
    overlay: DashboardBenchmarkOverlay;
    quote: DashboardBenchmarkQuote;
  }) => void;
  onClose: () => void;
  onToggle: (symbol: string) => void;
};

export function BenchmarkComparisonPickerDialog({
  items,
  labels,
  locale,
  onAddComparison,
  onClose,
  onToggle,
}: BenchmarkComparisonPickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InstrumentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingProviderSymbol, setAddingProviderSymbol] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const availableItems = useMemo(() => items.filter((item) => !item.selected), [items]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
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
  }, [labels.searchError, searchQuery]);

  function addExistingItem(item: BenchmarkComparisonPickerItem) {
    if (!item.selected) {
      onToggle(item.symbol);
    }

    onClose();
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
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : labels.searchError);
    } finally {
      setAddingProviderSymbol(null);
    }
  }

  return (
    <div
      className={styles.modal}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        aria-label={labels.close}
        className={styles.backdrop}
        onClick={onClose}
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
          <button aria-label={labels.close} onClick={onClose} type="button">
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
}
