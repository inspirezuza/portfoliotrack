import Link from "next/link";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import type { HoldingRow } from "@/server/holdings";

type HoldingsTableProps = {
  holdings: HoldingRow[];
};

function formatHoldingPrice(value: number | null, currency: string) {
  if (value == null) {
    return <span className="data-pending">ยังไม่มีราคา</span>;
  }

  return formatCurrency(value, {
    currency,
    maximumFractionDigits: 4
  });
}

function formatHoldingMoney(value: number | null, currency: string, emptyLabel = "รอราคา") {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatCurrency(value, { currency });
}

function formatHoldingPercent(value: number | null, emptyLabel = "รอราคา") {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatPercentRatio(value);
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  return (
    <article className="surface-card holdings-table-card">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">ถือครอง</p>
          <h2 className="section-title">สถานะปัจจุบัน</h2>
        </div>
        <p className="surface-copy">
          สร้างจากรายการซื้อขายที่บันทึกไว้ และเติมราคาในแคชเฉพาะเมื่อมีข้อมูลจริง
        </p>
      </div>

      {holdings.length === 0 ? (
        <div className="transaction-empty-state">
          <p>ยังไม่มีสถานะเปิด เพิ่มรายการซื้อ แล้วตารางถือครองจะแสดงข้อมูลที่นี่</p>
        </div>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table holdings-table">
            <thead>
              <tr>
                <th scope="col">สัญลักษณ์</th>
                <th scope="col">จำนวน</th>
                <th scope="col">ต้นทุนเฉลี่ย</th>
                <th scope="col">ต้นทุนรวม</th>
                <th scope="col">ราคาล่าสุด</th>
                <th scope="col">มูลค่าตลาด</th>
                <th scope="col">Unrealized P&amp;L</th>
                <th scope="col">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.instrumentId}>
                  <td>
                    <div className="instrument-cell">
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
                  </td>
                  <td>{formatQuantity(holding.quantity)}</td>
                  <td>
                    {formatCurrency(holding.averageCost, {
                      currency: holding.currency,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td>{formatCurrency(holding.totalCost, { currency: holding.currency })}</td>
                  <td>
                    <div className="holdings-value-stack">
                      <span>{formatHoldingPrice(holding.lastPrice, holding.currency)}</span>
                      {holding.lastPriceAsOf ? (
                        <span className="table-subtext">ณ {holding.lastPriceAsOf}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{formatHoldingMoney(holding.marketValue, holding.currency)}</td>
                  <td>
                    <div className="holdings-value-stack">
                      <span
                        className={
                          holding.unrealizedPnl == null
                            ? undefined
                            : holding.unrealizedPnl > 0
                              ? "value-positive"
                              : holding.unrealizedPnl < 0
                                ? "value-negative"
                                : undefined
                        }
                      >
                        {formatHoldingMoney(holding.unrealizedPnl, holding.currency)}
                      </span>
                      <span className="table-subtext">
                        {formatHoldingPercent(holding.unrealizedPnlPercent)}
                      </span>
                    </div>
                  </td>
                  <td>{formatHoldingPercent(holding.portfolioWeight, "ยังไม่มีข้อมูล")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
