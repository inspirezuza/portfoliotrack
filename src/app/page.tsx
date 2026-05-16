import Link from "next/link";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { PortfolioChart } from "@/components/portfolio-chart";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { getDashboardSnapshot, type DashboardSummary } from "@/server/dashboard";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    refresh?: string;
    eventAt?: string;
    refreshedAt?: string;
    quoteCount?: string;
    issueCount?: string;
    message?: string;
  }>;
};

type RefreshParams = NonNullable<DashboardPageProps["searchParams"]> extends Promise<infer T>
  ? T
  : never;

const REFRESH_BANNER_MAX_AGE_MINUTES = 5;

function formatAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "ยังไม่มีข้อมูลในแคช";
  }

  if (minutes < 1) {
    return "อัปเดตเมื่อสักครู่";
  }

  if (minutes < 60) {
    return `${minutes} นาทีที่แล้ว`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} ชั่วโมงที่แล้ว`;
}

function formatDateLabel(value: string | null) {
  if (value == null) {
    return "ยังไม่มีแคช";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatDashboardMoney(
  value: number | null,
  currency: string | null,
  fallback = "รอราคา"
) {
  if (value == null) {
    return fallback;
  }

  return formatCurrency(value, { currency: currency ?? "USD" });
}

function formatSummaryMoney(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl"
) {
  const value = summary[key];

  if (value != null) {
    return formatCurrency(value, { currency: summary.openPositionCurrency ?? "USD" });
  }

  if (summary.currencyBreakdown.length > 1) {
    return "หลายสกุลเงิน";
  }

  return "รอราคา";
}

function formatRealizedMoney(summary: DashboardSummary) {
  if (summary.totalRealizedPnl != null) {
    return formatCurrency(summary.totalRealizedPnl, {
      currency: summary.realizedBreakdown[0]?.currency ?? "USD"
    });
  }

  return summary.realizedBreakdown.length > 1 ? "หลายสกุลเงิน" : "$0.00";
}

function getValueTone(value: number | null) {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function buildRefreshMessage({
  refresh,
  eventAt,
  refreshedAt,
  quoteCount,
  issueCount,
  message
}: RefreshParams) {
  const eventAgeMinutes = (() => {
    if (eventAt == null) {
      return null;
    }

    const timestamp = Date.parse(eventAt);

    if (Number.isNaN(timestamp)) {
      return null;
    }

    return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  })();

  if (
    refresh == null ||
    eventAgeMinutes == null ||
    eventAgeMinutes > REFRESH_BANNER_MAX_AGE_MINUTES
  ) {
    return null;
  }

  if (refresh === "success") {
    const quotesLabel = quoteCount == null ? "" : `อัปเดตราคาแล้ว ${quoteCount} รายการ`;
    const providerLabel = refreshedAt ? `ข้อมูลล่าสุดจาก provider: ${refreshedAt}` : "";
    const issuesLabel =
      issueCount == null || issueCount === "0"
        ? ""
        : `ยังมี ${issueCount} symbol ที่ต้องตรวจต่อ`;

    return {
      tone: issueCount != null && issueCount !== "0" ? "warning" : "success",
      title:
        issueCount != null && issueCount !== "0"
          ? "รีเฟรชสำเร็จ แต่ยังมีบางรายการขาดข้อมูล"
          : "รีเฟรชข้อมูลตลาดแล้ว",
      body: [quotesLabel, providerLabel, issuesLabel].filter(Boolean).join(" · ")
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: "รีเฟรชไม่สำเร็จ",
      body: message ?? "แดชบอร์ดยังใช้ข้อมูลแคชล่าสุดอยู่"
    } as const;
  }

  return null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { summary, holdingsSnapshot, marketData, timeline } = await getDashboardSnapshot();
  const resolvedSearchParams = (await searchParams) ?? {};
  const refreshMessage = buildRefreshMessage(resolvedSearchParams);
  const leadingHoldings = holdingsSnapshot.holdings.slice(0, 5);
  const marketCurrency = summary.openPositionCurrency ?? "USD";
  const marketValueLabel = formatDashboardMoney(summary.totalMarketValue, marketCurrency, "$0.00");
  const latestPriceLabel = formatDateLabel(marketData.latestMarketDataAsOf);
  const priceFreshnessLabel = marketData.latestMarketDataAsOf
    ? marketData.isPriceDataStale
      ? `แคชเก่า ${formatAgeLabel(marketData.priceAgeMinutes)}`
      : formatAgeLabel(marketData.priceAgeMinutes)
    : "รอข้อมูลราคา";

  const metrics = [
    {
      label: "ต้นทุน",
      value: formatSummaryMoney(summary, "totalCostBasis"),
      detail: summary.openPositionCount === 0 ? "ยังไม่มี position" : "เฉพาะสถานะที่ยังเปิด"
    },
    {
      label: "Unrealized P&L",
      value: formatSummaryMoney(summary, "totalUnrealizedPnl"),
      detail: "เทียบกับต้นทุน",
      tone: getValueTone(summary.totalUnrealizedPnl)
    },
    {
      label: "Realized P&L",
      value: formatRealizedMoney(summary),
      detail: "จากรายการขาย",
      tone: getValueTone(summary.totalRealizedPnl)
    },
    {
      label: "ค่าธรรมเนียม",
      value: formatDashboardMoney(holdingsSnapshot.totalFees, marketCurrency, "$0.00"),
      detail: "รวมทุก transaction"
    }
  ];

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">Portfolio workspace</p>
          <h1>ภาพรวมพอร์ต</h1>
          <p>
            อ่านสถานะหลักในจอเดียว: มูลค่า, P&amp;L, ความสดของราคา, benchmark และหุ้นที่ถือ
          </p>
        </div>

        <form action="/api/market-data/refresh" method="post" className="refresh-form">
          <input type="hidden" name="redirectTo" value="/" />
          <button type="submit" className="primary-button">
            รีเฟรชราคา
          </button>
        </form>
      </div>

      {refreshMessage ? (
        <article className={`status-banner status-banner-${refreshMessage.tone}`}>
          <div>
            <p className="status-banner-title">{refreshMessage.title}</p>
            <p className="status-banner-copy">{refreshMessage.body}</p>
          </div>
        </article>
      ) : null}

      <section className="workstation-metrics" aria-label="Portfolio summary">
        <article className="metric-card metric-card-hero">
          <div>
            <p className="metric-label">Portfolio value</p>
            <p className="metric-value metric-value-xl">{marketValueLabel}</p>
          </div>
          <span className="state-pill">
            {summary.openPositionCount === 0
              ? "ยังไม่มี position"
              : `${summary.openPositionCount} positions`}
          </span>
        </article>

        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <p className="metric-label">{metric.label}</p>
            <p
              className={`metric-value ${
                metric.tone === "positive"
                  ? "value-positive"
                  : metric.tone === "negative"
                    ? "value-negative"
                    : ""
              }`}
            >
              {metric.value}
            </p>
            <p className="metric-detail">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="workstation-grid">
        <div className="workstation-main-stack">
          <BenchmarkChart
            benchmarkSymbol={timeline.benchmarkSymbol}
            portfolioCurrency={timeline.portfolioCurrency}
            series={timeline.comparison}
            status={timeline.status}
          />

          <PortfolioChart
            currency={timeline.portfolioCurrency}
            series={timeline.portfolio}
            status={timeline.status}
          />
        </div>

        <aside className="workstation-side-stack">
          <article className="surface-card price-health-card">
            <div className="side-card-header">
              <div>
                <p className="eyebrow">ข้อมูลราคา</p>
                <h2 className="side-card-title">Price coverage</h2>
              </div>
              <span className="state-pill state-pill-muted">{priceFreshnessLabel}</span>
            </div>

            <div className="compact-stat-grid">
              <div>
                <span>มีราคา</span>
                <strong>{summary.pricedPositionCount}</strong>
              </div>
              <div>
                <span>ขาดราคา</span>
                <strong>{summary.missingPricePositionCount}</strong>
              </div>
              <div>
                <span>ปิดแล้ว</span>
                <strong>{holdingsSnapshot.closedPositionCount}</strong>
              </div>
              <div>
                <span>แคชล่าสุด</span>
                <strong>{latestPriceLabel}</strong>
              </div>
            </div>

            <form action="/api/market-data/refresh" method="post" className="refresh-form">
              <input type="hidden" name="redirectTo" value="/" />
              <button type="submit" className="secondary-button">
                อัปเดตราคาตลาด
              </button>
            </form>
          </article>

          <article className="surface-card holdings-preview-card">
            <div className="side-card-header">
              <div>
                <p className="eyebrow">หุ้นที่ถือ</p>
                <h2 className="side-card-title">Open positions</h2>
              </div>
              <Link href="/holdings" className="route-link">
                ดูทั้งหมด
              </Link>
            </div>

            {leadingHoldings.length === 0 ? (
              <div className="empty-panel">
                <strong>ยังไม่มีหุ้นในพอร์ต</strong>
                <p>เพิ่มรายการซื้อขายแรกเพื่อเริ่ม tracking position, DR และต้นทุน</p>
              </div>
            ) : (
              <ul className="holding-bars">
                {leadingHoldings.map((holding) => (
                  <li key={holding.instrumentId}>
                    <div className="holding-bar-row">
                      <div>
                        <Link
                          href={`/assets/${encodeURIComponent(holding.symbol)}`}
                          className="holding-symbol"
                        >
                          {holding.symbol}
                        </Link>
                        <span>{holding.displayName}</span>
                      </div>
                      <strong>
                        {holding.portfolioWeight == null
                          ? formatQuantity(holding.quantity)
                          : formatPercentRatio(holding.portfolioWeight, {
                              maximumFractionDigits: 0,
                              minimumFractionDigits: 0
                            })}
                      </strong>
                    </div>
                    <div className="holding-bar-track">
                      <span
                        style={{
                          width:
                            holding.portfolioWeight == null
                              ? "18%"
                              : `${Math.min(100, Math.max(3, holding.portfolioWeight * 100))}%`
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="surface-card action-card">
            <p className="eyebrow">Next step</p>
            <h2 className="side-card-title">อยากอัปเดตอะไรต่อ?</h2>
            <div className="action-list">
              <Link href="/transactions" className="action-link">
                เพิ่มรายการซื้อขาย
              </Link>
              <Link href="/holdings" className="action-link">
                ดูต้นทุนและ P&amp;L รายหุ้น
              </Link>
            </div>
          </article>
        </aside>
      </section>
    </section>
  );
}
