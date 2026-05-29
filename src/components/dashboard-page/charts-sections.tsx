import { Suspense } from "react";
import {
  DeferredBenchmarkChart,
  DeferredMarketBenchmarks,
  DeferredPortfolioChart,
} from "@/components/dashboard-deferred-widgets";
import { getDashboardCharts, type DashboardPerformanceSummary } from "@/server/dashboard";
import type { UiLanguage } from "@/lib/ui/translations";

type DashboardScope = {
  portfolioId?: number;
  portfolioIds?: number[];
};

function ChartSkeleton({ minHeight }: { minHeight: number }) {
  return <div className="loading-skeleton-panel" style={{ minHeight }} aria-hidden="true" />;
}

async function MainChartsContent({
  scope,
  language,
  performanceSummary,
}: {
  scope: DashboardScope;
  language: UiLanguage;
  performanceSummary: DashboardPerformanceSummary;
}) {
  const { benchmarkWatchlist, timeline } = await getDashboardCharts(scope);

  return (
    <>
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
    </>
  );
}

/**
 * Renders the main-column charts. The heavy timeline/benchmark build streams in
 * behind a Suspense boundary so the surrounding overview (metrics, holdings)
 * paints without waiting on it. Requires the route to render dynamically (see
 * the force-dynamic config on the dashboard route) so the boundary streams as a
 * normal pending boundary rather than a postponed one.
 */
export function DashboardMainCharts(props: {
  scope: DashboardScope;
  language: UiLanguage;
  performanceSummary: DashboardPerformanceSummary;
}) {
  return (
    <div className="workstation-main-stack">
      <Suspense
        fallback={
          <>
            <ChartSkeleton minHeight={380} />
            <ChartSkeleton minHeight={300} />
          </>
        }
      >
        <MainChartsContent {...props} />
      </Suspense>
    </div>
  );
}

async function MarketBenchmarksContent({
  scope,
  language,
}: {
  scope: DashboardScope;
  language: UiLanguage;
}) {
  const { benchmarkWatchlist } = await getDashboardCharts(scope);

  return (
    <DeferredMarketBenchmarks
      language={language}
      monthlyReturns={benchmarkWatchlist.monthlyReturns}
      quotes={benchmarkWatchlist.quotes}
    />
  );
}

/** Streams the market-benchmarks widget; shares getDashboardCharts with the main charts. */
export function DashboardMarketBenchmarksSection(props: {
  scope: DashboardScope;
  language: UiLanguage;
}) {
  return (
    <Suspense fallback={<ChartSkeleton minHeight={320} />}>
      <MarketBenchmarksContent {...props} />
    </Suspense>
  );
}
