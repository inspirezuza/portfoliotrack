"use client";

import Link from "next/link";
import { Fragment, type CSSProperties, type MouseEvent } from "react";
import { InstrumentLogo } from "@/components/instrument-logo";
import {
  formatHoldingDateTime,
  formatHoldingPercent,
  formatHoldingValuationMoney,
  formatParentMoney,
  formatSignedHoldingPercent,
  formatSummaryMoney,
  formatValuationMoneyText,
  getPnlToneClass,
  isNativeCurrencyVisible,
} from "@/components/holdings-table/display-helpers";
import { HoldingLotsPanel } from "@/components/holdings-table/holding-lots-panel";
import { SortableHeader } from "@/components/holdings-table/sortable-header";
import {
  getHoldingPerformance,
  getPerformanceColumnLabel,
  getValuationAverageCost,
  getValuationLastPrice,
  type HoldingSortKey,
  type HoldingsSummary,
  type PerformanceBasis,
  type SortState,
} from "@/components/holdings-table/table-helpers";
import { formatQuantity } from "@/lib/format";
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

function shouldIgnoreHoldingRowToggle(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;

  return target instanceof HTMLElement
    ? target.closest("a, button, input, select, textarea, [data-row-toggle-ignore]") != null
    : false;
}

export function HoldingsPositionTable({
  canEdit,
  copy,
  deletingTransactionId,
  expandedHoldingIds,
  language,
  locale,
  onDeleteHoldingLot,
  onEditHoldingLot,
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
        <tbody>
          {visibleHoldings.length === 0 ? (
            <tr>
              <td colSpan={10} className="table-empty-cell">
                {copy.holdings.table.noMatches}
              </td>
            </tr>
          ) : (
            visibleHoldings.map((holding) => {
              const selectedPerformance = getHoldingPerformance(holding, selectedPerformanceKey);
              const isExpanded = expandedHoldingIds.has(holding.instrumentId);
              const lotsId = `holding-lots-${holding.instrumentId}`;

              return (
                <Fragment key={holding.instrumentId}>
                  <tr
                    data-clickable="true"
                    data-expanded={isExpanded}
                    onClick={(event) => {
                      if (!shouldIgnoreHoldingRowToggle(event)) {
                        onToggleHoldingLots(holding.instrumentId);
                      }
                    }}
                  >
                    <td>
                      <div className="instrument-cell instrument-cell-with-logo">
                        <InstrumentLogo
                          symbol={holding.symbol}
                          displayName={holding.displayName}
                          instrumentType={holding.instrumentType}
                          providerSymbol={holding.providerSymbol}
                          underlyingProviderSymbol={holding.underlyingProviderSymbol}
                        />
                        <div className="instrument-cell-copy">
                          <strong>
                            <Link
                              href={`/assets/${encodeURIComponent(holding.symbol)}`}
                              className="route-link"
                            >
                              {holding.symbol}
                            </Link>
                          </strong>
                          <span>
                            {holding.displayName} - {holding.market}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="table-number">{formatQuantity(holding.quantity, { locale })}</td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        {formatHoldingValuationMoney({
                          emptyLabel: copy.shared.waiting,
                          holding,
                          locale,
                          maximumFractionDigits: 4,
                          nativeValue: holding.averageCost,
                          primaryValue: isNativeCurrencyVisible(holding)
                            ? getValuationAverageCost(holding)
                            : holding.averageCost,
                        })}
                        {formatParentMoney(
                          holding.parentAverageCost,
                          holding.underlyingCurrency,
                          locale,
                        ) == null ? null : (
                          <span className="table-subtext dr-parent-metric">
                            {holding.underlyingSymbol ?? "Parent"} avg{" "}
                            {formatParentMoney(
                              holding.parentAverageCost,
                              holding.underlyingCurrency,
                              locale,
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        {formatHoldingValuationMoney({
                          emptyLabel: copy.shared.waiting,
                          holding,
                          locale,
                          nativeValue: holding.totalCost,
                          primaryValue: holding.totalCostInValuationCurrency,
                        })}
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        {formatHoldingValuationMoney({
                          emptyLabel: copy.holdings.table.noPriceYet,
                          holding,
                          locale,
                          maximumFractionDigits: 4,
                          nativeValue: holding.lastPrice,
                          primaryValue: isNativeCurrencyVisible(holding)
                            ? getValuationLastPrice(holding)
                            : holding.lastPrice,
                        })}
                        {holding.lastPriceAsOf ? (
                          <span className="table-subtext">
                            {copy.holdings.table.asOf(
                              formatHoldingDateTime(holding.lastPriceAsOf, locale),
                            )}
                          </span>
                        ) : null}
                        {formatParentMoney(
                          holding.parentLastPrice,
                          holding.underlyingCurrency,
                          locale,
                        ) == null ? null : (
                          <span className="table-subtext dr-parent-metric">
                            {holding.underlyingSymbol ?? "Parent"} last{" "}
                            {formatParentMoney(
                              holding.parentLastPrice,
                              holding.underlyingCurrency,
                              locale,
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        {formatHoldingValuationMoney({
                          emptyLabel: copy.shared.waiting,
                          holding,
                          locale,
                          nativeValue: holding.marketValue,
                          primaryValue: holding.marketValueInValuationCurrency,
                        })}
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        <span
                          className={`holdings-pnl-percent ${getPnlToneClass(selectedPerformance.percent) ?? ""}`.trim()}
                        >
                          {formatSignedHoldingPercent(
                            selectedPerformance.percent,
                            locale,
                            copy.shared.waiting,
                          )}
                        </span>
                        <span
                          className={`table-subtext ${getPnlToneClass(selectedPerformance.amountInValuationCurrency) ?? ""}`.trim()}
                        >
                          {formatValuationMoneyText({
                            currency: holding.valuationCurrency,
                            locale,
                            value: selectedPerformance.amountInValuationCurrency,
                          }) ?? copy.shared.waiting}
                        </span>
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-value-stack">
                        <div className={getPnlToneClass(holding.unrealizedPnlInValuationCurrency)}>
                          {formatHoldingValuationMoney({
                            emptyLabel: copy.shared.waiting,
                            holding,
                            locale,
                            nativeValue: holding.unrealizedPnl,
                            primaryValue: holding.unrealizedPnlInValuationCurrency,
                          })}
                        </div>
                        <span
                          className={`holdings-pnl-percent ${getPnlToneClass(holding.unrealizedPnlPercent) ?? ""}`.trim()}
                        >
                          {formatSignedHoldingPercent(
                            holding.unrealizedPnlPercent,
                            locale,
                            copy.shared.waiting,
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="table-number">
                      <div className="holdings-weight-cell">
                        <span>
                          {formatHoldingPercent(
                            holding.portfolioWeight,
                            locale,
                            copy.holdings.table.noData,
                          )}
                        </span>
                        {holding.portfolioWeight == null ? null : (
                          <span
                            className="holdings-weight-bar"
                            style={
                              {
                                "--weight": `${Math.min(100, holding.portfolioWeight * 100)}%`,
                              } as CSSProperties
                            }
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </td>
                    <td className="holdings-expand-cell">
                      <button
                        type="button"
                        className="holdings-expand-button"
                        aria-controls={lotsId}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? copy.holdings.table.lots.collapse(holding.symbol)
                            : copy.holdings.table.lots.expand(holding.symbol)
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleHoldingLots(holding.instrumentId);
                        }}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="holdings-lot-row">
                      <td colSpan={10}>
                        <HoldingLotsPanel
                          holding={holding}
                          id={lotsId}
                          language={language}
                          canEdit={canEdit}
                          deletingTransactionId={deletingTransactionId}
                          lots={holding.lots}
                          onDelete={onDeleteHoldingLot}
                          onEdit={onEditHoldingLot}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
        {visibleHoldings.length > 0 ? (
          <tfoot>
            <tr>
              <th scope="row">{copy.holdings.table.shownTotal}</th>
              <td className="table-number">{copy.shared.positionCount(visibleHoldings.length)}</td>
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
                {formatHoldingPercent(
                  visibleSummary.portfolioWeight,
                  locale,
                  copy.holdings.table.noData,
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
