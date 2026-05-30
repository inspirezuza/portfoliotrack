"use client";

import Link from "next/link";
import { memo, type CSSProperties, type MouseEvent } from "react";
import { InstrumentLogo } from "@/components/instrument-logo";
import {
  formatHoldingDateTime,
  formatHoldingPercent,
  formatHoldingValuationMoney,
  formatParentMoney,
  formatSignedHoldingPercent,
  formatValuationMoneyText,
  getPnlToneClass,
  isNativeCurrencyVisible,
} from "@/components/holdings-table/display-helpers";
import { HoldingLotsPanel } from "@/components/holdings-table/holding-lots-panel";
import {
  getHoldingPerformance,
  getValuationAverageCost,
  getValuationLastPrice,
} from "@/components/holdings-table/table-helpers";
import { formatQuantity } from "@/lib/format";
import type { getUiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { HoldingLot, HoldingPerformanceKey, HoldingRow } from "@/server/holdings";

type HoldingsPositionRowProps = {
  canEdit: boolean;
  copy: ReturnType<typeof getUiCopy>;
  deletingTransactionId: number | null;
  holding: HoldingRow;
  isExpanded: boolean;
  language: UiLanguage;
  locale: string;
  onDeleteHoldingLot: (holding: HoldingRow, lot: HoldingLot) => void;
  onEditHoldingLot: (holding: HoldingRow, lot: HoldingLot) => void;
  onOpenHoldingDetail: (symbol: string) => void;
  onToggleHoldingLots: (instrumentId: number) => void;
  selectedPerformanceKey: HoldingPerformanceKey;
};

function shouldIgnoreHoldingRowToggle(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target;

  return target instanceof HTMLElement
    ? target.closest("a, button, input, select, textarea, [data-row-toggle-ignore]") != null
    : false;
}

function HoldingsPositionRowComponent({
  canEdit,
  copy,
  deletingTransactionId,
  holding,
  isExpanded,
  language,
  locale,
  onDeleteHoldingLot,
  onEditHoldingLot,
  onOpenHoldingDetail,
  onToggleHoldingLots,
  selectedPerformanceKey,
}: HoldingsPositionRowProps) {
  const selectedPerformance = getHoldingPerformance(holding, selectedPerformanceKey);
  const lotsId = `holding-lots-${holding.instrumentId}`;

  return (
    <>
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
                <Link href={`/assets/${encodeURIComponent(holding.symbol)}`} className="route-link">
                  {holding.symbol}
                </Link>
              </strong>
              <span>
                {holding.displayName} - {holding.market}
              </span>
            </div>
            <button
              type="button"
              className="table-icon-button holdings-detail-button"
              data-row-toggle-ignore
              aria-label={copy.holdings.table.detail.open(holding.symbol)}
              title={copy.holdings.table.detail.title}
              onClick={(event) => {
                event.stopPropagation();
                onOpenHoldingDetail(holding.symbol);
              }}
            >
              <span className="table-icon table-icon-search" aria-hidden="true" />
            </button>
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
            {formatParentMoney(holding.parentAverageCost, holding.underlyingCurrency, locale) ==
            null ? null : (
              <span className="table-subtext dr-parent-metric">
                {holding.underlyingSymbol ?? "Parent"} avg{" "}
                {formatParentMoney(holding.parentAverageCost, holding.underlyingCurrency, locale)}
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
                {copy.holdings.table.asOf(formatHoldingDateTime(holding.lastPriceAsOf, locale))}
              </span>
            ) : null}
            {formatParentMoney(holding.parentLastPrice, holding.underlyingCurrency, locale) ==
            null ? null : (
              <span className="table-subtext dr-parent-metric">
                {holding.underlyingSymbol ?? "Parent"} last{" "}
                {formatParentMoney(holding.parentLastPrice, holding.underlyingCurrency, locale)}
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
              {formatSignedHoldingPercent(selectedPerformance.percent, locale, copy.shared.waiting)}
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
              {formatHoldingPercent(holding.portfolioWeight, locale, copy.holdings.table.noData)}
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
    </>
  );
}

// Memoized so re-sorting / searching the holdings table only re-renders rows
// whose own props changed rather than every row.
export const HoldingsPositionRow = memo(HoldingsPositionRowComponent);
