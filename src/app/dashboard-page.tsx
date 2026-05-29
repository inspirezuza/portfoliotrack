import {
  DashboardMainCharts,
  DashboardMarketBenchmarksSection,
} from "@/components/dashboard-page/charts-sections";
import {
  formatAgeLabel,
  formatCacheDateParts,
  formatDashboardMoney,
  formatNetInvestedDetail,
  formatRealizedMoney,
  formatSummaryMoney,
  formatUnrealizedPnlDetail,
  getValueTone,
} from "@/components/dashboard-page/formatting";
import { DashboardHoldingsPreviewCard } from "@/components/dashboard-page/holdings-preview-card";
import { DashboardHoldingsSection } from "@/components/dashboard-page/holdings-section";
import { DashboardPriceHealthCard } from "@/components/dashboard-page/price-health-card";
import { redirect } from "next/navigation";
import { appendSearchParams, buildRefreshMessage } from "@/components/dashboard-page/refresh";
import { MarketRefreshStatus } from "@/components/market-refresh-status";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioDashboardPath, parsePortfolioRouteKey } from "@/lib/portfolio/paths";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getServerUiLanguage } from "@/lib/ui/server";
import { getUiLocale } from "@/lib/ui/translations";
import { getDashboardOverview } from "@/server/dashboard";

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

const DEFAULT_DISPLAY_CURRENCY = "THB";

export default async function DashboardPage({ portfolioKey, searchParams }: DashboardPageProps) {
  // These reads are independent; collapse their latency instead of awaiting in series.
  const [language, isAdmin, resolvedSearchParams, { portfolios, selectedPortfolio }] =
    await Promise.all([
      getServerUiLanguage(),
      isAdminAuthenticated(),
      Promise.resolve(searchParams).then((value) => value ?? {}),
      getPortfolioSelection({ portfolioKey }),
    ]);
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const selectedPortfolioDashboardPath = appendSearchParams(
    getPortfolioDashboardPath(selectedPortfolio.key),
    resolvedSearchParams,
  );

  if (portfolioKey != null) {
    const routePortfolioKey = parsePortfolioRouteKey(portfolioKey);

    if (routePortfolioKey !== selectedPortfolio.key) {
      redirect(selectedPortfolioDashboardPath);
    }

    // The remembered-selection cookie is persisted by the proxy (src/proxy.ts)
    // on this same response, so no extra redirect through
    // /api/portfolio-selection is needed.
  }

  const isAggregatePortfolio = isAllPortfoliosSelection(selectedPortfolio);
  const selectedPortfolioName = isAggregatePortfolio
    ? copy.shell.allPortfolios
    : selectedPortfolio.name;
  const dashboardScope = isAggregatePortfolio
    ? { portfolioIds: portfolios.map((portfolio) => portfolio.id) }
    : { portfolioId: selectedPortfolio.id };
  // Only the above-the-fold overview is awaited here; the heavy chart payload
  // streams in via <DashboardMainCharts> / <DashboardMarketBenchmarksSection>.
  const { summary, holdingsSnapshot, marketData, performanceSummary } =
    await getDashboardOverview(dashboardScope);
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
        <DashboardMainCharts
          scope={dashboardScope}
          language={language}
          performanceSummary={performanceSummary}
        />

        <aside className="workstation-side-stack">
          <DashboardPriceHealthCard
            closedPositionCount={holdingsSnapshot.closedPositionCount}
            copy={copy}
            latestMarketDataAsOf={marketData.latestMarketDataAsOf}
            latestPriceLabel={latestPriceLabel}
            missingPricePositionCount={summary.missingPricePositionCount}
            pricedPositionCount={summary.pricedPositionCount}
            priceFreshnessLabel={priceFreshnessLabel}
            refreshRedirectPath={getPortfolioDashboardPath(selectedPortfolio.key)}
            showRefresh={isAdmin && !isAggregatePortfolio}
          />

          <DashboardHoldingsPreviewCard
            copy={copy}
            holdings={holdingsSnapshot.holdings}
            language={language}
            leadingHoldings={leadingHoldings}
            locale={locale}
            openPositionCount={holdingsSnapshot.openPositionCount}
          />
        </aside>
      </section>

      <DashboardMarketBenchmarksSection scope={dashboardScope} language={language} />

      <DashboardHoldingsSection
        canEdit={isAdmin}
        canRefresh={isAdmin && !isAggregatePortfolio}
        copy={copy}
        holdingsSnapshot={holdingsSnapshot}
        language={language}
        locale={locale}
        selectedPortfolioName={selectedPortfolioName}
        summary={summary}
      />
    </section>
  );
}
