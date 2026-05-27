import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/asset-header";
import { DeferredAssetPriceChart } from "@/components/asset-deferred-widgets";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";
import { getAssetDetail } from "@/server/assets";

export const dynamic = "force-dynamic";

type AssetDetailPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

function formatPriceAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "No price age data";
  }

  if (minutes < 1) {
    return "Just updated";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}

function formatOptionalMoney(value: number | null, currency: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  return formatCurrency(value, { currency });
}

function formatOptionalPercent(value: number | null) {
  if (value == null) {
    return "Not available";
  }

  return formatPercentRatio(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
  const isAdmin = await isAdminAuthenticated();
  const { portfolios, selectedPortfolio } = await getPortfolioSelection();
  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const { symbol } = await params;
  const asset = await getAssetDetail(symbol, {
    ...(isAggregatePortfolio
      ? { portfolioIds: portfolios.map((portfolio) => portfolio.id) }
      : { portfolioId: selectedPortfolio.id }),
    allowMarketRefresh: isAdmin && !isAggregatePortfolio
  });

  if (asset == null) {
    notFound();
  }

  const recentTransactions = [...asset.transactions].reverse().slice(0, 5);

  return (
    <section className="dashboard-grid asset-detail-page">
      <AssetHeader asset={asset} />

      <div className="asset-performance-grid">
        <article className="metric-card">
          <p className="metric-label">Last price</p>
          <p className="metric-value">
            {asset.marketData.lastPrice == null
              ? "Waiting"
              : formatCurrency(asset.marketData.lastPrice, {
                  currency: asset.instrument.currency,
                  maximumFractionDigits: 4
                })}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Average cost</p>
          <p className="metric-value">
            {formatOptionalMoney(asset.position.averageCost, asset.instrument.currency, "No position")}
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

      {asset.dr ? (
        <article className="surface-card">
          <div className="chart-card-header">
            <div>
              <p className="panel-title">DR parent comparison</p>
              <h2 className="section-title">
                {asset.dr.underlyingSymbol
                  ? `${asset.instrument.symbol} implied ${asset.dr.underlyingSymbol} price`
                  : "Parent-share equivalent price"}
              </h2>
            </div>
          </div>

          <div className="asset-performance-grid">
            <article className="metric-card">
              <p className="metric-label">Implied parent price</p>
              <p className="metric-value">
                {asset.dr.impliedParentPrice == null || asset.dr.underlyingCurrency == null
                  ? "Not available"
                  : formatCurrency(asset.dr.impliedParentPrice, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Average parent-equivalent cost</p>
              <p className="metric-value">
                {asset.dr.averageImpliedParentCost == null || asset.dr.underlyingCurrency == null
                  ? "Not available"
                  : formatCurrency(asset.dr.averageImpliedParentCost, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Premium/discount</p>
              <p
                className={`metric-value${
                  asset.dr.premiumDiscount == null
                    ? ""
                    : asset.dr.premiumDiscount < 0
                      ? " value-positive"
                      : asset.dr.premiumDiscount > 0
                        ? " value-negative"
                        : ""
                }`}
              >
                {formatOptionalPercent(asset.dr.premiumDiscount)}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Parent market price</p>
              <p className="metric-value">
                {asset.dr.parentMarketPrice == null || asset.dr.underlyingCurrency == null
                  ? "Waiting"
                  : formatCurrency(asset.dr.parentMarketPrice, {
                      currency: asset.dr.underlyingCurrency
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
              <strong>{asset.dr.drRatio == null ? "Not set" : formatQuantity(asset.dr.drRatio)}</strong>
            </div>
            <div className="dr-step">
              <span className="route-caption">÷ FX</span>
              <strong>{asset.dr.fxRate == null ? "Waiting for FX" : formatQuantity(asset.dr.fxRate)}</strong>
            </div>
            <div className="dr-step">
              <span className="route-caption">= implied parent</span>
              <strong>
                {asset.dr.impliedParentPrice == null || asset.dr.underlyingCurrency == null
                  ? "Not available"
                  : formatCurrency(asset.dr.impliedParentPrice, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </strong>
            </div>
          </div>
        </article>
      ) : null}

      <div className="asset-layout">
        <DeferredAssetPriceChart asset={asset} />

        <aside className="feature-stack">
          <article className="surface-card asset-sidebar-card">
            <p className="panel-title">Position data</p>
            <dl className="detail-list">
              <div>
                <dt>Quantity held</dt>
                <dd>
                  {asset.position.hasOpenPosition ? formatQuantity(asset.position.quantity) : "No position"}
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
                          currency: asset.dr.underlyingCurrency
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
      </div>

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
                  <th scope="col" className="table-heading-number">Quantity</th>
                  <th scope="col" className="table-heading-number">Price</th>
                  <th scope="col" className="table-heading-number">Fee</th>
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
                        maximumFractionDigits: 4
                      })}
                    </td>
                    <td className="table-number">{formatCurrency(transaction.fee, { currency: asset.instrument.currency })}</td>
                    <td className="table-notes">{transaction.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
