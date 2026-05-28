import { formatCurrency, formatQuantity } from "@/lib/format";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { HoldingLot, HoldingRow } from "@/server/holdings";
import {
  formatBroker,
  formatHoldingLotMoney,
  formatSignedHoldingPercent,
  getPnlToneClass,
} from "@/components/holdings-table/display-helpers";

type HoldingLotsPanelProps = {
  canEdit: boolean;
  deletingTransactionId: number | null;
  holding: HoldingRow;
  id: string;
  language: UiLanguage;
  lots: HoldingLot[];
  onDelete: (holding: HoldingRow, lot: HoldingLot) => void;
  onEdit: (holding: HoldingRow, lot: HoldingLot) => void;
};

export function HoldingLotsPanel({
  canEdit,
  deletingTransactionId,
  holding,
  id,
  language,
  lots,
  onDelete,
  onEdit,
}: HoldingLotsPanelProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);

  return (
    <div id={id} className="holdings-lot-panel">
      {lots.length === 0 ? (
        <p className="table-empty-cell">{copy.holdings.table.lots.noOpenLots}</p>
      ) : (
        <table className="holdings-lot-table">
          <colgroup>
            <col className="holdings-lot-col-date" />
            <col className="holdings-lot-col-price" />
            <col className="holdings-lot-col-quantity" />
            <col className="holdings-lot-col-gain" />
            <col className="holdings-lot-col-value" />
            {canEdit ? <col className="holdings-lot-col-actions" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{copy.holdings.table.lots.columns.date}</th>
              <th scope="col" className="table-heading-number">
                {copy.holdings.table.lots.columns.price}
              </th>
              <th scope="col" className="table-heading-number">
                {copy.holdings.table.lots.columns.quantity}
              </th>
              <th scope="col" className="table-heading-number">
                {copy.holdings.table.lots.columns.gain}
              </th>
              <th scope="col" className="table-heading-number">
                {copy.holdings.table.lots.columns.value}
              </th>
              {canEdit ? (
                <th scope="col" className="holdings-lot-actions-heading">
                  {copy.transactions.table.columns.actions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const gainTone = getPnlToneClass(lot.totalGainInValuationCurrency ?? lot.totalGain);
              const isDeleting = deletingTransactionId === lot.transactionId;

              return (
                <tr key={lot.transactionId}>
                  <td>
                    <div className="holdings-lot-cell-stack">
                      <strong>{lot.tradeDate}</strong>
                      <span>
                        {lot.portfolioName == null
                          ? formatBroker(lot.broker)
                          : `${lot.portfolioName} / ${formatBroker(lot.broker)}`}
                      </span>
                    </div>
                  </td>
                  <td className="table-number">
                    <div className="holdings-value-stack">
                      {formatCurrency(lot.price, {
                        currency: holding.currency,
                        locale,
                        maximumFractionDigits: 4,
                      })}
                      <span className="table-subtext">
                        {copy.holdings.table.lots.fee(
                          formatCurrency(lot.fee, { currency: holding.currency, locale }),
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="table-number">
                    <div className="holdings-value-stack">
                      <span>{formatQuantity(lot.remainingQuantity, { locale })}</span>
                      {lot.remainingQuantity === lot.originalQuantity ? null : (
                        <span className="table-subtext">
                          {copy.holdings.table.lots.originalQuantity(
                            formatQuantity(lot.originalQuantity, { locale }),
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-number">
                    <div className="holdings-value-stack">
                      <span className={gainTone}>
                        {formatHoldingLotMoney({
                          emptyLabel: copy.shared.waiting,
                          holding,
                          locale,
                          nativeValue: lot.totalGain,
                          valuationValue: lot.totalGainInValuationCurrency,
                        })}
                      </span>
                      <span className={`holdings-pnl-percent ${gainTone ?? ""}`.trim()}>
                        {formatSignedHoldingPercent(
                          lot.totalGainPercent,
                          locale,
                          copy.shared.waiting,
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="table-number">
                    <div className="holdings-value-stack">
                      {formatHoldingLotMoney({
                        emptyLabel: copy.shared.waiting,
                        holding,
                        locale,
                        nativeValue: lot.marketValue,
                        valuationValue: lot.marketValueInValuationCurrency,
                      })}
                      <span className="table-subtext">
                        {copy.holdings.table.lots.costLabel}{" "}
                        {formatHoldingLotMoney({
                          emptyLabel: copy.shared.waiting,
                          holding,
                          locale,
                          nativeValue: lot.costBasis,
                          valuationValue: lot.costBasisInValuationCurrency,
                        })}
                      </span>
                    </div>
                  </td>
                  {canEdit ? (
                    <td>
                      <div className="table-actions table-actions-icon" data-row-toggle-ignore>
                        <button
                          type="button"
                          className="table-icon-button"
                          aria-label={`${copy.transactions.table.edit} ${holding.symbol} ${lot.tradeDate}`}
                          title={copy.transactions.table.edit}
                          onClick={() => onEdit(holding, lot)}
                          disabled={deletingTransactionId != null}
                        >
                          <span className="table-icon table-icon-edit" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="table-icon-button table-icon-button-danger"
                          aria-label={`${copy.transactions.table.delete} ${holding.symbol} ${lot.tradeDate}`}
                          title={copy.transactions.table.delete}
                          onClick={() => onDelete(holding, lot)}
                          disabled={deletingTransactionId != null}
                        >
                          {isDeleting ? (
                            <span className="table-icon-spinner" aria-hidden="true" />
                          ) : (
                            <span className="table-icon table-icon-delete" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
