"use client";

import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { SortState, TransactionSortKey } from "@/components/transaction-table/table-helpers";

type SortableHeaderProps = {
  align?: "left" | "right";
  language: UiLanguage;
  label: string;
  sortKey: TransactionSortKey;
  sort: SortState;
  onSort: (key: TransactionSortKey) => void;
};

export function SortableHeader({
  align = "left",
  language,
  label,
  sortKey,
  sort,
  onSort,
}: SortableHeaderProps) {
  const isActive = sort.key === sortKey;
  const copy = getUiCopy(language).shared;
  const nextDirection =
    isActive && sort.direction === "asc" ? copy.sortDescending : copy.sortAscending;

  return (
    <th
      scope="col"
      className={align === "right" ? "table-heading-number" : undefined}
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="table-sort-button"
        data-sort-state={isActive ? sort.direction : "none"}
        onClick={() => onSort(sortKey)}
        aria-label={copy.sortLabel(label, nextDirection)}
      >
        <span className="table-sort-label">{label}</span>
        <span className="table-sort-icon" aria-hidden="true" />
      </button>
    </th>
  );
}
