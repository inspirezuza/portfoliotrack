import { formatCurrency, formatQuantity } from "@/lib/format";
import { formatPriceAgeLabel, formatOptionalPercent } from "@/components/asset-detail/format";
import type { AssetDetail } from "@/server/assets";

type AssetDetailSidebarProps = {
  asset: AssetDetail;
};

export function AssetDetailSidebar({ asset }: AssetDetailSidebarProps) {
  return (
    <aside className="feature-stack">
      <article className="surface-card asset-sidebar-card">
        <p className="panel-title">Position data</p>
        <dl className="detail-list">
          <div>
            <dt>Quantity held</dt>
            <dd>
              {asset.position.hasOpenPosition
                ? formatQuantity(asset.position.quantity)
                : "No position"}
            </dd>
          </div>
          <div>
            <dt>Trade count</dt>
            <dd>{asset.position.tradeCount}</dd>
          </div>
          <div>
            <dt>First trade</dt>
            <dd>{asset.position.firstTradeDate ?? "No trades yet"}</dd>
          </div>
          <div>
            <dt>Latest trade</dt>
            <dd>{asset.position.lastTradeDate ?? "No trades yet"}</dd>
          </div>
          <div>
            <dt>Price updated</dt>
            <dd>{formatPriceAgeLabel(asset.marketData.priceAgeMinutes)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{asset.instrument.providerSymbol}</dd>
          </div>
        </dl>
      </article>

      {asset.dr ? (
        <article className="surface-card asset-sidebar-card">
          <p className="panel-title">DR metadata</p>
          <dl className="detail-list">
            <div>
              <dt>Underlying</dt>
              <dd>{asset.dr.underlyingSymbol ?? "Not set"}</dd>
            </div>
            <div>
              <dt>DR ratio</dt>
              <dd>
                {asset.dr.drRatio == null
                  ? "Not set"
                  : `${formatQuantity(asset.dr.drRatio)} DR = 1 ${
                      asset.dr.underlyingSymbol ?? "parent share"
                    }`}
              </dd>
            </div>
            <div>
              <dt>DR currency</dt>
              <dd>{asset.instrument.currency}</dd>
            </div>
            <div>
              <dt>Parent currency</dt>
              <dd>{asset.dr.underlyingCurrency ?? "Not set"}</dd>
            </div>
            <div>
              <dt>FX source</dt>
              <dd>{asset.dr.fxProviderSymbol ?? "Not set"}</dd>
            </div>
          </dl>
        </article>
      ) : null}

      <article className="surface-card asset-sidebar-card">
        <p className="insight-title">DR value check</p>
        {asset.dr ? (
          <dl className="detail-list">
            <div>
              <dt>Premium to parent share</dt>
              <dd>{formatOptionalPercent(asset.dr.premiumDiscount)}</dd>
            </div>
            <div>
              <dt>Parent-equivalent cost</dt>
              <dd>
                {asset.dr.averageImpliedParentCost == null || asset.dr.underlyingCurrency == null
                  ? "Not available"
                  : formatCurrency(asset.dr.averageImpliedParentCost, {
                      currency: asset.dr.underlyingCurrency,
                    })}
              </dd>
            </div>
            <div>
              <dt>Comparison state</dt>
              <dd>
                {asset.dr.parentMarketPrice == null || asset.dr.impliedParentPrice == null
                  ? "Waiting for data"
                  : "Ready"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="data-pending">Not a DR</p>
        )}
      </article>
    </aside>
  );
}
