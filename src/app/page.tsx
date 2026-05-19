import Link from "next/link";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { HoldingsAllocationChart } from "@/components/holdings-allocation-chart";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { PortfolioChart } from "@/components/portfolio-chart";
import { formatCurrency, formatPercentRatio, formatQuantity } from "@/lib/format";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection } from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getUiLocale } from "@/lib/ui/translations";
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

type DashboardCopy = ReturnType<typeof getUiCopy>["dashboard"];
type SharedCopy = ReturnType<typeof getUiCopy>["shared"];

const REFRESH_BANNER_MAX_AGE_MINUTES = 5;
const DEFAULT_DISPLAY_CURRENCY = "THB";

function formatAgeLabel(minutes: number | null, copy: DashboardCopy) {
  if (minutes == null) {
    return copy.age.noCachedData;
  }

  if (minutes < 1) {
    return copy.age.justUpdated;
  }

  if (minutes < 60) {
    return copy.age.minutesAgo(minutes);
  }

  return copy.age.hoursAgo(Math.floor(minutes / 60));
}

function formatDateLabel(value: string | null, locale: string, emptyLabel: string) {
  if (value == null) {
    return emptyLabel;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatDashboardMoney(
  value: number | null,
  currency: string | null,
  locale: string,
  fallback = formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale })
) {
  if (value == null) {
    return fallback;
  }

  return formatCurrency(value, { currency: currency ?? DEFAULT_DISPLAY_CURRENCY, locale });
}

function formatSummaryMoney(
  summary: DashboardSummary,
  key: "totalCostBasis" | "totalMarketValue" | "totalUnrealizedPnl",
  locale: string,
  sharedCopy: SharedCopy
) {
  const value = summary[key];

  if (value != null) {
    return formatCurrency(value, {
      currency: summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY,
      locale
    });
  }

  if (summary.currencyBreakdown.length > 1) {
    return sharedCopy.mixed;
  }

  if (summary.openPositionCount === 0) {
    return formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale });
  }

  return sharedCopy.pending;
}

function formatRealizedMoney(summary: DashboardSummary, locale: string, sharedCopy: SharedCopy) {
  if (summary.totalRealizedPnl != null) {
    return formatCurrency(summary.totalRealizedPnl, {
      currency: summary.realizedBreakdown[0]?.currency ?? DEFAULT_DISPLAY_CURRENCY,
      locale
    });
  }

  return summary.realizedBreakdown.length > 1
    ? sharedCopy.mixed
    : formatCurrency(0, { currency: DEFAULT_DISPLAY_CURRENCY, locale });
}

