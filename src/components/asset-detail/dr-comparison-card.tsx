import { formatCurrency, formatQuantity } from "@/lib/format";
import { formatOptionalMoney, formatOptionalPercent } from "@/components/asset-detail/format";
import type { AssetDetail } from "@/server/assets";

type AssetDrComparisonCardProps = {
  asset: AssetDetail;
};

export function AssetDrComparisonCard({ asset }: AssetDrComparisonCardProps) {
  if (asset.dr == null) {
    return null;
  }

  const { dr } = asset;

  return (
    <article className="surface-card">
      <div className="chart-card-header">
        <div>
          <p className="panel-title">DR parent comparison</p>
          <h2 className="section-title">
            {dr.underlyingSymbol
              ? `${asset.instrument.symbol} implied ${dr.underlyingSymbol} price`
              : "Parent-share equivalent price"}
          </h2>
        </div>
      </div>

      <div className="asset-performance-grid">
        <article className="metric-card">
          <p className="metric-label">Implied parent price</p>
          <p className="metric-value">
            {dr.impliedParentPrice == null || dr.underlyingCurrency == null
              ? "Not available"
              : formatCurrency(dr.impliedParentPrice, {
                  currency: dr.underlyingCurrency,
                })}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Average parent-equivalent cost</p>
          <p className="metric-value">
            {dr.averageImpliedParentCost == null || dr.underlyingCurrency == null
              ? "Not available"
              : formatCurrency(dr.averageImpliedParentCost, {
                  currency: dr.underlyingCurrency,
                })}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Premium/discount</p>
          <p
            className={`metric-value${
              dr.premiumDiscount == null
                ? ""
                : dr.premiumDiscount < 0
                  ? " value-positive"
                  : dr.premiumDiscount > 0
                    ? " value-negative"
                    : ""
            }`}
          >
            {formatOptionalPercent(dr.premiumDiscount)}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Parent market price</p>
          <p className="metric-value">
            {dr.parentMarketPrice == null || dr.underlyingCurrency == null
              ? "Waiting"
              : formatCurrency(dr.parentMarketPrice, {
                  currency: dr.underlyingCurrency,
                })}
          </p>
        </article>
      </div>

      <div className="dr-formula-grid">
        <div className="dr-step">
          <span className="route-caption">DR price</span>
          <strong>
            {formatOptionalMoney(asset.marketData.lastPrice, asset.instrument.currency, "Waiting")}
          </strong>
        </div>
        <div className="dr-step">
          <span className="route-caption">x DR per parent share</span>
          <strong>{dr.drRatio == null ? "Not set" : formatQuantity(dr.drRatio)}</strong>
        </div>
        <div className="dr-step">
          <span className="route-caption">÷ FX</span>
          <strong>{dr.fxRate == null ? "Waiting for FX" : formatQuantity(dr.fxRate)}</strong>
        </div>
        <div className="dr-step">
          <span className="route-caption">= implied parent</span>
          <strong>
            {dr.impliedParentPrice == null || dr.underlyingCurrency == null
              ? "Not available"
              : formatCurrency(dr.impliedParentPrice, {
                  currency: dr.underlyingCurrency,
                })}
          </strong>
        </div>
      </div>
    </article>
  );
}
