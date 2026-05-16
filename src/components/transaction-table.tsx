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
          <p className="eyebrow">Ledger รายการ</p>
          <h2 className="section-title">รายการล่าสุด</h2>
        </div>
        <p className="surface-copy">
          เรียงตามวันที่ซื้อขายและเวลาที่บันทึก พร้อมมูลค่าสุทธิที่รวมค่าธรรมเนียมแล้ว
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>ยังไม่มีรายการซื้อขาย รายการแรกที่บันทึกจะแสดงที่นี่ทันที</p>
        </div>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table">
            <thead>
              <tr>
                <th scope="col">วันที่</th>
                <th scope="col">สินทรัพย์</th>
                <th scope="col">ประเภท</th>
                <th scope="col">จำนวน</th>
                <th scope="col">ราคา</th>
                <th scope="col">ค่าธรรมเนียม</th>
                <th scope="col">สุทธิ</th>
                <th scope="col">หมายเหตุ</th>
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
                      {transaction.side === "BUY" ? "ซื้อ" : "ขาย"}
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