function getValueTone(value: number | null) {
  if (value == null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function buildRefreshMessage(
  { refresh, eventAt, refreshedAt, quoteCount, issueCount, message }: RefreshParams,
  copy: DashboardCopy
) {
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
    const quotesLabel = quoteCount == null ? "" : copy.refresh.quotesUpdated(quoteCount);
    const providerLabel = refreshedAt ? copy.refresh.providerTimestamp(refreshedAt) : "";
    const issuesLabel =
      issueCount == null || issueCount === "0" ? "" : copy.refresh.symbolsNeedReview(issueCount);

    return {
      tone: issueCount != null && issueCount !== "0" ? "warning" : "success",
      title:
        issueCount != null && issueCount !== "0"
          ? copy.refresh.warningTitle
          : copy.refresh.successTitle,
      body: [quotesLabel, providerLabel, issuesLabel].filter(Boolean).join(" | ")
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: copy.refresh.errorTitle,
      body: message ?? copy.refresh.fallbackErrorBody
    } as const;
  }

  return null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const language = await getServerUiLanguage();
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const isAdmin = await isAdminAuthenticated();
  const { selectedPortfolio } = await getPortfolioSelection();
  const { summary, holdingsSnapshot, marketData, timeline } = await getDashboardSnapshot({
    portfolioId: selectedPortfolio.id,
    ensureFresh: false
  });
  const resolvedSearchParams = (await searchParams) ?? {};
  const refreshMessage = buildRefreshMessage(resolvedSearchParams, copy.dashboard);
  const leadingHoldings = holdingsSnapshot.holdings.slice(0, 5);
  const marketCurrency = summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY;
  const marketValueLabel = formatDashboardMoney(summary.totalMarketValue, marketCurrency, locale);
  const latestPriceLabel = formatDateLabel(
    marketData.latestMarketDataAsOf,
    locale,
    copy.dashboard.noPriceCache
  );
  const priceFreshnessLabel = marketData.latestMarketDataAsOf
    ? marketData.isPriceDataStale
      ? copy.dashboard.stale(formatAgeLabel(marketData.priceAgeMinutes, copy.dashboard))
      : formatAgeLabel(marketData.priceAgeMinutes, copy.dashboard)
    : copy.dashboard.noPriceCache;

  const metrics = [
    {
      label: copy.dashboard.costBasis,
      value: formatSummaryMoney(summary, "totalCostBasis", locale, copy.shared),
      detail:
        summary.openPositionCount === 0 ? copy.shared.noPositions : copy.dashboard.openPositionsOnly
    },
    {
      label: copy.dashboard.unrealizedPnl,
      value: formatSummaryMoney(summary, "totalUnrealizedPnl", locale, copy.shared),
      detail: copy.dashboard.vsCostBasis,
      tone: getValueTone(summary.totalUnrealizedPnl)
    },
    {
      label: copy.dashboard.realizedPnl,
      value: formatRealizedMoney(summary, locale, copy.shared),
      detail: copy.dashboard.closedTrades,
      tone: getValueTone(summary.totalRealizedPnl)
    },
    {
      label: copy.dashboard.fees,
      value: formatDashboardMoney(holdingsSnapshot.totalFees, marketCurrency, locale),
      detail: copy.dashboard.allTransactions
    }
  ];

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.dashboard.workspace}</p>
          <h1>{copy.dashboard.title}</h1>
          <p>{selectedPortfolio.name}</p>
        </div>

        {isAdmin ? (
          <form action="/api/market-data/refresh" method="post" className="refresh-form">
            <input type="hidden" name="redirectTo" value="/" />
            <PendingSubmitButton className="primary-button" pendingLabel={copy.dashboard.refreshing}>
              {copy.dashboard.refreshPrices}
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>

      {refreshMessage ? (
        <article className={`status-banner status-banner-${refreshMessage.tone}`}>
          <div>
            <p className="status-banner-title">{refreshMessage.title}</p>
            <p className="status-banner-copy">{refreshMessage.body}</p>
          </div>
        </article>
      ) : null}

      <section className="workstation-metrics" aria-label={copy.dashboard.portfolioSummary}>
        <article className="metric-card metric-card-hero">
          <div>
            <p className="metric-label">{copy.dashboard.portfolioValue}</p>
            <p className="metric-value metric-value-xl">{marketValueLabel}</p>
            <p className="metric-detail">
              {summary.openPositionCount === 0
                ? copy.shared.noPositions
                : copy.shared.positionCount(summary.openPositionCount)}
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
            language={language}
            portfolioCurrency={timeline.portfolioCurrency}
            series={timeline.comparison}
            status={timeline.status}
          />

          <PortfolioChart
            currency={timeline.portfolioCurrency}
            language={language}
            series={timeline.portfolio}
            status={timeline.status}
          />
        </div>

        <aside className="workstation-side-stack">
          <article className="surface-card price-health-card">
            <div className="side-card-header">
              <div>
                <p className="eyebrow">{copy.dashboard.prices}</p>
                <h2 className="side-card-title">{copy.dashboard.coverage}</h2>
              </div>
              <span className="state-pill state-pill-muted">{priceFreshnessLabel}</span>
            </div>

            <div className="compact-stat-grid">
              <div>
                <span>{copy.dashboard.priced}</span>
                <strong>{summary.pricedPositionCount}</strong>
              </div>
              <div>
                <span>{copy.dashboard.missing}</span>
                <strong>{summary.missingPricePositionCount}</strong>
              </div>
              <div>
                <span>{copy.dashboard.closed}</span>
                <strong>{holdingsSnapshot.closedPositionCount}</strong>
              </div>
              <div>
                <span>{copy.dashboard.latestCache}</span>
                <strong>{latestPriceLabel}</strong>
              </div>
            </div>

            {isAdmin ? (
              <form action="/api/market-data/refresh" method="post" className="refresh-form">
                <input type="hidden" name="redirectTo" value="/" />
                <PendingSubmitButton className="secondary-button" pendingLabel={copy.dashboard.refreshing}>
                  {copy.dashboard.updateMarketData}
                </PendingSubmitButton>
              </form>
            ) : null}
          </article>

          <article className="surface-card holdings-preview-card">
            <div className="side-card-header">
              <div>
                <p className="eyebrow">{copy.dashboard.holdings}</p>
                <h2 className="side-card-title">{copy.dashboard.openPositions}</h2>
              </div>
              <Link href="/holdings" className="route-link">
                {copy.dashboard.viewAll}
              </Link>
            </div>

            {leadingHoldings.length === 0 ? (
              <div className="empty-panel">
                <strong>{copy.shared.noOpenPositions}</strong>
              </div>
            ) : (
              <>
                <HoldingsAllocationChart holdings={holdingsSnapshot.holdings} language={language} />

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
                            ? formatQuantity(holding.quantity, { locale })
                            : formatPercentRatio(holding.portfolioWeight, {
                                locale,
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
