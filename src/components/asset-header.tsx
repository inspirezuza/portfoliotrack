import Link from "next/link";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import type { AssetDetail } from "@/server/assets";

type AssetHeaderProps = {
  asset: AssetDetail;
};

function formatOptionalMoney(value: number | null, currency: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  return formatCurrency(value, { currency });
}

function formatUnrealizedPercent(asset: AssetDetail) {
  if (
    asset.position.unrealizedPnl == null ||
    asset.position.totalCost == null ||
    asset.position.totalCost <= 0
  ) {
    return null;
  }

  return formatPercentRatio(asset.position.unrealizedPnl / asset.position.totalCost);
}

export function AssetHeader({ asset }: AssetHeaderProps) {
  const unrealizedPercent = formatUnrealizedPercent(asset);

  return (
    <article className="hero-card asset-hero">
      <div className="hero-copy">
        <Link href="/holdings" className="route-link">
          Back to holdings
        </Link>
        <p className="eyebrow">Asset detail</p>
        <h1>
          {asset.instrument.symbol}
          <span className="asset-title-muted"> {asset.instrument.displayName}</span>
        </h1>
        <p>
          {asset.instrument.market} listing, {asset.instrument.instrumentType.toLowerCase()} security,
          tracked in {asset.instrument.currency}. Price history comes from the provider symbol{" "}
          <a
            href={asset.instrument.providerHistoryUrl}
            target="_blank"
            rel="noreferrer"
            className="route-link"
          >
            {asset.instrument.providerSymbol}
          </a>
          .
        </p>
        <span className="feature-accent">
          {asset.position.hasOpenPosition
            ? "Open position with average-cost context"
            : "Research view ready before the first trade"}
        </span>
      </div>

      <div className="hero-stats">
        <article className="metric-card">
          <p className="metric-value">
            {asset.position.hasOpenPosition
              ? formatQuantity(asset.position.quantity)
              : asset.position.tradeCount.toString()}
          </p>
          <p className="metric-label">
            {asset.position.hasOpenPosition ? "Open quantity" : "Recorded trades"}
          </p>
        </article>

        <article className="metric-card">
          <p className="metric-value">
            {asset.marketData.lastPrice == null
              ? "Awaiting quote"
              : formatCurrency(asset.marketData.lastPrice, {
                  currency: asset.instrument.currency,
                  maximumFractionDigits: 4
                })}
          </p>
          <p className="metric-label">
            {asset.marketData.lastPriceAsOf == null
              ? "No cached quote yet"
              : `Latest quote as of ${asset.marketData.lastPriceAsOf}`}
          </p>
        </article>

        <article className="metric-card">
          <p className="metric-value">
            {formatOptionalMoney(
              asset.position.marketValue,
              asset.instrument.currency,
              asset.position.hasOpenPosition ? "Awaiting price" : "No open position"
            )}
          </p>
          <p className="metric-label">Current market value</p>
        </article>

        <article className="metric-card">
          <p
            className={`metric-value${
              asset.position.unrealizedPnl == null
                ? ""
                : asset.position.unrealizedPnl > 0
                  ? " value-positive"
                  : asset.position.unrealizedPnl < 0
                    ? " value-negative"
                    : ""
            }`}
          >
            {formatOptionalMoney(
              asset.position.unrealizedPnl,
              asset.instrument.currency,
              asset.position.hasOpenPosition ? "Awaiting price" : "No open position"
            )}
          </p>
          <p className="metric-label">
            Unrealized P&amp;L{unrealizedPercent == null ? "" : ` (${unrealizedPercent})`}
          </p>
        </article>
      </div>
    </article>
  );
}
