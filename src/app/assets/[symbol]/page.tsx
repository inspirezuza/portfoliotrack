import { notFound } from "next/navigation";
import { AssetHeader } from "@/components/asset-header";
import { AssetPriceChart } from "@/components/asset-price-chart";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { getAssetDetail } from "@/server/assets";

export const dynamic = "force-dynamic";

type AssetDetailPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

function formatPriceAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "ยังไม่มีข้อมูลอายุราคา";
  }

  if (minutes < 1) {
    return "เพิ่งอัปเดต";
  }

  if (minutes < 60) {
    return `${minutes} นาทีที่แล้ว`;
  }

  return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
}

function formatOptionalMoney(value: number | null, currency: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  return formatCurrency(value, { currency });
}

function formatOptionalPercent(value: number | null) {
  if (value == null) {
    return "ยังคำนวณไม่ได้";
  }

  return formatPercentRatio(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function getDrIssueMessage(issue: string | null) {
  if (issue == null) {
    return "ข้อมูล DR พร้อมใช้สำหรับเทียบกับหุ้นแม่";
  }

  if (issue.includes("FX")) {
    return "ยังไม่มีอัตราแลกเปลี่ยนสำหรับคำนวณราคาเทียบหุ้นแม่";
  }

  if (issue.includes("parent")) {
    return "ยังไม่มีราคาหุ้นแม่สำหรับเทียบ premium/discount";
  }

  if (issue.includes("metadata")) {
    return "ข้อมูล DR ยังไม่ครบสำหรับคำนวณราคาเทียบหุ้นแม่";
  }

  return "ข้อมูล DR บางส่วนยังไม่พร้อม ระบบจะแสดงเท่าที่คำนวณได้";
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { symbol } = await params;
  const asset = await getAssetDetail(symbol);

  if (asset == null) {
    notFound();
  }

  const recentTransactions = [...asset.transactions].reverse().slice(0, 5);

  return (
    <section className="dashboard-grid asset-detail-page">
      <AssetHeader asset={asset} />

      <div className="asset-performance-grid">
        <article className="metric-card">
          <p className="metric-label">ต้นทุนเฉลี่ย</p>
          <p className="metric-value">
            {formatOptionalMoney(asset.position.averageCost, asset.instrument.currency, "ไม่มี position")}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">ต้นทุนรวม</p>
          <p className="metric-value">
            {formatOptionalMoney(asset.position.totalCost, asset.instrument.currency, "ไม่มี position")}
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
          <p className="metric-label">ค่าธรรมเนียมรวม</p>
          <p className="metric-value">
            {formatCurrency(asset.position.totalFees, { currency: asset.instrument.currency })}
          </p>
        </article>
      </div>

      {asset.dr ? (
        <article className="surface-card">
          <div className="chart-card-header">
            <div>
              <p className="panel-title">DR เทียบหุ้นแม่</p>
              <h2 className="section-title">
                {asset.dr.underlyingSymbol
                  ? `${asset.instrument.symbol} เหมือนซื้อ ${asset.dr.underlyingSymbol} ที่ราคาเท่าไร`
                  : "คำนวณราคาเทียบหุ้นแม่"}
              </h2>
            </div>
            <p className="surface-copy">{getDrIssueMessage(asset.dr.analyticsIssue)}</p>
          </div>

          <div className="asset-performance-grid">
            <article className="metric-card">
              <p className="metric-label">เหมือนซื้อหุ้นแม่ที่</p>
              <p className="metric-value">
                {asset.dr.impliedParentPrice == null || asset.dr.underlyingCurrency == null
                  ? "ยังคำนวณไม่ได้"
                  : formatCurrency(asset.dr.impliedParentPrice, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">ต้นทุนเทียบหุ้นแม่</p>
              <p className="metric-value">
                {asset.dr.averageImpliedParentCost == null || asset.dr.underlyingCurrency == null
                  ? "ยังคำนวณไม่ได้"
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
              <p className="metric-label">ราคาหุ้นแม่</p>
              <p className="metric-value">
                {asset.dr.parentMarketPrice == null || asset.dr.underlyingCurrency == null
                  ? "รอราคา"
                  : formatCurrency(asset.dr.parentMarketPrice, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </p>
            </article>
          </div>

          <div className="dr-formula-grid">
            <div className="dr-step">
              <span className="route-caption">ราคา DR</span>
              <strong>
                {formatOptionalMoney(asset.marketData.lastPrice, asset.instrument.currency, "รอราคา")}
              </strong>
            </div>
            <div className="dr-step">
              <span className="route-caption">x DR ต่อหุ้นแม่</span>
              <strong>{asset.dr.drRatio == null ? "ไม่ระบุ" : formatQuantity(asset.dr.drRatio)}</strong>
            </div>
            <div className="dr-step">
              <span className="route-caption">÷ FX</span>
              <strong>{asset.dr.fxRate == null ? "รอ FX" : formatQuantity(asset.dr.fxRate)}</strong>
            </div>
            <div className="dr-step">
              <span className="route-caption">= implied parent</span>
              <strong>
                {asset.dr.impliedParentPrice == null || asset.dr.underlyingCurrency == null
                  ? "ยังคำนวณไม่ได้"
                  : formatCurrency(asset.dr.impliedParentPrice, {
                      currency: asset.dr.underlyingCurrency
                    })}
              </strong>
            </div>
          </div>
        </article>
      ) : null}

      <div className="asset-layout">
        <AssetPriceChart asset={asset} />

        <aside className="feature-stack">
          <article className="surface-card asset-sidebar-card">
            <p className="panel-title">ข้อมูล position</p>
            <dl className="detail-list">
              <div>
                <dt>จำนวนคงเหลือ</dt>
                <dd>
                  {asset.position.hasOpenPosition
                    ? formatQuantity(asset.position.quantity)
                    : "ไม่มี position"}
                </dd>
              </div>
              <div>
                <dt>จำนวนรายการ</dt>
                <dd>{asset.position.tradeCount}</dd>
              </div>
              <div>
                <dt>ซื้อครั้งแรก</dt>
                <dd>{asset.position.firstTradeDate ?? "ยังไม่มีรายการ"}</dd>
              </div>
              <div>
                <dt>รายการล่าสุด</dt>
                <dd>{asset.position.lastTradeDate ?? "ยังไม่มีรายการ"}</dd>
              </div>
              <div>
                <dt>ราคาอัปเดต</dt>
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
                  <dd>{asset.dr.underlyingSymbol ?? "ไม่ระบุ"}</dd>
                </div>
                <div>
                  <dt>DR ratio</dt>
                  <dd>
                    {asset.dr.drRatio == null
                      ? "ไม่ระบุ"
                      : `${formatQuantity(asset.dr.drRatio)} DR = 1 ${
                          asset.dr.underlyingSymbol ?? "หุ้นแม่"
                        }`}
                  </dd>
                </div>
                <div>
                  <dt>สกุลเงิน DR</dt>
                  <dd>{asset.instrument.currency}</dd>
                </div>
                <div>
                  <dt>สกุลเงินหุ้นแม่</dt>
                  <dd>{asset.dr.underlyingCurrency ?? "ไม่ระบุ"}</dd>
                </div>
                <div>
                  <dt>FX source</dt>
                  <dd>{asset.dr.fxProviderSymbol ?? "ไม่ระบุ"}</dd>
                </div>
              </dl>
            </article>
          ) : null}

          <article className="surface-card asset-sidebar-card">
            <p className="insight-title">เช็กความคุ้มของ DR</p>
            {asset.dr ? (
              <dl className="detail-list">
                <div>
                  <dt>ซื้อแพงกว่าหุ้นแม่ไหม</dt>
                  <dd>{formatOptionalPercent(asset.dr.premiumDiscount)}</dd>
                </div>
                <div>
                  <dt>ต้นทุนเทียบหุ้นแม่</dt>
                  <dd>
                    {asset.dr.averageImpliedParentCost == null || asset.dr.underlyingCurrency == null
                      ? "ยังคำนวณไม่ได้"
                      : formatCurrency(asset.dr.averageImpliedParentCost, {
                          currency: asset.dr.underlyingCurrency
                        })}
                  </dd>
                </div>
                <div>
                  <dt>DR ตามหุ้นแม่ทันไหม</dt>
                  <dd>
                    {asset.dr.parentMarketPrice == null || asset.dr.impliedParentPrice == null
                      ? "รอข้อมูล"
                      : "เทียบได้แล้ว"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="surface-copy">หุ้นนี้ไม่ใช่ DR จึงไม่ต้องคำนวณราคาเทียบหุ้นแม่</p>
            )}
          </article>
        </aside>
      </div>

      <article className="surface-card">
        <div className="transaction-panel-header">
          <div>
            <p className="panel-title">ประวัติรายการของหุ้นนี้</p>
            <p className="surface-copy">รายการล่าสุดที่ใช้คำนวณ position และต้นทุนเฉลี่ย</p>
          </div>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="transaction-empty-state">
            <p>ยังไม่มี transaction สำหรับหุ้นนี้</p>
          </div>
        ) : (
          <div className="transaction-table-wrap">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th scope="col">วันที่</th>
                  <th scope="col">ประเภท</th>
                  <th scope="col">จำนวน</th>
                  <th scope="col">ราคา</th>
                  <th scope="col">ค่าธรรมเนียม</th>
                  <th scope="col">หมายเหตุ</th>
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
                    <td>{formatQuantity(transaction.quantity)}</td>
                    <td>
                      {formatCurrency(transaction.price, {
                        currency: asset.instrument.currency,
                        maximumFractionDigits: 4
                      })}
                    </td>
                    <td>{formatCurrency(transaction.fee, { currency: asset.instrument.currency })}</td>
                    <td>{transaction.notes ?? "-"}</td>
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
