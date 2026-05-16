import Link from "next/link";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { HoldingsAllocationChart } from "@/components/holdings-allocation-chart";
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
const DEFAULT_DISPLAY_CURRENCY = "THB";

function formatAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "No cached data";
  }

  if (minutes < 1) {
    return "Just updated";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDateLabel(value: string | null) {
  if (value == null) {
    return "No cache";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatDashboardMoney(
  value: number | null,
  currency: string | null,
  fallback = formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY })
) {
  if (value == null) {
    return fallback;
  }

  return formatCurrency(value, { currency: currency ?? DEFAULT_DISPLAY_CURRENCY });
}

function formatSummaryMoney(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl"
) {
  const value = summary[key];

  if (value != null) {
    return formatCurrency(value, {
      currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY
    });
  }

  if (summary.currencyBreakdown.length > 1) {
    return "Mixed";
  }

  if (summary.openPositionCount === 0) {
    return formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY });
  }

  return "Pending";
}

function formatRealizedMoney(summary: DashboardSummary) {
  if (summary.totalRealizedPnl != null) {
    return formatCurrency(summary.totalRealizedPnl, {
      currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY
    });
  }

  return summary.realizedBreakdown.length > 1
    ? "Mixed"
    : formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY });
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
    const quotesLabel = quoteCount == null ? "" : `${quoteCount} quotes updated`;
    const providerLabel = refreshedAt ? `Provider timestamp ${refreshedAt}` : "";
    const issuesLabel =
      issueCount == null || issueCount === "0" ? "" : `${issueCount} symbols still need review`;

    return {
      tone: issueCount != null && issueCount !== "0" ? "warning" : "success",
      title:
        issueCount != null && issueCount !== "0"
          ? "Market data updated with warnings"
          : "Market data updated",
      body: [quotesLabel, providerLabel, issuesLabel].filter(Boolean).join(" | ")
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: "Market data refresh failed",
      body: message ?? "The dashboard is still using the latest cached prices."
    } as const;
  }

  return null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { summary, holdingsSnapshot, marketData, timeline } = await getDashboardSnapshot();
  const resolvedSearchParams = (await searchParams) ?? {};
  const refreshMessage = buildRefreshMessage(resolvedSearchParams);
  const leadingHoldings = holdingsSnapshot.holdings.slice(0, 5);
  const marketCurrency = summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY;
  const marketValueLabel = formatDashboardMoney(summary.totalMarketValue, marketCurrency);
  const latestPriceLabel = formatDateLabel(marketData.latestMarketDataAsOf);
  const priceFreshnessLabel = marketData.latestMarketDataAsOf
    ? marketData.isPriceDataStale
      ? `Stale ${formatAgeLabel(marketData.priceAgeMinutes)}`
      : formatAgeLabel(marketData.priceAgeMinutes)
    : "No price cache";

  const metrics = [
    {
      label: "Cost basis",
      value: formatSummaryMoney(summary, "totalCostBasis"),
      detail: summary.openPositionCount === 0 ? "No positions" : "Open positions only"
    },
    {
      label: "Unrealized P&L",
      value: formatSummaryMoney(summary, "totalUnrealizedPnl"),
      detail: "vs cost basis",
      tone: getValueTone(summary.totalUnrealizedPnl)
    },
    {
      label: "Realized P&L",
      value: formatRealizedMoney(summary),
      detail: "Closed trades",
      tone: getValueTone(summary.totalRealizedPnl)
    },
    {
      label: "Fees",
      value: formatDashboardMoney(holdingsSnapshot.totalFees, marketCurrency),
      detail: "All transactions"
    }
  ];

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Dashboard</h1>
        </div>

        <form action="/api/market-data/refresh" method="post" className="refresh-form">
          <input type="hidden" name="redirectTo" value="/" />
          <button type="submit" className="primary-button">
            Refresh prices
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
            <p className="metric-detail">
              {summary.openPositionCount === 0
                ? "No positions"
                : `${summary.openPositionCount} positions`}
            </p>
          </div>
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
            benchmarkCurrency={timeline.benchmarkCurrency}
            comparisonBasis={timeline.comparisonBasis}
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
                <p className="eyebrow">Prices</p>
                <h2 className="side-card-title">Coverage</h2>
              </div>
              <span className="state-pill state-pill-muted">{priceFreshnessLabel}</span>
            </div>

            <div className="compact-stat-grid">
              <div>
                <span>Priced</span>
                <strong>{summary.pricedPositionCount}</strong>
              </div>
              <div>
                <span>Missing</span>
                <strong>{summary.missingPricePositionCount}</strong>
              </div>
              <div>
                <span>Closed</span>
                <strong>{holdingsSnapshot.closedPositionCount}</strong>
              </div>
              <div>
                <span>Latest cache</span>
                <strong>{latestPriceLabel}</strong>
              </div>
            </div>

            <form action="/api/market-data/refresh" method="post" className="refresh-form">
              <input type="hidden" name="redirectTo" value="/" />
              <button type="submit" className="secondary-button">
                Update market data
              </button>
            </form>
          </article>

          <article className="surface-card holdings-preview-card">
            <div className="side-card-header">
              <div>
                <p className="eyebrow">Holdings</p>
                <h2 className="side-card-title">Open positions</h2>
              </div>
              <Link href="/holdings" className="route-link">
                View all
              </Link>
            </div>

            {leadingHoldings.length === 0 ? (
              <div className="empty-panel">
                <strong>No open positions</strong>
              </div>
            ) : (
              <>
                <HoldingsAllocationChart holdings={holdingsSnapshot.holdings} />

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
              </>
            )}
          </article>
        </aside>
      </section>
    </section>
  );
}
