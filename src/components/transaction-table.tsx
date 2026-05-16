import { formatCurrency, formatQuantity } from "@/lib/format";
import type { TransactionListItem } from "@/server/transactions";

type TransactionTableProps = {
  transactions: TransactionListItem[];
};

export function TransactionTable({ transactions }: TransactionTableProps) {
  return (
    <article className="surface-card transaction-table-card">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">Ledger</p>
          <h2 className="section-title">Latest transactions</h2>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No transactions yet. The first recorded trade will appear here immediately.</p>
        </div>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Instrument</th>
                <th scope="col">Side</th>
                <th scope="col">Quantity</th>
                <th scope="col">Price</th>
                <th scope="col">Fee</th>
                <th scope="col">Net</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.tradeDate}</td>
                  <td>
                    <div className="instrument-cell">
                      <strong>{transaction.instrument.symbol}</strong>
                      <span>
                        {transaction.instrument.displayName} - {transaction.instrument.market}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`side-pill ${
                        transaction.side === "BUY" ? "side-pill-buy" : "side-pill-sell"
                      }`}
                    >
                      {transaction.side}
                    </span>
                  </td>
                  <td>{formatQuantity(transaction.quantity)}</td>
                  <td>
                    {formatCurrency(transaction.price, {
                      currency: transaction.instrument.currency,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td>{formatCurrency(transaction.fee, { currency: transaction.instrument.currency })}</td>
                  <td>{formatCurrency(transaction.netAmount, { currency: transaction.instrument.currency })}</td>
                  <td>{transaction.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
