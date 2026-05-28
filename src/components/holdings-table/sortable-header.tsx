import { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { HoldingSortKey, SortState } from "@/components/holdings-table/table-helpers";

type SortableHeaderProps = {
  align?: "left" | "right";
  label: string;
  language: UiLanguage;
  onSort: (key: HoldingSortKey) => void;
  sort: SortState;
  sortKey: HoldingSortKey;
};

export function SortableHeader({
  align = "left",
  label,
  language,
  onSort,
  sort,
  sortKey,
}: SortableHeaderProps) {
  const copy = getUiCopy(language).shared;
  const isActive = sort.key === sortKey;
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
