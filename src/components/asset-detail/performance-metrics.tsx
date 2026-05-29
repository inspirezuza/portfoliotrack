import { formatCurrency } from "@/lib/format";
import { formatOptionalMoney } from "@/components/asset-detail/format";
import type { AssetDetail } from "@/server/assets";

type AssetPerformanceMetricsProps = {
  asset: AssetDetail;
};

export function AssetPerformanceMetrics({ asset }: AssetPerformanceMetricsProps) {
  return (
    <div className="asset-performance-grid">
      <article className="metric-card">
        <p className="metric-label">Last price</p>
        <p className="metric-value">
          {asset.marketData.lastPrice == null
            ? "Waiting"
            : formatCurrency(asset.marketData.lastPrice, {
                currency: asset.instrument.currency,
                maximumFractionDigits: 4,
              })}
        </p>
      </article>
      <article className="metric-card">
        <p className="metric-label">Average cost</p>
        <p className="metric-value">
          {formatOptionalMoney(
            asset.position.averageCost,
            asset.instrument.currency,
            "No position",
          )}
        </p>
      </article>
      <article className="metric-card">
        <p className="metric-label">Total cost</p>
        <p className="metric-value">
          {formatOptionalMoney(asset.position.totalCost, asset.instrument.currency, "No position")}
        </p>
      </article>
      <article className="metric-card">
        <p className="metric-label">Realized P&amp;L</p>
        <p
          className={`metric-value${
            asset.position.realizedPnl > 0
              ? " value-positive"
              : asset.position.realizedPnl < 0
                ? " value-negative"
                : ""
          }`}
        >
          {formatCurrency(asset.position.realizedPnl, { currency: asset.instrument.currency })}
        </p>
      </article>
      <article className="metric-card">
        <p className="metric-label">Total fees</p>
        <p className="metric-value">
          {formatCurrency(asset.position.totalFees, { currency: asset.instrument.currency })}
        </p>
      </article>
    </div>
  );
}
