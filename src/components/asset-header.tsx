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
          กลับไปหน้าหุ้นที่ถือ
        </Link>
        <p className="eyebrow">Asset detail</p>
        <h1>
          {asset.instrument.symbol}
          <span className="asset-title-muted"> {asset.instrument.displayName}</span>
        </h1>
        <p>
          {asset.instrument.market} · {asset.instrument.instrumentType} · {asset.instrument.currency}
          . ใช้ราคาจาก provider symbol{" "}
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
            ? "มี position พร้อมต้นทุนเฉลี่ย"
            : "พร้อมดูข้อมูลก่อนเริ่มซื้อขาย"}
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
            {asset.position.hasOpenPosition ? "จำนวนคงเหลือ" : "รายการที่บันทึก"}
          </p>
        </article>

        <article className="metric-card">
          <p className="metric-value">
            {asset.marketData.lastPrice == null
              ? "รอราคา"
              : formatCurrency(asset.marketData.lastPrice, {
                  currency: asset.instrument.currency,
                  maximumFractionDigits: 4
                })}
          </p>
          <p className="metric-label">
            {asset.marketData.lastPriceAsOf == null
              ? "ยังไม่มีราคาล่าสุด"
              : `ราคาล่าสุด ${asset.marketData.lastPriceAsOf}`}
          </p>
        </article>

        <article className="metric-card">
          <p className="metric-value">
            {formatOptionalMoney(
              asset.position.marketValue,
              asset.instrument.currency,
              asset.position.hasOpenPosition ? "รอราคา" : "ไม่มี position"
            )}
          </p>
          <p className="metric-label">มูลค่าปัจจุบัน</p>
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
              asset.position.hasOpenPosition ? "รอราคา" : "ไม่มี position"
            )}
          </p>
          <p className="metric-label">
            กำไร/ขาดทุนที่ยังไม่ขาย{unrealizedPercent == null ? "" : ` (${unrealizedPercent})`}
          </p>
        </article>
      </div>
    </article>
  );
}
