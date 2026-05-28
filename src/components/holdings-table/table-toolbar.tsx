import {
  getPricePerformanceTimeframeLabel,
  PERFORMANCE_TIMEFRAMES,
  type HoldingFilter,
  type PerformanceBasis,
} from "@/components/holdings-table/table-helpers";
import type { getUiCopy } from "@/lib/ui/copy";
import type { HoldingPerformanceTimeframe } from "@/server/holdings";

type HoldingsCopy = ReturnType<typeof getUiCopy>;

type HoldingsTableToolbarProps = {
  copy: HoldingsCopy;
  filter: HoldingFilter;
  onFilterChange: (filter: HoldingFilter) => void;
  onPerformanceBasisChange: (basis: PerformanceBasis) => void;
  onPerformanceTimeframeChange: (timeframe: HoldingPerformanceTimeframe) => void;
  onSearchQueryChange: (query: string) => void;
  performanceBasis: PerformanceBasis;
  performanceTimeframe: HoldingPerformanceTimeframe;
  searchQuery: string;
};

export function HoldingsTableToolbar({
  copy,
  filter,
  onFilterChange,
  onPerformanceBasisChange,
  onPerformanceTimeframeChange,
  performanceBasis,
  performanceTimeframe,
  onSearchQueryChange,
  searchQuery,
}: HoldingsTableToolbarProps) {
  const filterOptions: Array<{ value: HoldingFilter; label: string }> = [
    { value: "all", label: copy.holdings.table.filter.all },
    { value: "gain", label: copy.holdings.table.filter.gain },
    { value: "loss", label: copy.holdings.table.filter.loss },
    { value: "missing", label: copy.holdings.table.filter.missing },
  ];

  return (
    <div className="table-toolbar" aria-label={copy.holdings.table.toolsLabel}>
      <label className="table-search">
        <span>{copy.shared.search}</span>
        <input
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={copy.holdings.table.searchPlaceholder}
          type="search"
          value={searchQuery}
        />
      </label>
      <div className="table-toolbar-controls holdings-performance-controls">
        <div className="holdings-performance-cluster">
          <div
            className="table-filter-group holdings-basis-group"
            aria-label={copy.holdings.table.performanceBasisLabel}
          >
            <button
              type="button"
              className="table-filter-button holdings-basis-button"
              aria-pressed={performanceBasis === "price"}
              onClick={() => onPerformanceBasisChange("price")}
            >
              {copy.holdings.table.performanceBasis.price}
            </button>
            <button
              type="button"
              className="table-filter-button holdings-basis-button"
              aria-pressed={performanceBasis === "cost"}
              onClick={() => onPerformanceBasisChange("cost")}
            >
              {copy.holdings.table.performanceBasis.cost}
            </button>
          </div>
          <div
            className="table-filter-group holdings-timeframe-group"
            aria-label={copy.holdings.table.performanceTimeframesLabel}
          >
            {PERFORMANCE_TIMEFRAMES.map((timeframe) => (
              <button
                key={timeframe}
                type="button"
                className="table-filter-button holdings-timeframe-button"
                aria-pressed={performanceTimeframe === timeframe}
                onClick={() => onPerformanceTimeframeChange(timeframe)}
              >
                {getPricePerformanceTimeframeLabel(copy, timeframe)}
              </button>
            ))}
          </div>
        </div>
        <div className="table-filter-group" aria-label={copy.holdings.table.filtersLabel}>
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="table-filter-button"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
