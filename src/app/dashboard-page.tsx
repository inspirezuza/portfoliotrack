import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DeferredBenchmarkChart,
  DeferredHoldingsAllocationChart,
  DeferredHoldingsTable,
  DeferredMarketBenchmarks,
  DeferredPortfolioChart,
} from "@/components/dashboard-deferred-widgets";
import {
  formatAgeLabel,
  formatCacheDateLabel,
  formatCacheDateParts,
  formatDashboardMoney,
  formatNetInvestedDetail,
  formatRealizedMoney,
  formatSummaryMoney,
  formatUnrealizedPnlDetail,
  getValueTone,
} from "@/components/dashboard-page/formatting";
import { MarketRefreshStatus } from "@/components/market-refresh-status";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SummaryCards } from "@/components/summary-cards";
import { formatPercentRatio, formatQuantity } from "@/lib/format";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import {
  getPortfolioDashboardPath,
  getPortfolioSelectionMemoryPath,
  parsePortfolioRouteKey,
} from "@/lib/portfolio/paths";
import {
  getPortfolioSelection,
  getRememberedPortfolioKey,
  isAllPortfoliosSelection,
} from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getUiLocale } from "@/lib/ui/translations";
import { getDashboardSnapshot } from "@/server/dashboard";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  portfolioKey?: string | null;
  searchParams?: Promise<{
    refresh?: string;
    eventAt?: string;
    refreshedAt?: string;
    quoteCount?: string;
    issueCount?: string;
    message?: string;
    runId?: string;
  }>;
};

type RefreshParams =
  NonNullable<DashboardPageProps["searchParams"]> extends Promise<infer T> ? T : never;

type DashboardCopy = ReturnType<typeof getUiCopy>["dashboard"];
const REFRESH_BANNER_MAX_AGE_MINUTES = 5;
const DEFAULT_DISPLAY_CURRENCY = "THB";

function buildRefreshMessage(
  { refresh, eventAt, refreshedAt, quoteCount, issueCount, message }: RefreshParams,
  copy: DashboardCopy,
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
      body: [quotesLabel, providerLabel, issuesLabel].filter(Boolean).join(" | "),
    } as const;
  }

  if (refresh === "started" || refresh === "already-running") {
    return {
      tone: "success",
      title: copy.refresh.startedTitle,
      body: copy.refresh.statusLoading,
    } as const;
  }

  if (refresh === "error") {
    return {
      tone: "warning",
      title: copy.refresh.errorTitle,
      body: message ?? copy.refresh.fallbackErrorBody,
    } as const;
  }

  return null;
}

