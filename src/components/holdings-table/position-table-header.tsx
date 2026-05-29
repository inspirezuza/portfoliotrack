"use client";

import { SortableHeader } from "@/components/holdings-table/sortable-header";
import {
  getPerformanceColumnLabel,
  type HoldingSortKey,
  type PerformanceBasis,
  type SortState,
} from "@/components/holdings-table/table-helpers";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { HoldingPerformanceTimeframe } from "@/server/holdings";

type HoldingsPositionTableHeaderProps = {
  copy: ReturnType<typeof getUiCopy>;
  language: UiLanguage;
  onSort: (sortKey: HoldingSortKey) => void;
  performanceBasis: PerformanceBasis;
  performanceTimeframe: HoldingPerformanceTimeframe;
  sort: SortState;
};

export function HoldingsPositionTableHeader({
  copy,
  language,
  onSort,
  performanceBasis,
  performanceTimeframe,
  sort,
}: HoldingsPositionTableHeaderProps) {
  return (
    <thead>
      <tr>
        <SortableHeader
          label={copy.holdings.table.columns.symbol}
          language={language}
          sortKey="symbol"
          sort={sort}
          onSort={onSort}
        />
        <SortableHeader
          label={copy.holdings.table.columns.quantity}
          language={language}
          sortKey="quantity"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.averageCost}
          language={language}
          sortKey="averageCost"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.totalCost}
          language={language}
          sortKey="totalCost"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.lastPrice}
          language={language}
          sortKey="lastPrice"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.marketValue}
          language={language}
          sortKey="marketValue"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={getPerformanceColumnLabel({
            basis: performanceBasis,
            copy,
            timeframe: performanceTimeframe,
          })}
          language={language}
          sortKey="oneDayGain"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.unrealizedPnl}
          language={language}
          sortKey="unrealizedPnl"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <SortableHeader
          label={copy.holdings.table.columns.weight}
          language={language}
          sortKey="portfolioWeight"
          sort={sort}
          onSort={onSort}
          align="right"
        />
        <th scope="col" className="holdings-expand-heading">
          <span className="sr-only">{copy.holdings.table.lots.expandColumn}</span>
        </th>
      </tr>
    </thead>
  );
}
