import Link from "next/link";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { PortfolioChart } from "@/components/portfolio-chart";
import { SummaryCards } from "@/components/summary-cards";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { getDashboardSnapshot } from "@/server/dashboard";

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

const REFRESH_BANNER_MAX_AGE_MINUTES = 5;

function formatAgeLabel(minutes: number | null) {
  if (minutes == null) {
    return "No cached market data yet";
  }

  if (minutes < 1) {
    return "Updated just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} old`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} old`;
}

function buildRefreshMessage({
  refresh,
  eventAt,
  refreshedAt,
  quoteCount,
  issueCount,
  message
}: NonNullable<DashboardPageProps["searchParams"]> extends Promise<infer T> ? T : never) {
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
    const refreshedLabel = refreshedAt ? ` Latest provider snapshot: ${refreshedAt}.` : "";
    const quotesLabel =
      quoteCount == null ? "" : ` ${quoteCount} quote${quoteCount === "1" ? "" : "s"} refreshed.`;
    const issuesLabel =
      issueCount == null || issueCount === "0"
        ? ""
        : ` ${issueCount} symbol${issueCount === "1" ? " needs" : "s need"} follow-up.`;

    return {
      tone: issueCount != null && issueCount !== "0" ? "warning" : "success",
      title:
        issueCount != null && issueCount !== "0"
          ? "Refresh completed with a few gaps."
          : "Market data refreshed.",
      body: `${quotesLabel.trimStart()}${refreshedLabel}${issuesLabel}`.trim()
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: "Refresh did not finish.",
      body: message ?? "The dashboard kept its last cached snapshot."
    } as const;
  }

  return null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { summary, holdingsSnapshot, marketData, timeline } = await getDashboardSnapshot();
  const resolvedSearchParams = (await searchParams) ?? {};
  const leadingHoldings = holdingsSnapshot.holdings.slice(0, 3);
  const refreshMessage = buildRefreshMessage(resolvedSearchParams);
  const hasAnyMarketData = marketData.latestMarketDataAsOf != null;
  const freshnessLabel = hasAnyMarketData
    ? marketData.isPriceDataStale
      ? `Dashboard comparison data is cached ${formatAgeLabel(marketData.priceAgeMinutes)}. A manual refresh can check for newer benchmark and chart inputs when the provider has them.`
      : `Dashboard comparison data is ${formatAgeLabel(marketData.priceAgeMinutes)} for the current portfolio timeline and benchmark view.`
    : "No cached dashboard comparison data yet. The dashboard still shows ledger-derived totals while chart and benchmark inputs catch up.";

  return (
    <section className="dashboard-grid">
      <article className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Portfolio dashboard</p>
          <h1>Portfolio clarity from the transactions you already trust.</h1>
          <p>
            The dashboard now rolls up open positions, cost basis, realized P&amp;L, and timeline
            context from the same transaction-derived holdings model used by the holdings view.
          </p>
          <span className="feature-accent">Read models live, charts included</span>
          <div className="dashboard-refresh-card">
            <div>
              <p className="eyebrow">Market data freshness</p>
              <p className="surface-copy">{freshnessLabel}</p>
            </div>
            <form action="/api/market-data/refresh" method="post" className="refresh-form">
              <input type="hidden" name="redirectTo" value="/" />
              <button type="submit" className="secondary-button">
                Refresh prices
              </button>
            </form>
          </div>
        </div>

        <div className="hero-stats">
          <article className="metric-card">
            <p className="metric-value">{summary.openPositionCount}</p>
            <p className="metric-label">Open positions</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{holdingsSnapshot.closedPositionCount}</p>
            <p className="metric-label">Fully exited positions</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{summary.pricedPositionCount}</p>
            <p className="metric-label">Positions with cached prices</p>
          </article>
          <article className="metric-card">
            <p className="metric-value">{summary.latestPriceAsOf ?? "No cache yet"}</p>
            <p className="metric-label">Latest price snapshot</p>
          </article>
        </div>
      </article>

      {refreshMessage ? (
        <article className={`status-banner status-banner-${refreshMessage.tone}`}>
          <div>
            <p className="status-banner-title">{refreshMessage.title}</p>
            <p className="status-banner-copy">{refreshMessage.body}</p>
          </div>
        </article>
      ) : null}

      <SummaryCards summary={summary} />

      <div className="chart-grid">
        <PortfolioChart
          currency={timeline.portfolioCurrency}
          series={timeline.portfolio}
          status={timeline.status}
        />
        <BenchmarkChart
          benchmarkSymbol={timeline.benchmarkSymbol}
          portfolioCurrency={timeline.portfolioCurrency}
          series={timeline.comparison}
          status={timeline.status}
        />
      </div>

      <div className="section-grid">
        <article className="surface-card">
          <h2 className="section-title">Portfolio pulse</h2>
          <p className="surface-copy">
            {holdingsSnapshot.holdings.length === 0
              ? "No holdings yet. Add transactions to start building live portfolio summaries."
              : "A currency-safe preview of current positions from the same snapshot that powers the holdings page."}
          </p>

          {leadingHoldings.length === 0 ? (
            <div className="transaction-empty-state">
              <p>
                When you record your first buy, this panel will surface a quick preview of current
                positions here.
              </p>
            </div>
          ) : (
            <ul className="surface-list">
              {leadingHoldings.map((holding) => (
                <li key={holding.instrumentId}>
                  <div>
                    <strong>
                      <Link
                        href={`/assets/${encodeURIComponent(holding.symbol)}`}
                        className="route-link"
                      >
                        {holding.symbol}
                      </Link>
                    </strong>
                    <p className="route-caption">
                      {holding.displayName} - {formatQuantity(holding.quantity)} units
                    </p>
                  </div>
                  <div className="portfolio-pulse-metric">
                    <strong>
                      {holding.marketValue == null
                        ? "Awaiting price"
                        : formatCurrency(holding.marketValue, { currency: holding.currency })}
                    </strong>
                    <span className="route-caption">
                      {holding.lastPrice == null
                        ? "Quote still missing from cache"
                        : `Avg ${formatCurrency(holding.averageCost, {
                            currency: holding.currency,
                            maximumFractionDigits: 4
                          })}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <aside className="feature-stack">
          <article className="feature-card">
            <p className="eyebrow">Price coverage</p>
            <h3>Readable before market data arrives</h3>
            <p>
              Missing quotes no longer block the experience. Open cost basis and realized P&amp;L
              stay available, while market-value fields clearly wait for cached prices.
            </p>
          </article>

          <article className="feature-card">
            <p className="eyebrow">Consistency</p>
            <h3>One aggregation path for both views</h3>
            <p>
              Dashboard totals and charts are derived from the same holdings snapshot and historical
              cache that render the table, which keeps open-position math and chart baselines in
              sync by construction.
            </p>
          </article>

          <article className="feature-card">
            <p className="eyebrow">Market data</p>
            <h3>Charts stay honest about freshness</h3>
            <p>
              {marketData.latestMarketDataAsOf == null
                ? "No cached market data exists yet, so the dashboard keeps the ledger visible and leaves quote-driven views clearly pending."
                : marketData.isPriceDataStale
                  ? `Latest market data is older than the ${marketData.marketRefreshMinutes}-minute target. Values shown here come from the last successful cache while a manual refresh checks for newer prices.`
                  : `Latest market data as of ${marketData.latestMarketDataAsOf} is feeding the dashboard charts and benchmark comparison.`}
            </p>
            <p className="route-caption">
              {summary.missingPricePositionCount > 0
                ? `${summary.missingPricePositionCount} holding${summary.missingPricePositionCount === 1 ? " is" : "s are"} still waiting for cached prices.`
                : summary.openPositionCount > 0
                  ? "All open holdings currently have cached prices."
                  : "No open holdings yet."}
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
