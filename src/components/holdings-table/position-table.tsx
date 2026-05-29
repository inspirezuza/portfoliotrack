"use client";

import { Fragment } from "react";
import { HoldingsPositionTableFooter } from "@/components/holdings-table/position-table-footer";
import { HoldingsPositionTableHeader } from "@/components/holdings-table/position-table-header";
import { HoldingsPositionRow } from "@/components/holdings-table/position-table-row";
import {
  type HoldingSortKey,
  type HoldingsSummary,
  type PerformanceBasis,
  type SortState,
} from "@/components/holdings-table/table-helpers";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type {
  HoldingLot,
  HoldingPerformanceKey,
  HoldingPerformanceTimeframe,
  HoldingRow,
} from "@/server/holdings";

type HoldingsPositionTableProps = {
  canEdit: boolean;
  copy: ReturnType<typeof getUiCopy>;
  deletingTransactionId: number | null;
  expandedHoldingIds: Set<number>;
  language: UiLanguage;
  locale: string;
  onDeleteHoldingLot: (holding: HoldingRow, lot: HoldingLot) => void;
  onEditHoldingLot: (holding: HoldingRow, lot: HoldingLot) => void;
  onOpenHoldingDetail: (symbol: string) => void;
  onSort: (sortKey: HoldingSortKey) => void;
  onToggleHoldingLots: (instrumentId: number) => void;
  performanceBasis: PerformanceBasis;
  performanceTimeframe: HoldingPerformanceTimeframe;
  selectedPerformanceKey: HoldingPerformanceKey;
  sort: SortState;
  visibleHoldings: HoldingRow[];
  visibleSummary: HoldingsSummary;
  visibleSummaryCurrency: string | null;
};

export function HoldingsPositionTable({
  canEdit,
  copy,
  deletingTransactionId,
  expandedHoldingIds,
  language,
  locale,
  onDeleteHoldingLot,
  onEditHoldingLot,
  onOpenHoldingDetail,
  onSort,
  onToggleHoldingLots,
  performanceBasis,
  performanceTimeframe,
  selectedPerformanceKey,
  sort,
  visibleHoldings,
  visibleSummary,
  visibleSummaryCurrency,
}: HoldingsPositionTableProps) {
  return (
    <div className="transaction-table-wrap">
      <table className="transaction-table holdings-table">
        <colgroup>
          <col className="holdings-col-symbol" />
          <col className="holdings-col-quantity" />
          <col className="holdings-col-average" />
          <col className="holdings-col-total" />
          <col className="holdings-col-price" />
          <col className="holdings-col-market" />
          <col className="holdings-col-pnl" />
          <col className="holdings-col-pnl" />
          <col className="holdings-col-weight" />
          <col className="holdings-col-expand" />
        </colgroup>
        <HoldingsPositionTableHeader
          copy={copy}
          language={language}
          onSort={onSort}
          performanceBasis={performanceBasis}
          performanceTimeframe={performanceTimeframe}
          sort={sort}
        />
        <tbody>
          {visibleHoldings.length === 0 ? (
            <tr>
              <td colSpan={10} className="table-empty-cell">
                {copy.holdings.table.noMatches}
              </td>
            </tr>
          ) : (
            visibleHoldings.map((holding) => (
              <Fragment key={holding.instrumentId}>
                <HoldingsPositionRow
                  canEdit={canEdit}
                  copy={copy}
                  deletingTransactionId={deletingTransactionId}
                  holding={holding}
                  isExpanded={expandedHoldingIds.has(holding.instrumentId)}
                  language={language}
                  locale={locale}
                  onDeleteHoldingLot={onDeleteHoldingLot}
                  onEditHoldingLot={onEditHoldingLot}
                  onOpenHoldingDetail={onOpenHoldingDetail}
                  onToggleHoldingLots={onToggleHoldingLots}
                  selectedPerformanceKey={selectedPerformanceKey}
                />
              </Fragment>
            ))
          )}
        </tbody>
        {visibleHoldings.length > 0 ? (
          <HoldingsPositionTableFooter
            copy={copy}
            locale={locale}
            visibleCount={visibleHoldings.length}
            visibleSummary={visibleSummary}
            visibleSummaryCurrency={visibleSummaryCurrency}
          />
        ) : null}
      </table>
    </div>
  );
}
