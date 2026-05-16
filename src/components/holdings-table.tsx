import Link from "next/link";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import type { HoldingRow } from "@/server/holdings";

type HoldingsTableProps = {
  holdings: HoldingRow[];
};

function formatHoldingPrice(value: number | null, currency: string) {
  if (value == null) {
    return <span className="data-pending">Price unavailable</span>;
  }

  return formatCurrency(value, {
    currency,
    maximumFractionDigits: 4
  });
}

function formatHoldingMoney(value: number | null, currency: string, emptyLabel = "Awaiting price") {
  if (value == null) {
    return <span className="data-pending">{emptyLabel}</span>;
  }

  return formatCurrency(value, { currency });
}

function formatHoldingPercent(value: number | null, emptyLabel = "Awaiting price") {
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
          <p className="eyebrow">Holdings</p>
          <h2 className="section-title">Current positions</h2>
        </div>
        <p className="surface-copy">
          Built directly from recorded transactions with cached prices layered on only when they
          exist.
        </p>
      </div>

      {holdings.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No open positions yet. Add a buy transaction and the holdings table will populate.</p>
        </div>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table holdings-table">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Quantity</th>
                <th scope="col">Average cost</th>
                <th scope="col">Cost basis</th>
                <th scope="col">Last price</th>
                <th scope="col">Market value</th>
                <th scope="col">Unrealized P&amp;L</th>
                <th scope="col">Weight</th>
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
                        <span className="table-subtext">As of {holding.lastPriceAsOf}</span>
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
                  <td>{formatHoldingPercent(holding.portfolioWeight, "Unavailable")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
