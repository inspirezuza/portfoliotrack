import { formatCurrency, formatQuantity } from "@/lib/format";
import type { AssetDetail } from "@/server/assets";

type AssetTransactionHistoryProps = {
  asset: AssetDetail;
};

export function AssetTransactionHistory({ asset }: AssetTransactionHistoryProps) {
  const recentTransactions = [...asset.transactions].reverse().slice(0, 5);

  return (
    <article className="surface-card">
      <div className="transaction-panel-header">
        <div>
          <p className="panel-title">Asset transaction history</p>
        </div>
      </div>

      {recentTransactions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No transactions for this asset yet.</p>
        </div>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table asset-transaction-table">
            <colgroup>
              <col className="asset-transaction-col-date" />
              <col className="asset-transaction-col-side" />
              <col className="asset-transaction-col-quantity" />
              <col className="asset-transaction-col-price" />
              <col className="asset-transaction-col-fee" />
              <col className="asset-transaction-col-notes" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Side</th>
                <th scope="col" className="table-heading-number">
                  Quantity
                </th>
                <th scope="col" className="table-heading-number">
                  Price
                </th>
                <th scope="col" className="table-heading-number">
                  Fee
                </th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.tradeDate}</td>
                  <td>
                    <span
                      className={`side-pill ${
                        transaction.side === "BUY" ? "side-pill-buy" : "side-pill-sell"
                      }`}
                    >
                      {transaction.side}
                    </span>
                  </td>
                  <td className="table-number">{formatQuantity(transaction.quantity)}</td>
                  <td className="table-number">
                    {formatCurrency(transaction.price, {
                      currency: asset.instrument.currency,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="table-number">
                    {formatCurrency(transaction.fee, { currency: asset.instrument.currency })}
                  </td>
                  <td className="table-notes">{transaction.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
