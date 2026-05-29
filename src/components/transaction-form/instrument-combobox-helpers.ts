import type { TransactionInstrumentOption } from "@/server/transactions";

export function getNextHighlightedInstrumentId({
  currentHighlightedInstrumentId,
  direction,
  visibleInstrumentOptions,
}: {
  currentHighlightedInstrumentId: string | null;
  direction: "down" | "up";
  visibleInstrumentOptions: TransactionInstrumentOption[];
}) {
  if (visibleInstrumentOptions.length === 0) {
    return null;
  }

  const currentIndex = visibleInstrumentOptions.findIndex(
    (instrument) => String(instrument.id) === currentHighlightedInstrumentId,
  );
  const fallbackIndex = direction === "down" ? -1 : 0;
  const nextIndex =
    direction === "down"
      ? (currentIndex + 1) % visibleInstrumentOptions.length
      : (currentIndex === -1 ? fallbackIndex : currentIndex - 1 + visibleInstrumentOptions.length) %
        visibleInstrumentOptions.length;

  return String(visibleInstrumentOptions[nextIndex].id);
}

export function getInstrumentSearchKeyAction({
  currentHighlightedInstrumentId,
  isInstrumentComboboxOpen,
  key,
  selectedInstrumentLabel,
  visibleInstrumentOptions,
}: {
  currentHighlightedInstrumentId: string | null;
  isInstrumentComboboxOpen: boolean;
  key: string;
  selectedInstrumentLabel: string;
  visibleInstrumentOptions: TransactionInstrumentOption[];
}) {
  const opensCombobox = ["ArrowDown", "ArrowUp", "Enter"].includes(key);
  const nextIsInstrumentComboboxOpen = opensCombobox ? true : isInstrumentComboboxOpen;

  if (key === "ArrowDown" || key === "ArrowUp") {
    return {
      highlightedInstrumentId: getNextHighlightedInstrumentId({
        currentHighlightedInstrumentId,
        direction: key === "ArrowDown" ? "down" : "up",
        visibleInstrumentOptions,
      }),
      isInstrumentComboboxOpen: nextIsInstrumentComboboxOpen,
      preventDefault: true,
      selectedInstrument: null,
    };
  }

  if (key === "Enter" && isInstrumentComboboxOpen) {
    const selectedInstrument =
      visibleInstrumentOptions.find(
        (instrument) => String(instrument.id) === currentHighlightedInstrumentId,
      ) ?? visibleInstrumentOptions[0];

    if (selectedInstrument) {
      return {
        highlightedInstrumentId: String(selectedInstrument.id),
        isInstrumentComboboxOpen: false,
        preventDefault: true,
        selectedInstrument,
      };
    }
  }

  if (key === "Escape") {
    return {
      highlightedInstrumentId: currentHighlightedInstrumentId,
      instrumentSearch: selectedInstrumentLabel,
      isInstrumentComboboxOpen: false,
      preventDefault: false,
      selectedInstrument: null,
    };
  }

  if (opensCombobox) {
    return {
      highlightedInstrumentId: currentHighlightedInstrumentId,
      isInstrumentComboboxOpen: nextIsInstrumentComboboxOpen,
      preventDefault: false,
      selectedInstrument: null,
    };
  }

  return null;
}
