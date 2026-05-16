import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/asset-header";
import { AssetPriceChart } from "@/components/asset-price-chart";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { getAssetDetail } from "@/server/assets";

export const dynamic = "force-dynamic";

type AssetDetailPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

function formatPriceAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "No cached quote age yet";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} old`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} old`;
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { symbol } = await params;
  const asset = await getAssetDetail(symbol);

  if (asset == null) {
    notFound();
  }

  return (
    <section className="dashboard-grid asset-detail-page">
      <AssetHeader asset={asset} />

      <div className="asset-layout">
        <AssetPriceChart asset={asset} />

        <aside className="feature-stack">
          <article className="surface-card asset-sidebar-card">
            <p className="eyebrow">Position snapshot</p>
            <h2 className="section-title">Ledger context</h2>
            <dl className="detail-list">
              <div>
                <dt>Open quantity</dt>
                <dd>
                  {asset.position.hasOpenPosition
                    ? formatQuantity(asset.position.quantity)
                    : "No open position"}
                </dd>
              </div>
              <div>
                <dt>Average cost</dt>
                <dd>
                  {asset.position.averageCost == null
                    ? "No open position"
                    : formatCurrency(asset.position.averageCost, {
                        currency: asset.instrument.currency,
                        maximumFractionDigits: 4
                      })}
                </dd>
              </div>
              <div>
                <dt>Total cost basis</dt>
                <dd>
                  {asset.position.totalCost == null
                    ? "No open position"
                    : formatCurrency(asset.position.totalCost, {
                        currency: asset.instrument.currency
                      })}
                </dd>
              </div>
              <div>
                <dt>Recorded trades</dt>
                <dd>{asset.position.tradeCount}</dd>
              </div>
              <div>
                <dt>First trade date</dt>
                <dd>{asset.position.firstTradeDate ?? "No trades yet"}</dd>
              </div>
              <div>
                <dt>Last trade date</dt>
                <dd>{asset.position.lastTradeDate ?? "No trades yet"}</dd>
              </div>
              <div>
                <dt>Total realized P&amp;L</dt>
                <dd>{formatCurrency(asset.position.realizedPnl, { currency: asset.instrument.currency })}</dd>
              </div>
              <div>
                <dt>Total fees</dt>
                <dd>{formatCurrency(asset.position.totalFees, { currency: asset.instrument.currency })}</dd>
              </div>
            </dl>
          </article>

          <article className="feature-card">
            <p className="eyebrow">Quote freshness</p>
            <h3>Provider snapshot</h3>
            <p>
              {asset.marketData.lastPriceAsOf == null
                ? "Latest quote has not been cached yet for this symbol, so price-driven fields stay pending instead of guessed."
                : `Latest quote captured at ${asset.marketData.lastPriceAsOf} from ${asset.marketData.lastPriceSource ?? "the market data provider"}.`}
            </p>
            <p className="route-caption">
              {asset.marketData.isPriceDataStale
                ? `Snapshot is older than the ${asset.marketData.marketRefreshMinutes}-minute refresh target. The dashboard refresh control can request a newer cache.`
                : `Snapshot age: ${formatPriceAgeLabel(asset.marketData.priceAgeMinutes)}.`}
            </p>
          </article>

          <article className="feature-card">
            <p className="eyebrow">History coverage</p>
            <h3>Daily bars for charting</h3>
            <p>
              {asset.marketData.historyStatus === "full"
                ? `Cached ${asset.marketData.priceHistory.length} daily closes from ${asset.marketData.requestedHistoryStartDate} through ${asset.marketData.latestHistoryDate}.`
                : asset.marketData.historyStatus === "partial"
                  ? `Cached ${asset.marketData.priceHistory.length} daily closes from ${asset.marketData.firstHistoryDate} through ${asset.marketData.latestHistoryDate}. Earlier bars before ${asset.marketData.firstHistoryDate} were not available from the provider for this request window.`
                  : asset.marketData.historyUnavailableReason ??
                    "Daily price history is unavailable right now, so the chart stays empty instead of implying missing bars."}
            </p>
            <p className="route-caption">
              Source:{" "}
              <a
                href={asset.instrument.providerHistoryUrl}
                target="_blank"
                rel="noreferrer"
                className="route-link"
              >
                {asset.instrument.providerSymbol}
              </a>
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