function appendSearchParams(path: string, searchParams: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export default async function DashboardPage({ portfolioKey, searchParams }: DashboardPageProps) {
  const language = await getServerUiLanguage();
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const isAdmin = await isAdminAuthenticated();
  const resolvedSearchParams = (await searchParams) ?? {};
  const { portfolios, selectedPortfolio } = await getPortfolioSelection({ portfolioKey });
  const selectedPortfolioDashboardPath = appendSearchParams(
    getPortfolioDashboardPath(selectedPortfolio.key),
    resolvedSearchParams,
  );

  if (portfolioKey != null) {
    const routePortfolioKey = parsePortfolioRouteKey(portfolioKey);

    if (routePortfolioKey !== selectedPortfolio.key) {
      redirect(selectedPortfolioDashboardPath);
    }

    const rememberedPortfolioKey = await getRememberedPortfolioKey();

    if (rememberedPortfolioKey !== selectedPortfolio.key) {
      redirect(
        getPortfolioSelectionMemoryPath(selectedPortfolio.key, selectedPortfolioDashboardPath),
      );
    }
  }

  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const selectedPortfolioName = isAggregatePortfolio
    ? copy.shell.allPortfolios
    : selectedPortfolio.name;
  const {
    summary,
    benchmarkWatchlist,
    holdingsSnapshot,
    marketData,
    performanceSummary,
    timeline,
  } = await getDashboardSnapshot({
    ...(isAggregatePortfolio
      ? { portfolioIds: portfolios.map((portfolio) => portfolio.id) }
      : { portfolioId: selectedPortfolio.id }),
    ensureFresh: false,
  });
  const refreshMessage = buildRefreshMessage(resolvedSearchParams, copy.dashboard);
  const refreshRunId = (() => {
    const runId = Number(resolvedSearchParams.runId);

    return Number.isInteger(runId) && runId > 0 ? runId : null;
  })();
  const leadingHoldings = [...holdingsSnapshot.holdings]
    .sort((left, right) => (right.portfolioWeight ?? 0) - (left.portfolioWeight ?? 0))
    .slice(0, 5);
  const marketCurrency = summary.openPositionCurrency ?? DEFAULT_DISPLAY_CURRENCY;
  const marketValueLabel = formatSummaryMoney(summary, "totalMarketValue", locale, copy.shared);
  const latestPriceLabel = formatCacheDateParts(
    marketData.latestMarketDataAsOf,
    locale,
    copy.dashboard.noPriceCache,
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
        summary.openPositionCount === 0
          ? copy.shared.noPositions
          : copy.dashboard.openPositionsOnly,
    },
    {
      label: copy.dashboard.unrealizedPnl,
      value: formatSummaryMoney(summary, "totalUnrealizedPnl", locale, copy.shared),
      detail: formatUnrealizedPnlDetail(summary, locale, copy.dashboard),
      tone: getValueTone(summary.totalUnrealizedPnl),
    },
    {
      label: copy.dashboard.realizedPnl,
      value: formatRealizedMoney(summary, locale, copy.shared),
      detail: formatNetInvestedDetail({
        fallback: copy.dashboard.closedTrades,
        label: copy.charts.benchmark.absoluteSummary.netInvested,
        locale,
        netInvested: performanceSummary.netInvested,
        signed: true,
        value: summary.totalRealizedPnl,
      }),
      tone: getValueTone(summary.totalRealizedPnl),
    },
    {
      label: copy.dashboard.fees,
      value: formatDashboardMoney(holdingsSnapshot.totalFees, marketCurrency, locale),
      detail: formatNetInvestedDetail({
        fallback: copy.dashboard.allTransactions,
        label: copy.charts.benchmark.absoluteSummary.netInvested,
        locale,
        netInvested: performanceSummary.netInvested,
        value: holdingsSnapshot.totalFees,
      }),
    },
  ];

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">{copy.dashboard.workspace}</p>
          <h1>{copy.dashboard.title}</h1>
          <p>{selectedPortfolioName}</p>
        </div>

        {isAdmin && !isAggregatePortfolio ? (
          <form action="/api/market-data/refresh" method="post" className="refresh-form">
            <input
              type="hidden"
              name="redirectTo"
              value={getPortfolioDashboardPath(selectedPortfolio.key)}
            />
            <PendingSubmitButton
              className="primary-button"
              pendingLabel={copy.dashboard.refreshing}
            >
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

      {refreshRunId != null && !isAggregatePortfolio ? (
        <MarketRefreshStatus language={language} runId={refreshRunId} />
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
          <DeferredBenchmarkChart
            benchmarkOverlays={benchmarkWatchlist.overlays}
            benchmarkQuotes={benchmarkWatchlist.quotes}
            benchmarkSymbol={timeline.benchmarkSymbol}
            benchmarkCurrency={timeline.benchmarkCurrency}
            comparisonBasis={timeline.comparisonBasis}
            language={language}
            performanceSeries={timeline.performanceSeries}
            performanceSummary={performanceSummary}
            portfolioCurrency={timeline.portfolioCurrency}
            status={timeline.status}
          />

          <DeferredPortfolioChart
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
                <strong className="cache-date-stack">
                  <span>{latestPriceLabel.date}</span>
                  {latestPriceLabel.time == null ? null : (
                    <time dateTime={marketData.latestMarketDataAsOf ?? undefined}>
                      {latestPriceLabel.time}
                    </time>
                  )}
                </strong>
              </div>
            </div>

            {isAdmin && !isAggregatePortfolio ? (
              <form action="/api/market-data/refresh" method="post" className="refresh-form">
                <input
                  type="hidden"
                  name="redirectTo"
                  value={getPortfolioDashboardPath(selectedPortfolio.key)}
                />
                <PendingSubmitButton
                  className="secondary-button"
                  pendingLabel={copy.dashboard.refreshing}
                >
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
              <span className="state-pill state-pill-muted">
                {copy.shared.positionCount(holdingsSnapshot.openPositionCount)}
              </span>
            </div>

            {leadingHoldings.length === 0 ? (
              <div className="empty-panel">
                <strong>{copy.shared.noOpenPositions}</strong>
              </div>
            ) : (
              <>
                <DeferredHoldingsAllocationChart
                  holdings={holdingsSnapshot.holdings}
                  language={language}
                />

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
                                minimumFractionDigits: 0,
                              })}
                        </strong>
                      </div>
                      <div className="holding-bar-track">
                        <span
                          style={{
                            width:
                              holding.portfolioWeight == null
                                ? "18%"
                                : `${Math.min(100, Math.max(3, holding.portfolioWeight * 100))}%`,
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

      <DeferredMarketBenchmarks
        language={language}
        monthlyReturns={benchmarkWatchlist.monthlyReturns}
        quotes={benchmarkWatchlist.quotes}
      />

      <section className="dashboard-holdings-section" aria-labelledby="dashboard-holdings-title">
        <div className="dashboard-holdings-header">
          <div>
            <p className="eyebrow">{copy.holdings.pageEyebrow}</p>
            <h2 id="dashboard-holdings-title" className="section-title">
              {copy.holdings.pageTitle}
            </h2>
          </div>
          <span className="state-pill state-pill-muted">{selectedPortfolioName}</span>
        </div>

        <section
          className="asset-performance-grid dashboard-holdings-status"
          aria-label={copy.holdings.statusLabel}
        >
          <article className="metric-card dashboard-status-card">
            <p className="metric-value">{holdingsSnapshot.openPositionCount}</p>
            <p className="metric-label">{copy.holdings.open}</p>
          </article>
          <article className="metric-card dashboard-status-card">
            <p className="metric-value">{holdingsSnapshot.pricedPositionCount}</p>
            <p className="metric-label">{copy.holdings.priced}</p>
          </article>
          <article className="metric-card dashboard-status-card">
            <p className="metric-value">{holdingsSnapshot.missingPricePositionCount}</p>
            <p className="metric-label">{copy.holdings.missing}</p>
          </article>
          <article className="metric-card dashboard-status-card">
            <p className="metric-value metric-value-compact">
              {formatCacheDateLabel(holdingsSnapshot.latestPriceAsOf, locale, copy.shared.noCache)}
            </p>
            <p className="metric-label">{copy.holdings.latestCache}</p>
          </article>
        </section>

        <DeferredHoldingsTable
          holdings={holdingsSnapshot.holdings}
          language={language}
          canEdit={isAdmin}
          canRefresh={isAdmin && !isAggregatePortfolio}
        />

        <SummaryCards language={language} summary={summary} />
      </section>
    </section>
  );
}
