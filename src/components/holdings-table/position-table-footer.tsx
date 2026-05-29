"use client";

import {
  formatHoldingPercent,
  formatSummaryMoney,
  getPnlToneClass,
} from "@/components/holdings-table/display-helpers";
import type { HoldingsSummary } from "@/components/holdings-table/table-helpers";
import type { getUiCopy } from "@/lib/ui/copy";

type HoldingsPositionTableFooterProps = {
  copy: ReturnType<typeof getUiCopy>;
  locale: string;
  visibleCount: number;
  visibleSummary: HoldingsSummary;
  visibleSummaryCurrency: string | null;
};

export function HoldingsPositionTableFooter({
  copy,
  locale,
  visibleCount,
  visibleSummary,
  visibleSummaryCurrency,
}: HoldingsPositionTableFooterProps) {
  return (
    <tfoot>
      <tr>
        <th scope="row">{copy.holdings.table.shownTotal}</th>
        <td className="table-number">{copy.shared.positionCount(visibleCount)}</td>
        <td />
        <td className="table-number">
          {formatSummaryMoney(
            visibleSummary.totalCost,
            visibleSummaryCurrency,
            locale,
            copy.shared.mixed,
          )}
        </td>
        <td />
        <td className="table-number">
          {formatSummaryMoney(
            visibleSummary.marketValue,
            visibleSummaryCurrency,
            locale,
            copy.shared.mixed,
          )}
        </td>
        <td className="table-number">
          <span className={getPnlToneClass(visibleSummary.oneDayGain)}>
            {formatSummaryMoney(
              visibleSummary.oneDayGain,
              visibleSummaryCurrency,
              locale,
              copy.shared.mixed,
            )}
          </span>
        </td>
        <td className="table-number">
          <span className={getPnlToneClass(visibleSummary.unrealizedPnl)}>
            {formatSummaryMoney(
              visibleSummary.unrealizedPnl,
              visibleSummaryCurrency,
              locale,
              copy.shared.mixed,
            )}
          </span>
        </td>
        <td className="table-number">
          {formatHoldingPercent(visibleSummary.portfolioWeight, locale, copy.holdings.table.noData)}
        </td>
        <td />
      </tr>
    </tfoot>
  );
}
